// CI divides the same public-door wall between bounded jobs. Local verify runs all.
import { execFileSync } from 'node:child_process'
const shard=process.env.WILLOW_VERIFY_SHARD
if(shard&&!['core','records'].includes(shard))throw new Error('Unknown Willow verification shard')
const run=(command,args)=>execFileSync(command,args,{stdio:'inherit',env:process.env})
for(const args of [['check'],['verify-base','--offline'],['verify-base','--record','migrations/base-copies.json','--offline']])run('node',['scripts/edition-authoring/cli.mjs',...args])
run('pnpm',['run','build'])
run('pnpm',['run','typecheck'])
if(!shard||shard==='core')for(const script of ['test:email-link','test:flows','test:phase2'])run('pnpm',['run',script])
if(!shard||shard==='records')run('pnpm',['run','test:regressions'])
// CI's browser-journeys job already exercises the entire access suite with browsers.
if(!shard)run('node',['tests/willow/levels.mjs'])
