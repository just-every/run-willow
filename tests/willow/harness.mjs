// Runs the built Worker (dist/) with its own local D1 and R2 state in a
// temporary directory, and drives it only through public HTTP doors.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile, readdir, readFile, copyFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { workerEnvironment } from '../worker-environment.mjs'

export async function freePort() {
  const socket = createServer()
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
  const { port } = socket.address()
  await new Promise(resolve => socket.close(resolve))
  return port
}

// Wrangler redraws the complete migration table after every file. Drain it
// without a synchronous buffer ceiling; keep only bounded failure diagnostics.
async function wranglerCommand(args, env) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, stdio: ['ignore','pipe','pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-12000) })
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-12000) })
    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (code === 0) return resolve()
      reject(Object.assign(new Error(`Worker database setup failed: exit ${code}, signal ${signal ?? 'none'}`), { stderr: stderr || stdout }))
    })
  })
}

export async function harness({ bindings = {}, transientBindings = {}, provider, persistTo, port: chosenPort, scheduled = false, upgrade } = {}) {
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
  // Upgrade inputs are persisted against the actual historical schema before
  // Wrangler applies the remaining production migrations. No old Worker is faked.
  let upgradeSnapshot
  try {
   if (upgrade) {
    const configPath = resolve('dist/server/wrangler.json')
    const config = JSON.parse(await readFile(configPath, 'utf8'))
    const database = config.d1_databases.find(item => item.binding === 'DB')
    assert.ok(database?.migrations_dir, 'the built Worker declares its production migrations')
    const source = resolve(dirname(configPath), database.migrations_dir)
    const migrations = (await readdir(source)).filter(name => name.endsWith('.sql')).sort()
    assert.ok(migrations.includes(upgrade.before), 'the upgrade boundary is an actual migration')
    const staged = join(directory, 'upgrade-migrations')
    await mkdir(staged)
    const copied = await Promise.allSettled(migrations.filter(name => name < upgrade.before).map(name => copyFile(join(source, name), join(staged, name))))
    for (const result of copied) if (result.status === 'rejected') throw result.reason
    const stagedConfig = join(directory, 'upgrade-wrangler.json')
    await writeFile(stagedConfig, JSON.stringify({ name: config.name, compatibility_date: config.compatibility_date, d1_databases: [{ ...database, migrations_dir: staged }] }))
    const local = ['DB', '--local', '--persist-to', directory, '--config', stagedConfig, '--env-file', join(directory, 'local.env')]
    await wranglerCommand([wrangler, 'd1', 'migrations', 'apply', ...local], env)
    const fixture = join(directory, 'upgrade-fixture.sql')
    await writeFile(fixture, upgrade.sql)
    await wranglerCommand([wrangler, 'd1', 'execute', ...local, '--file', fixture], env)
    const result = execFileSync(process.execPath, [wrangler, 'd1', 'execute', ...local, '--command', upgrade.snapshot, '--json'], { encoding: 'utf8', env })
    upgradeSnapshot = JSON.parse(result).flatMap(item => item.results)
   }
   await wranglerCommand([wrangler, 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', directory, '--config', 'dist/server/wrangler.json', '--env-file', join(directory, 'local.env')], env)
  } catch (error) {
    const diagnostics = error.stderr?.toString() || error.stdout?.toString()
    if (diagnostics) console.error(diagnostics)
    if (!persistTo) await rm(directory, { recursive: true, force: true })
    throw error
  } finally {
    // Wrangler keeps its scratch (.wrangler/tmp) beside the emitted Worker's
    // config; the artifact producer refuses that folder, so leave dist/server
    // as rer build wrote it, even when migration setup fails.
    await rm('dist/server/.wrangler', { recursive: true, force: true })
  }
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
      bindings: { ...vars, ...transientBindings }, d1Databases: { DB: 'local-willow-only' }, r2Buckets: { FILES: 'people-willow-files' },
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
      try {
        const response = await fetch(`${origin}/health`, { headers: { connection: 'close' } })
        ready = response.ok
        await response.arrayBuffer()
      } catch { await new Promise(resolve => setTimeout(resolve, 250)) }
    }
    assert.ok(ready, 'the Worker became healthy')
  } catch (error) { await close(); throw error }

  // Each disposable Worker owns its sockets. Long actions (such as rendering
  // scheduled reports for several recipients) can outlive another pooled
  // socket's idle timeout. Reusing that half-closed socket races its FIN and
  // resets the next assertion. Use a fresh HTTP connection, without retries: a
  // failed request, including a write, must still fail the journey exactly once.
  const raw = (path, { cookie, body, form, method, ip } = {}) => fetch(origin + path, {
    method: method ?? (body !== undefined || form ? 'POST' : 'GET'), redirect: 'manual',
    headers: { connection: 'close', 'CF-Connecting-IP': ip ?? '127.0.0.1', ...(cookie ? { cookie } : {}), ...(body !== undefined || form ? { origin } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
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
  async function signIn(email, { requested = false, ip } = {}) {
    if (!requested) {
      links.delete(email)
      assert.equal((await raw('/auth/magic-link', { body: { email, returnTo: '/app' }, ip })).status, 202)
    }
    const link = links.get(email)
    if (!link) throw new Error(`no sign-in message for ${email}`)
    const token = new URL(link).searchParams.get('token')
    const confirmed = await raw('/auth/confirm', { body: { token }, ip })
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
  return { origin, vars, raw, outstanding, upgradeSnapshot, setBindings: async changes => { assert.ok(mf); Object.assign(vars, changes); await mf.setOptions(convertOptions({...mfOptions,bindings:{...vars,...transientBindings}})) },  api, submit, signIn, close, output: redacted }
}

export const file = (filename, content, type = 'application/octet-stream') => ({ filename, base64: Buffer.from(content).toString('base64'), type })
