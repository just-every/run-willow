// Compatibility entrypoint for callers supplying touched clause ids.
// All document bytes come from the shared Base generator.
import fs from 'node:fs'
import {execFileSync} from 'node:child_process'
import {parseContract} from '../../src/base/seed-contract.mjs'
const [mode,...ids]=process.argv.slice(2)
if(!['write','check'].includes(mode))throw Error('Usage: node scripts/willow/contract-docs.mjs write|check [CLAUSE...]')
const known=new Set(parseContract(fs.readFileSync('CONTRACT.md','utf8')).clauses.map(clause=>clause.id))
for(const id of ids)if(!known.has(id))throw Error('Unknown clause: '+id)
execFileSync(process.execPath,['src/base/contract-docs.mjs',mode],{stdio:'inherit'})
