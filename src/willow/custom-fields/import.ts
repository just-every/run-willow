// Typed values are owned history of an imported person, under the person's existing revision fence.
import type { Bindings } from '../../auth.server'
import type { D1Database, D1Sql, TargetRow } from '../../modules/import-kit/src/d1/index'
import { canonicalJson, sha256 } from '../../modules/import-kit/src/provenance/identity'
import { all, insist, now } from '../core'
import type { Input } from '../input'
import { effectiveFieldDefinitions } from './store'
import { isISODate, validateFieldValue } from './validate'
import type { FieldValueRow } from './types'

const columns=['corrects_id','definition_version_id','effective_from','field_id','id','origin','person_id','recorded_at','recorded_by','revision','sequence','value_json'] as const
const sql=(sql:string,...params:unknown[]):D1Sql=>({sql,params})
const schema=(values:FieldValueRow[],latest:Map<string,string>)=>[...new Set(values.map(v=>v.field_id))].sort().map(fieldId=>({fieldId,definitionVersionId:latest.get(fieldId)!}))
export function customImportValue(values:FieldValueRow[],latest:Map<string,string>):Record<string,string> {
  if(!values.length) return {}
  return {customHistoryJson:canonicalJson([...values].sort((a,b)=>a.id.localeCompare(b.id))),customSchemaJson:canonicalJson(schema(values,latest))}
}
export async function customImportInventory(db:D1Database) {
  const values=(await db.prepare("SELECT * FROM wl_custom_field_values WHERE origin='import' ORDER BY id").all<FieldValueRow>()).results
  const versions=(await db.prepare('SELECT field_id,id FROM wl_custom_field_versions ORDER BY version DESC').all<{field_id:string;id:string}>()).results
  const latest=new Map<string,string>(); for(const v of versions) if(!latest.has(v.field_id)) latest.set(v.field_id,v.id)
  return {values,latest}
}
export async function customImportSource(env:Bindings,input:Input,date:string) {
  const effectiveFrom=input.text('customEffectiveFrom',{optional:true,max:10})||date
  insist(isISODate(effectiveFrom),'invalid_custom_effective_date')
  const definitions=(await effectiveFieldDefinitions(env,effectiveFrom)).filter(d=>!d.retired)
  const inventory=await customImportInventory(env.DB as unknown as D1Database)
  const prior=await all<FieldValueRow>(env,'SELECT * FROM wl_custom_field_values ORDER BY effective_from DESC,sequence DESC')
  const carry:Record<string,string>={customEffectiveFrom:effectiveFrom}
  const columnFor=(key:string)=>{
    const name=input.text(`customColumn_${key}`,{optional:true,max:200})||`custom:${key}`
    if(input.has(`customColumn_${key}`)) carry[`customColumn_${key}`]=name
    return name
  }
  return {carry,definitions,forPerson(personId:string,cells:Record<string,string>,sourceHash:string) {
    const history=inventory.values.filter(v=>v.person_id===personId), next=[...history]
    for(const definition of definitions) {
      const column=columnFor(definition.key), found=Object.keys(cells).find(h=>h.toLowerCase()===column.toLowerCase())
      const previous=prior.find(v=>v.person_id===personId && v.field_id===definition.id && v.effective_from<=effectiveFrom)
      const supplied=found!==undefined
      if(!supplied && !definition.required) continue
      const raw=supplied?cells[found!]:previous?JSON.parse(previous.value_json):null
      const typed=definition.type==='boolean' && typeof raw==='string' ? raw===''?null:raw.toLowerCase()==='true'?true:raw.toLowerCase()==='false'?false:raw : raw
      const value=validateFieldValue(definition,typed)
      if(!supplied) continue
      if(previous && previous.definition_version_id===definition.definitionVersionId && previous.value_json===JSON.stringify(value)) continue
      const id=sha256(canonicalJson([personId,definition.id,definition.definitionVersionId,effectiveFrom,sourceHash,value]))
      if(next.some(v=>v.id===id)) continue
      const sequence=Math.max(0,...prior.filter(v=>v.person_id===personId && v.field_id===definition.id).map(v=>v.sequence))+1
      next.push({id,person_id:personId,field_id:definition.id,definition_version_id:definition.definitionVersionId,effective_from:effectiveFrom,
        sequence,value_json:JSON.stringify(value),corrects_id:previous?.effective_from===effectiveFrom?previous.id:null,origin:'import',revision:sha256(id),recorded_at:now(),recorded_by:'import'})
    }
    return customImportValue(next,inventory.latest)
  }}
}

function historyGuard(values:FieldValueRow[],where:string,params:unknown[]):D1Sql {
  const expected=canonicalJson(values)
  const same=columns.map(c=>`v.${c} IS json_extract(e.value,'$.${c}')`).join(' AND ')
  return sql(`(SELECT COUNT(*) FROM wl_custom_field_values v WHERE v.origin='import' AND (${where}))=json_array_length(?)
    AND NOT EXISTS(SELECT 1 FROM json_each(?) e WHERE NOT EXISTS(SELECT 1 FROM wl_custom_field_values v WHERE v.origin='import' AND (${where}) AND ${same}))`,...params,expected,expected,...params)
}
function schemaGuard(expected:{fieldId:string;definitionVersionId:string}[]):D1Sql {
  return sql(`NOT EXISTS(SELECT 1 FROM json_each(?) e WHERE json_extract(e.value,'$.definitionVersionId') IS NOT
    (SELECT id FROM wl_custom_field_versions WHERE field_id=json_extract(e.value,'$.fieldId') ORDER BY version DESC LIMIT 1))`,canonicalJson(expected))
}
export function customPersonGuard(value:Record<string,any>,personId:string):D1Sql[] {
  const values:FieldValueRow[]=JSON.parse(value.customHistoryJson??'[]')
  return [historyGuard(values,'v.person_id=?',[personId]),schemaGuard(JSON.parse(value.customSchemaJson??'[]'))]
}
export function customSetGuards(rows:TargetRow[]):D1Sql[] {
  const people=rows.filter(r=>r.targetKind==='person'), values=people.flatMap(r=>JSON.parse((r.value as any).customHistoryJson??'[]'))
  const schemas=people.flatMap(r=>JSON.parse((r.value as any).customSchemaJson??'[]'))
  return [historyGuard(values,"v.person_id IN (SELECT id FROM wl_people WHERE origin='import')",[]),schemaGuard(schemas)]
}
export function writeImportedCustomValues(value:Record<string,any>,personId:string):D1Sql[] {
  const history=value.customHistoryJson??'[]', schemas=JSON.parse(value.customSchemaJson??'[]')
  const guard=schemaGuard(schemas)
  return [sql(`INSERT INTO wl_guard(code,ok) SELECT 'stale', (${guard.sql})`,...(guard.params??[])),
    sql("DELETE FROM wl_custom_field_values WHERE person_id=? AND origin='import' AND id NOT IN (SELECT json_extract(value,'$.id') FROM json_each(?))",personId,history),
    sql(`INSERT INTO wl_custom_field_values(${columns.join(',')}) SELECT ${columns.map(c=>`json_extract(e.value,'$.${c}')`).join(',')}
      FROM json_each(?) e WHERE NOT EXISTS(SELECT 1 FROM wl_custom_field_values v WHERE v.id=json_extract(e.value,'$.id')) ORDER BY CAST(json_extract(e.value,'$.sequence') AS INTEGER)`,history)]
}
