// Drives the public `rer` commands of a checkout. Failures show
// the command's output with dev keys and sign-in tokens redacted.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const manifest = '@runeditrun/rer/package.json'
const rer = resolve(dirname(require.resolve(manifest)), require(manifest).bin.rer)

const env = () => ({ ...process.env, WRANGLER_SEND_METRICS: 'false' })
const redact = output => output.replace(/(rer-dev=|token=|RER_DEV_KEY=)[^&\s"']+/g, '$1[redacted]').slice(-4000)

export async function command(root, args, { refuse = false, expectedExit = 0 } = {}) {
  const child = spawn(process.execPath, [rer, ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: env() })
  let output = ''
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk })
  const code = await new Promise(resolve => child.once('exit', resolve))
  if (refuse) assert.notEqual(code, 0, `${args[0]} must refuse`)
  else assert.equal(code, expectedExit, `rer ${args[0]} failed (exit ${code}):\n${redact(output)}`)
  return output
}

/** Starts a managed dev or preview server and waits for RER_READY. */
export async function serving(root, verb, port, extra = []) {
  const child = spawn(process.execPath, [rer, verb, '--foreground', '--port', String(port), ...extra], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: env() })
  let output = ''
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk })
  for (let attempt = 0; attempt < 1200; attempt++) {
    if (child.exitCode !== null) throw new Error(`${verb} stopped before readiness (exit ${child.exitCode}):\n${redact(output)}`)
    if (output.includes('RER_READY')) {
      return {
        output: () => output,
        open: () => output.match(/RER_OPEN (\S+)/)?.[1],
        async stop() {
          await command(root, [verb, '--stop'])
          await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve))
        },
      }
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  child.kill('SIGTERM')
  throw new Error(`${verb} readiness timeout`)
}

export async function devKey(root) {
  return (await readFile(`${root}/.rer/local/dev-key.env`, 'utf8')).trim().split('=')[1]
}

