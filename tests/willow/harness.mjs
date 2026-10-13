// Runs the built Worker (dist/) with its own local D1 and R2 state in a
// temporary directory, and drives it only through public HTTP doors.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises'
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

export async function harness({ bindings = {}, provider } = {}) {
  const port = await freePort()
  const origin = `http://127.0.0.1:${port}`
  const directory = await mkdtemp(join(tmpdir(), 'willow-flows-'))
  const secret = () => randomBytes(32).toString('base64url')
  const vars = { AUTH_LOCAL: 'true', AUTH_ORIGIN: origin, OWNER_EMAIL: 'owner@example.test', SESSION_SECRET: secret(), SETUP_TOKEN: secret(), MAIL_PROVIDER: 'development', MAIL_FROM: 'auth@localhost.test', RER_DEV_KEY: secret(), ...bindings }
  await writeFile(join(directory, 'local.env'), Object.entries(vars).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 })
  const wrangler = 'node_modules/wrangler/bin/wrangler.js'
  const env = workerEnvironment()
  execFileSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', directory, '--config', 'dist/server/wrangler.json', '--env-file', join(directory, 'local.env')], { stdio: 'ignore', env })
  let output = '', worker, mf, mfOptions, convertOptions
  if (provider) {
    const require = createRequire(import.meta.url)
    const fromWrangler = createRequire(require.resolve('wrangler/package.json'))
    const { Miniflare, convertV4MiniflareOptions } = fromWrangler('miniflare')
    convertOptions = convertV4MiniflareOptions
    const files = ['index.js', ...(await readdir('dist/server/assets')).filter(f=>f.endsWith('.js')).map(f=>'assets/'+f)]
    mfOptions = { name: 'willow-test', modulesRoot: resolve('dist/server'), modules: files.map(f=>({type:'ESModule',path:resolve('dist/server',f)})),
      compatibilityDate: '2026-09-08', compatibilityFlags: ['nodejs_compat'],
      bindings: vars, d1Databases: { DB: 'local-willow-only' }, r2Buckets: { FILES: 'people-willow-files' },
      resourcePersistencePath: join(directory, 'v3'),
      outboundService: provider, host: '127.0.0.1', port,
      assets: { directory: resolve('dist/client'), routerConfig: { has_user_worker: true } },
    }
    mf = new Miniflare(convertOptions(mfOptions))
    await mf.ready
  } else {
    worker = spawn(process.execPath, [wrangler, 'dev', '--config', 'dist/server/wrangler.json', '--inspector-port', '0', '--local', '--persist-to', directory, '--ip', '127.0.0.1', '--port', String(port), '--env-file', join(directory, 'local.env')], { stdio: ['ignore', 'pipe', 'pipe'], env })
    for (const stream of [worker.stdout, worker.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-20_000) })
  }
  const close = async () => {
    if (mf) await mf.dispose()
    if (worker?.exitCode === null) { worker.kill('SIGTERM'); await new Promise(resolve => worker.exitCode !== null ? resolve() : worker.once('exit', resolve)) }
    await rm(directory, { recursive: true, force: true })
  }
  try {
    let ready = false
    for (let attempt = 0; attempt < 240 && !ready; attempt++) {
      if (worker) assert.equal(worker.exitCode, null, 'the Worker stays up')
      try { ready = (await fetch(`${origin}/health`)).ok } catch { await new Promise(resolve => setTimeout(resolve, 250)) }
    }
    assert.ok(ready, 'the Worker became healthy')
  } catch (error) { await close(); throw error }

  const devKey = { 'x-rer-dev-key': vars.RER_DEV_KEY }
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

  /** Signs in through an ordinary email link from the key-gated development outbox. */
  async function signIn(email, { requested = false } = {}) {
    if (!requested) assert.equal((await raw('/auth/magic-link', { body: { email, returnTo: '/app' } })).status, 202)
    const listing = await (await fetch(`${origin}/__dev/outbox`, { headers: devKey })).text()
    for (const match of listing.matchAll(/href="(\/__dev\/outbox\?message=[^"]+)"/g)) {
      const detail = await (await fetch(origin + match[1].replaceAll('&amp;', '&'), { headers: devKey })).text()
      if (!detail.includes(email)) continue
      const link = detail.match(/href="([^"]*\/auth\/confirm\?token=[^"]+)"/)
      if (!link) continue
      const token = new URL(link[1].replaceAll('&amp;', '&'), origin).searchParams.get('token')
      const confirmed = await raw('/auth/confirm', { body: { token } })
      assert.equal(confirmed.status, 303, 'ordinary link confirmation')
      return confirmed.headers.getSetCookie().map(line => line.split(';')[0]).join('; ')
    }
    throw new Error(`no sign-in message for ${email}`)
  }

  const redacted = () => Object.values(vars).reduce((text, value) => text.replaceAll(value, '[redacted]'), output)
  return { origin, vars, raw, setBindings: async changes => { assert.ok(mf); Object.assign(vars, changes); await mf.setOptions(convertOptions({...mfOptions,bindings:vars})) },  api, submit, signIn, close, output: redacted }
}

export const file = (filename, content, type = 'application/octet-stream') => ({ filename, base64: Buffer.from(content).toString('base64'), type })
