// Runs the built Worker (dist/) with its own local D1 and R2 state in a
// temporary directory, and drives it only through public HTTP doors.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile, readdir } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { workerEnvironment } from '../worker-environment.mjs'

async function freePort() {
  const socket = createServer()
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
  const { port } = socket.address()
  await new Promise(resolve => socket.close(resolve))
  return port
}

export async function harness({ bindings = {}, provider, persistTo, port: chosenPort, scheduled = false } = {}) {
  // The fake provider edge runs beside the real production Worker on local TLS.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  const port = chosenPort ?? await freePort()
  const origin = `https://127.0.0.1:${port}`
  const directory = persistTo ?? await mkdtemp(join(tmpdir(), 'willow-flows-'))
  await mkdir(directory, {recursive:true})
  const secret = () => randomBytes(32).toString('base64url')
  const vars = { AUTH_LOCAL: 'false', AUTH_ORIGIN: origin, OWNER_EMAIL: 'owner@example.com', SESSION_SECRET: secret(), SETUP_TOKEN: secret(), MAIL_PROVIDER: 'sendgrid', MAIL_API_KEY: 'test-mail-key', MAIL_FROM: 'auth@localhost.test', RER_DEV_KEY: secret(), ...bindings }
  await writeFile(join(directory, 'local.env'), Object.entries(vars).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 })
  const wrangler = 'node_modules/wrangler/bin/wrangler.js'
  const env = workerEnvironment()
  execFileSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', directory, '--config', 'dist/server/wrangler.json', '--env-file', join(directory, 'local.env')], { stdio: 'ignore', env })
  const links = new Map()
  let mf, mfOptions, convertOptions
  {
    const require = createRequire(import.meta.url)
    const fromWrangler = createRequire(require.resolve('wrangler/package.json'))
    const { Miniflare, convertV4MiniflareOptions } = fromWrangler('miniflare')
    convertOptions = convertV4MiniflareOptions
    const files = ['index.js', ...(await readdir('dist/server/assets')).filter(f=>f.endsWith('.js')).map(f=>'assets/'+f)]
    mfOptions = { unsafeTriggerHandlers: scheduled, name: 'willow-test', modulesRoot: resolve('dist/server'), modules: files.map(f=>({type:'ESModule',path:resolve('dist/server',f)})),
      compatibilityDate: '2026-09-08', compatibilityFlags: ['nodejs_compat'],
      bindings: vars, d1Databases: { DB: 'local-willow-only' }, r2Buckets: { FILES: 'people-willow-files' },
      resourcePersistencePath: join(directory, 'v3'),
      outboundService: async request => {
        if (new URL(request.url).hostname === 'api.sendgrid.com') {
          const message = await request.clone().json()
          for (const content of message.content ?? []) {
            const link = content.value.match(/https?:[^\s"<>]+\/auth\/confirm\?token=[^\s"<>]+/)?.[0]
            if (link) for (const recipient of message.personalizations.flatMap(p => p.to)) links.set(recipient.email, link.replaceAll('&amp;', '&'))
          }
          return provider ? provider(request) : new Response(null, { status: 202 })
        }
        if (provider) return provider(request)
        throw new Error('Unexpected provider request')
      }, host: '127.0.0.1', port, https: true,
      assets: { directory: resolve('dist/client'), routerConfig: { has_user_worker: true } },
    }
    mf = new Miniflare(convertOptions(mfOptions))
    await mf.ready
  }
  const close = async () => {
    if (mf) await mf.dispose()
    if (!persistTo) await rm(directory, { recursive: true, force: true })
  }
  try {
    let ready = false
    for (let attempt = 0; attempt < 240 && !ready; attempt++) {
      try { ready = (await fetch(`${origin}/health`)).ok } catch { await new Promise(resolve => setTimeout(resolve, 250)) }
    }
    assert.ok(ready, 'the Worker became healthy')
  } catch (error) { await close(); throw error }

  const raw = (path, { cookie, body, form, method } = {}) => fetch(origin + path, {
    method: method ?? (body !== undefined || form ? 'POST' : 'GET'), redirect: 'manual',
    headers: { 'CF-Connecting-IP': '127.0.0.1', ...(cookie ? { cookie } : {}), ...(body !== undefined || form ? { origin } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : form,
  })

  /** The JSON door: GET reads a view, a body POSTs an action. Asserts the status and returns the JSON. */
  async function api(path, cookie, body, status = 200) {
    const response = await raw(`/api/willow/${path}`, { cookie, body })
    const text = await response.text()
    assert.equal(response.status, status, `${path}: ${response.status} ${text.slice(0, 300)}`)
    return text ? JSON.parse(text) : null
  }

  /** The HTML form door: returns the redirect target after a 303. */
  async function submit(action, cookie, fields, returnTo = '/app') {
    const form = new FormData()
    form.set('returnTo', returnTo)
    for (const [name, value] of Object.entries(fields)) for (const item of [value].flat()) form.append(name, item)
    const response = await raw(`/app/do/${action}`, { cookie, form })
    assert.equal(response.status, 303, `${action}: ${response.status}`)
    return new URL(response.headers.get('location'), origin)
  }

  /** Provider-edge mail is captured only in this test harness. */
  async function signIn(email, { requested = false } = {}) {
    if (!requested) {
      links.delete(email)
      assert.equal((await raw('/auth/magic-link', { body: { email, returnTo: '/app' } })).status, 202)
    }
    const link = links.get(email)
    if (!link) throw new Error(`no sign-in message for ${email}`)
    const token = new URL(link).searchParams.get('token')
    const confirmed = await raw('/auth/confirm', { body: { token } })
    assert.equal(confirmed.status, 303, 'ordinary link confirmation')
    links.delete(email)
    return confirmed.headers.getSetCookie().map(line => line.split(';')[0]).join('; ')
  }
  async function outstanding(email) {
    links.delete(email)
    await raw('/auth/magic-link', { body: { email } })
    return new URL(links.get(email)).searchParams.get('token')
  }

  const redacted = () => ''
  return { origin, vars, raw, outstanding, setBindings: async changes => { assert.ok(mf); Object.assign(vars, changes); await mf.setOptions(convertOptions({...mfOptions,bindings:vars})) },  api, submit, signIn, close, output: redacted }
}

export const file = (filename, content, type = 'application/octet-stream') => ({ filename, base64: Buffer.from(content).toString('base64'), type })
