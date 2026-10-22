// The native executor admits the selected report's people; its real actor owns every field.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { insist } from '../core'
import { isReporter, selectedReport } from '../levels/reports'
import { reportDefinition } from './definitions'
import { runReport } from './execute'
import { BUILTIN_REPORTS, builtinReport } from './builtin-catalog'
import { projectBuiltinResult, type BuiltinResult } from './builtin-result'
import { runBuiltinDocuments } from './builtin-documents'
import { runBuiltinDiversity } from './builtin-diversity'

export { BUILTIN_REPORTS, builtinReport } from './builtin-catalog'
export type { BuiltinReport } from './builtin-catalog'
export type { BuiltinResult, BuiltinRow } from './builtin-result'
export interface BuiltinOptions { asOf?: string; from?: string; to?: string; department?: string; location?: string }
const OPTION_KEYS = ['asOf', 'from', 'to', 'department', 'location']

export async function builtinReports(_env: Bindings, actor: Actor) {
 const reports = BUILTIN_REPORTS.filter(report => isReporter(actor) || selectedReport(actor, report.id))
 insist(isReporter(actor) || reports.length, 'forbidden', 403)
 return reports
}
function options(value: URL | BuiltinOptions): BuiltinOptions {
 const entries = value instanceof URL ? [...value.searchParams.entries()] : Object.entries(value)
 insist(entries.every(([key, entry]) => OPTION_KEYS.includes(key) && typeof entry === 'string'), 'unexpected_builtin_option')
 insist(new Set(entries.map(([key]) => key)).size === entries.length, 'duplicate_builtin_option')
 return Object.fromEntries(entries)
}
export async function runBuiltinReport(env: Bindings, actor: Actor, id: string, input: URL | BuiltinOptions = {}): Promise<BuiltinResult> {
 const catalog = await builtinReports(env, actor)
 const report = catalog.find(item => item.id === id)
 insist(report && builtinReport(id), 'not_found', 404)
 const filters = options(input)
 if(report.kind === 'diversity') return runBuiltinDiversity(env, actor, report, filters)
 const definition = await reportDefinition(env, { ...filters, name: report.name, columns: report.kind === 'workforce' ? [...report.columns] : ['name'], status: report.status }, actor.today)
 if(report.kind !== 'workforce') return runBuiltinDocuments(env, actor, report, definition)
 return projectBuiltinResult(actor, report, await runReport(env, actor, definition, report.id))
}
