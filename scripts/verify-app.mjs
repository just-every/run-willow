// CI divides the same public-door wall between bounded jobs. Local verify runs all.
import { execFileSync } from 'node:child_process'
const shard=process.env.WILLOW_VERIFY_SHARD
if(shard&&!['core','records-people','records-work','records-policy'].includes(shard))throw new Error('Unknown Willow verification shard')
const run=(command,args)=>execFileSync(command,args,{stdio:'inherit',env:process.env})
for(const args of [['check'],['verify-base','--offline'],['verify-base','--record','migrations/base-copies.json','--offline']])run('node',['scripts/edition-authoring/cli.mjs',...args])
run('pnpm',['run','build'])
run('pnpm',['run','typecheck'])
if(!shard||shard==='core')for(const script of ['test:email-link','test:flows','test:phase2'])run('pnpm',['run',script])
if(!shard||shard==='core')run('node',['tests/willow/ai-policy.mjs'])
if(!shard||shard.startsWith('records-'))run('node',['tests/willow/regressions.mjs',...(shard?[shard]:[])])
// CI's browser-journeys job already exercises the entire access suite with browsers.
if(!shard)for(const path of ['tests/willow/levels.mjs','tests/willow/levels-sections.mjs'])run('node',[path])
