// Observe the test host before a fresh-start cohort. Run only in run-demo CI.
// Keep admission metadata only: no request headers, cookies, bodies or credentials.
import { writeFile } from 'node:fs/promises';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (account !== 'b20c0ca9cab0c2b70e13d7cf724b89bd') throw Error('Wrong Cloudflare account');
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/willow-demo-test--demo/tails`;
const headers = { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' };
const opened = await fetch(endpoint, { method: 'POST', headers, body: '{}' });
const result = await opened.json();
if (!opened.ok || !result.success) throw Error(`Tail refused: ${opened.status}`);
const tail = result.result, admissions = [];
let socket, interrupted = false, finish;
try {
  socket = new WebSocket(tail.url, 'trace-v1');
  socket.binaryType = 'arraybuffer';
  socket.addEventListener('message', event => {
    const record = JSON.parse(typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data));
    for (const log of record.logs ?? []) for (const message of log.message ?? []) {
      if (typeof message !== 'string' || !message.includes('demo_admitted')) continue;
      const admission = JSON.parse(message);
      admissions.push({ at: log.timestamp, correlation: admission.correlation, agent: admission.agent, network: admission.network });
    }
  });
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(Error('Tail failed')), { once: true }); });
  const started = new Date().toISOString();
  const done = new Promise(resolve => { finish = resolve; });
  const fail = () => { interrupted = true; finish(); };
  socket.addEventListener('close', fail); socket.addEventListener('error', fail);
  const timer = setTimeout(finish, 15 * 60_000);
  console.log('Observing the test host for fifteen minutes without starting visitors.');
  await done; clearTimeout(timer);
  socket.removeEventListener('close', fail); socket.removeEventListener('error', fail);
  await writeFile(process.argv[2], JSON.stringify({ started, ended: new Date().toISOString(), interrupted, admissions, quiet: !interrupted && admissions.length === 0 }, null, 2) + '\n');
  if (interrupted || admissions.length) throw Error(`Quiet window not established: interrupted=${interrupted}, admissions=${admissions.length}`);
  console.log('Quiet window established: no admissions in fifteen minutes.');
} finally {
  socket?.close();
  const removed = await fetch(`${endpoint}/${tail.id}`, { method: 'DELETE', headers });
  if (!removed.ok) throw Error(`Tail cleanup failed: ${removed.status}`);
}
