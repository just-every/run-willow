// ROLE-008 supplies only published themes; raw results retain native HR grants.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { all } from '../core'
import { readsPerformanceField } from '../levels/performance'

export async function readsSurveyThemes(env: Bindings, actor: Actor, survey: string) {
 const cohort = await all<{person_id:string}>(env,'SELECT person_id FROM wl_survey_members WHERE survey_id=?',survey)
 if (!cohort.length) return false
 // The fixed cohort includes former members and nonrespondents. Never shrink it
 // to an answer set, or reveal its members to the caller to explain a refusal.
 return cohort.every(member => readsPerformanceField(actor,member.person_id,'engagement')) ||
  can(actor,'reports.read') && cohort.every(member => actor.reports.has(member.person_id))
}
