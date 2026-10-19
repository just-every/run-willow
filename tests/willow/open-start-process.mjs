// Custody follows our private inherited scope, including detached/reparented servers.
import { spawn, execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { createProcessBaseline, createProcessScope, processScopeEnvironment } from '@runeditrun/rer/process-scope'
import { stopOwnedGroup } from '@runeditrun/rer/process-cleanup'
import { readOwnedTree } from '@runeditrun/rer/internal/onboarding/process-tree.mjs'
import { readProcessIdentity, sameProcess } from '@runeditrun/rer/internal/onboarding/process-table.mjs'

const execute = promisify(execFile)
const alive = child => child.exitCode == null && child.signalCode == null

export async function publicStart(cwd, environment) {
  const scope = createProcessScope(await createProcessBaseline()) // Before the first fork.
  const child = spawn('npx', ['-y', '@runeditrun/rer', 'dev', 'just-every/run-willow'], {
    cwd, env: processScopeEnvironment(scope, environment), stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = '', launchError, exited = false, ownership = []
  child.on('error', error => { launchError = error; exited = true })
  child.on('close', () => { exited = true }) // Also drain the finite launcher pipes.
  // Private memory only: RER_OPEN includes a credential. Never forward this stream.
  for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { output = (output + bytes).slice(-131072) })
  const capture = async () => {
    if (!child.pid) return []
    const current = await readOwnedTree(child, ownership, 5000, scope)
    for (const member of current) if (!ownership.some(saved => sameProcess(saved, member))) ownership.push(member)
    if (!ownership.scope) Object.defineProperty(ownership, 'scope', { value: scope })
    return current
  }
  const argv = async member => {
    try {
      if (process.platform === 'linux') return (await readFile(`/proc/${member.pid}/cmdline`, 'utf8')).replaceAll('\0', ' ')
      return (await execute('/bin/ps', ['-p', String(member.pid), '-o', 'command='], { timeout: 5000 })).stdout
    } catch {
      if (sameProcess(member, await readProcessIdentity(member.pid))) throw new Error('Could not classify an owned launch wrapper safely')
      return ''
    }
  }
  const hardStop = async member => {
    if (!sameProcess(member, await readProcessIdentity(member.pid))) return
    try { process.kill(member.pid, 'SIGSTOP') } catch (error) { if (error.code === 'ESRCH') return; throw error }
    try {
      for (let end = Date.now() + 5000; Date.now() < end;) {
        const current = await readProcessIdentity(member.pid)
        if (!sameProcess(member, current) || current.state.startsWith('Z')) return
        if (/^[Tt]/.test(current.state)) { process.kill(member.pid, 'SIGKILL'); return }
        await delay(10)
      }
      throw new Error('Owned launch wrapper did not stop before hard termination')
    } finally {
      const current = await readProcessIdentity(member.pid)
      if (sameProcess(member, current) && /^[Tt]/.test(current.state)) {
        try { process.kill(member.pid, 'SIGCONT') } catch (error) { if (error.code !== 'ESRCH') throw error }
      }
    }
  }
  let stopping
  const stop = () => stopping ??= (async () => {
    if (!child.pid) return
    // repo-command's graceful handler calls a checkout-wide stop. Hard-stop
    // only verified owned wrappers first, including npm's repository delegate.
    // No process name, cwd, port or group membership grants custody.
    for (;;) {
      const current = await capture(), wrappers = []
      for (const member of current) {
        if (member.pid === child.pid && alive(child) || /\b(?:rer(?:\.mjs)?|@runeditrun\/rer)\s+dev\s+just-every\/run-willow(?:\s|$)/.test(await argv(member))) wrappers.push(member)
      }
      if (!wrappers.length) break
      for (const member of wrappers) await hardStop(member)
      await delay(20)
    }
    await capture()
    await stopOwnedGroup(child, 'SIGTERM', ownership)
  })()
  return {
    stop,
    async ready(signal) {
      const deadline = Date.now() + 15 * 60_000
      while (!exited && Date.now() < deadline && !signal.aborted) await delay(100)
      if (signal.aborted || !exited) {
        await stop() // Never signal the launch wrapper gracefully on timeout.
        throw new Error(signal.aborted ? 'Public start cancelled' : 'Public start timed out')
      }
      if (launchError || child.exitCode !== 0) throw new Error(`Public command failed (${launchError?.code ?? child.exitCode}): ${output.slice(-6000)}`)
      const open = output.match(/^RER_OPEN\s+(\S+)/m)?.[1]
      if (!open) throw new Error('Public command exited without a signed-in RER_OPEN link')
      await capture()
      return open
    },
  }
}
