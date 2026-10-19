// Every state change in Willow, by name. The same handler serves the HTML form
// door (/app/do/NAME) and the JSON door (/api/willow/NAME) used by agents.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { acknowledge, addDocument } from './documents'
import { configureEmployer, createCategory, createDepartment, createLocation, createSchedule } from './employer'
import type { Input } from './input'
import { accrue, adjust, approveOpening, approvePolicy, cancelLeave, correctLeave, createPolicy, decideLeave, openAccount, requestLeave, withdrawLeave } from './leave'
import { completeCase, completeTask, createTemplate, scheduleMover, startJoiner, startLeaver } from './lifecycle'
import { endAccess, giveAccess, setPermissions } from './members'
import { applyImport, importAction, previewImport } from './movein/bamboohr'
import { acknowledgeBatch, createBatch, discardBatch, exportBatch } from './payroll'
import { cancelTerms, setPayrollId, updatePerson } from './people'
import { decideProposal, propose } from './proposals'

import { configureNotices, configureModel, configureIdentity } from './connections'
import { configureLayout, previewPayroll } from './payroll-layout'
import { createModelDraft, decideModelDraft } from './model-drafts'

import { previewTemplate, publishTemplate } from './workflow-review'
import { previewUpgrade, applyUpgrade, failTask } from './workflow-upgrade'

type Handler = (env: Bindings, actor: Actor, input: Input, request: Request) => Promise<unknown>

import { approveWorkPolicy, scheduleWork } from './work'
import { runWorkNow } from './work-scheduler'

export const actions: Record<string, Handler> = {
  'work.policy': approveWorkPolicy,
  'work.schedule': scheduleWork,
  'work.run': runWorkNow,
  'connections.notices': configureNotices,
  'connections.model': configureModel,
  'connections.identity': configureIdentity,
  'model.draft': createModelDraft,
  'model.decide': decideModelDraft,
  'payroll.layout': configureLayout,
  'payroll.preview': previewPayroll,
  'employer.configure': (env, actor, input) => configureEmployer(env, actor, input),
  'location.create': (env, actor, input) => createLocation(env, actor, input),
  'department.create': (env, actor, input) => createDepartment(env, actor, input),
  'schedule.create': (env, actor, input) => createSchedule(env, actor, input),
  'category.create': (env, actor, input) => createCategory(env, actor, input),
  'member.permissions': (env, actor, input, request) => setPermissions(env, actor, input, request),
  'access.give': (env, actor, input, request) => giveAccess(env, actor, input, request),
  'access.end': (env, actor, input, request) => endAccess(env, actor, input, request),
  'person.update': (env, actor, input) => updatePerson(env, actor, input),
  'period.payroll': (env, actor, input) => setPayrollId(env, actor, input),
  'terms.cancel': (env, actor, input) => cancelTerms(env, actor, input),
  'template.preview': previewTemplate,
  'template.publish': publishTemplate,
  'case.upgrade.preview': previewUpgrade,
  'case.upgrade': applyUpgrade,
  'task.fail': failTask,
  'template.create': (env, actor, input) => createTemplate(env, actor, input),
  'joiner.start': (env, actor, input) => startJoiner(env, actor, input),
  'mover.schedule': (env, actor, input) => scheduleMover(env, actor, input),
  'leaver.start': (env, actor, input) => startLeaver(env, actor, input),
  'task.complete': (env, actor, input, request) => completeTask(env, actor, input, request),
  'case.complete': (env, actor, input) => completeCase(env, actor, input),
  'document.add': (env, actor, input) => addDocument(env, actor, input),
  'document.acknowledge': (env, actor, input) => acknowledge(env, actor, input),
  'policy.write': (env, actor, input) => createPolicy(env, actor, input),
  'policy.approve': (env, actor, input) => approvePolicy(env, actor, input),
  'account.open': (env, actor, input) => openAccount(env, actor, input),
  'account.approve': (env, actor, input) => approveOpening(env, actor, input),
  'leave.accrue': (env, actor, input) => accrue(env, actor, input),
  'leave.adjust': (env, actor, input) => adjust(env, actor, input),
  'leave.request': (env, actor, input) => requestLeave(env, actor, input),
  'leave.decide': (env, actor, input) => decideLeave(env, actor, input),
  'leave.withdraw': (env, actor, input) => withdrawLeave(env, actor, input),
  'leave.cancel': (env, actor, input) => cancelLeave(env, actor, input),
  'leave.correct': (env, actor, input) => correctLeave(env, actor, input),
  'payroll.draft': (env, actor, input) => createBatch(env, actor, input),
  'payroll.discard': (env, actor, input) => discardBatch(env, actor, input),
  'payroll.export': (env, actor, input) => exportBatch(env, actor, input),
  'payroll.acknowledge': (env, actor, input) => acknowledgeBatch(env, actor, input),
  'proposal.create': (env, actor, input) => propose(env, actor, input),
  'proposal.decide': (env, actor, input) => decideProposal(env, actor, input),
  'import.preview': (env, actor, input) => previewImport(env, actor, input),
  'import.apply': (env, actor, input) => applyImport(env, actor, input),
  'import.job': (env, actor, input) => importAction(env, actor, input),
}
