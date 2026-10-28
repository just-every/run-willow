// Synchronize selected legacy acceptance entries from the contract source.
// Unselected prose retains its existing layout during incremental adoption.
import fs from 'node:fs'
import {parseContract} from '../../src/base/seed-contract.mjs'

const [mode,...ids]=process.argv.slice(2)
if(!['write','check'].includes(mode)||!ids.length)throw Error('Usage: node scripts/willow/contract-docs.mjs write|check CLAUSE...')
let source=fs.readFileSync('CONTRACT.md','utf8')
const contract=parseContract(source),lines=source.split('\n')
const clauses=new Map(contract.clauses.map(clause=>[clause.id,clause]))
let acceptance=fs.readFileSync('ACCEPTANCE.md','utf8')
for(const id of ids) {
 const clause=clauses.get(id)
 if(!clause)throw Error('Unknown clause: '+id)
 const heading=lines[clause.line-1],body=[]
 for(let index=clause.line;index<lines.length;index++) {
  if(/^#{2,4} /.test(lines[index]))break
  body.push(lines[index])
 }
 const paragraphs=body.join('\n').trim().split(/\n\s*\n/)
 const row=lines[clause.row-1].split('|').slice(1,-1).map(cell=>cell.trim())
 if(row.length!==6)throw Error('Unsupported table cell: '+id)
 const entry=`- **${id} — ${clause.title}. Status: ${clause.status}.** ${paragraphs[0]}${row[4]?' Current evidence: '+row[4]:''}${row[5]?' Remaining: '+row[5]:''}\n${paragraphs.length>1?'\n'+paragraphs.slice(1).join('\n\n')+'\n':''}\n`
 const start=acceptance.indexOf('- **'+id+' — ')
 if(start<0)throw Error('Missing acceptance entry: '+id)
 const rest=acceptance.slice(start),next=rest.slice(1).search(/\n(?:- \*\*|#{2,3} )/)
 const end=next<0?acceptance.length:start+next+2
 acceptance=acceptance.slice(0,start)+entry+acceptance.slice(end)
}
const counts=contract.counts??Object.fromEntries(['done','partial','missing'].map(status=>[status,contract.clauses.filter(c=>c.status===status).length]))
acceptance=acceptance.replace(/Current clause totals: \*\*\d+ done \/ \d+ partial \/ \d+ missing \(\d+ total\)\*\*/, `Current clause totals: **${counts.done} done / ${counts.partial} partial / ${counts.missing} missing (${contract.clauses.length} total)**`)
const claims='# Willow delivery status\n\nGenerated from CONTRACT.md. Acceptance and delivery scope remain in that source.\n\n| Clause | Title | Status |\n| --- | --- | --- |\n'+contract.clauses.map(clause=>`| ${clause.id} | ${clause.title.replaceAll('/',' and ')} | ${clause.status} |`).join('\n')+'\n'
for(const [file,content] of [['ACCEPTANCE.md',acceptance],['docs/CLAIMS.md',claims]]) {
 if(mode==='write')fs.writeFileSync(file,content)
 else if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==content)throw Error('Stale generated document: '+file)
}
console.log('Contract documents '+mode+': '+ids.join(', '))
