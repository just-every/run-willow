import { correctReview } from './performance/corrections'
import { approveWebhook, replayWebhook, runWebhooksNow, disableWebhook } from './webhooks'
import { approveCredential,issueCredential,rotateCredential,revokeCredential } from './api-credentials'
import { resubmitCompensationRecord,resubmitCompensationDefinition } from './compensation/resubmit'
import { editCompensationPay, proposeCompensationRecord } from './compensation/pay'
import { writeCompensationRecord } from './compensation/records'
import { editJobField } from './job-write'
import { proposeDocument } from './document-write'
import { editOtherPersonal } from './levels/other-personal'
import { createPacket, withdrawPacket } from './preboarding'
import { inviteApplicant, revokeApplicantInvitation, closeApplication } from './eeo-applicants'
import { createHiringOpening, setHiringTeam, addHiringCandidate, moveHiringCandidate, scoreHiringCandidate, addHiringResume } from './hiring'
import { previewLevel, applyLevel } from './levels/actions'
import { createReviewCycle, assignReview, respondReview, closeReviewCycle } from './performance/cycles'
import { calibrateReview, releaseReview, withholdReview, acknowledgeReview, appealReview } from './performance/releases'
import { saveGoal, checkinGoal, finishDevelopment } from './performance/goals'
import { createSurvey, closeSurvey, createActionPlan, completeActionPlan } from './surveys/setup'
import { respondSurvey, hideSurveyComment } from './surveys/responses'
import { defineBand } from './compensation/bands'
import { createCycle, approveBudget, publishCycle } from './compensation/cycles'
import { proposeCompensation } from './compensation/proposals'
import { announce, acknowledge as acknowledgeCompany, folder as companyFolder, file as companyUpload, celebrations } from './company/actions'
import { openProtected, recordProtectedAbsence, reverseProtectedAbsence, certifyProtected } from './protected-leave/records'
import { decideOverride } from './protected-leave/overrides'
import { saveReport } from './reporting/definitions'
import { scheduleReport } from './reporting/schedule'
import { writeEeoSelf, recordEeoCategory, grantEeo, mapTitle, mapEstablishment, createRun } from './eeo'
import { adoptTable, recordState, recordMapping, recordContractor } from './retention/settings'
import { placeHold, releaseHold, reviewHold } from './retention/holds'
import { openRequest, withdrawRequest } from './retention/erasure'
import { confirmErasure } from './retention/erase'
import { recordProviderOutcome } from './retention/providers'
import { confirmPurge } from './retention/review'
import { proposeSelfChange, decideSelfChange, reconcileSelfChange } from './self-service/requests'
import { defineField, writeFieldValues, proposeCustomField } from './custom-fields/actions'
import { configureDoor } from './movein/authority'
import { defineTable } from './record-tables/schema'
import { writeRow } from './record-tables/rows'
import { configureChain } from './change-requests/chain'
import { completeAlertTask, defineAlert, retireAlert } from './date-alerts/alerts'
import { decideChange, editChange, requestChange } from './change-requests/requests'
// Every state change in Willow, by name. The same handler serves the HTML form
// door (/app/do/NAME) and the JSON door (/api/willow/NAME) used by agents.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { acknowledge, addDocument } from './documents'
import { configureEmployer, createCategory, createDepartment, createDivision, createLegalEntity, createLocation, createSchedule, setDepartmentDivision, setPeriodEntity } from './employer'
import type { Input } from './input'
import { accrue, adjust, approveOpening, approvePolicy, cancelLeave, correctLeave, createPolicy, decideLeave, openAccount, requestLeave, withdrawLeave } from './leave'
import { completeCase, completeTask, createTemplate, scheduleMover, startJoiner, startLeaver } from './lifecycle'
import { endAccess, giveAccess, setPermissions } from './members'
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
  'webhook.disable':disableWebhook,'webhook.approve':approveWebhook,'webhook.replay':replayWebhook,'webhook.run':runWebhooksNow,
  'preboarding.send': createPacket, 'preboarding.withdraw': withdrawPacket,
  'hiring.selfId.invite': inviteApplicant, 'hiring.selfId.withdraw': revokeApplicantInvitation, 'hiring.close': closeApplication,
  'hiring.opening': createHiringOpening, 'hiring.team': setHiringTeam, 'hiring.candidate': addHiringCandidate, 'hiring.move': moveHiringCandidate, 'hiring.scorecard': scoreHiringCandidate, 'hiring.resume': addHiringResume,
  'level.preview': previewLevel, 'level.apply': applyLevel,
  'survey.create': createSurvey, 'survey.close': closeSurvey, 'survey.respond': respondSurvey,
  'survey.plan': createActionPlan, 'survey.plan.complete': completeActionPlan, 'survey.comment.hide': hideSurveyComment,
  'performance.cycle': createReviewCycle, 'performance.assign': assignReview, 'performance.respond': respondReview, 'performance.close': closeReviewCycle,
  'performance.correct': correctReview, 'performance.note': calibrateReview, 'performance.release': releaseReview, 'performance.withhold': withholdReview, 'performance.ack': acknowledgeReview, 'performance.appeal': appealReview,
  'goal.create': saveGoal, 'goal.checkin': checkinGoal, 'goal.complete': finishDevelopment,
  'compensation.band': defineBand,
  'compensation.cycle': createCycle,
  'compensation.budget': approveBudget,
  'compensation.propose': proposeCompensation,
  'compensation.publish': publishCycle,
  'company.announce': announce,
  'company.acknowledge': acknowledgeCompany,
  'company.folder': companyFolder,
  'company.file': companyUpload,
  'company.celebrations': celebrations,
  'protected.open': openProtected,
  'protected.absence': recordProtectedAbsence,
  'protected.reverse': reverseProtectedAbsence,
  'protected.certify': certifyProtected,
  'leave.override.decide': decideOverride,
  'report.save': saveReport,
  'report.schedule': scheduleReport,
  'eeo.self.write': writeEeoSelf, 'eeo.record': recordEeoCategory, 'eeo.grant': grantEeo, 'eeo.title': mapTitle, 'eeo.establishment': mapEstablishment, 'eeo.run': createRun,
  'retention.adopt': adoptTable, 'retention.state': recordState, 'retention.map': recordMapping, 'contractor.set': recordContractor,
  'hold.place': placeHold, 'hold.release': releaseHold, 'hold.review': reviewHold,
  'erasure.request': openRequest, 'erasure.withdraw': withdrawRequest, 'erasure.confirm': confirmErasure, 'erasure.provider': recordProviderOutcome, 'retention.purge': confirmPurge,
  'self.request': proposeSelfChange,
  'apiKey.approve':approveCredential,'apiKey.issue':issueCredential,'apiKey.rotate':rotateCredential,'apiKey.revoke':revokeCredential,
  'self.decide': decideSelfChange,
  'self.reconcile': reconcileSelfChange,
  'dateAlert.define': defineAlert,
  'dateAlert.retire': retireAlert,
  'dateAlert.task': completeAlertTask,
  'change.chain': configureChain,
  'change.request': requestChange,
  'change.edit': editChange,
  'change.decide': decideChange,
  'customField.define': defineField,
  'customField.write': writeFieldValues,
  'recordTable.define': defineTable,
  'recordRow.write': writeRow,
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
  'import.settings': (env, actor, input) => configureDoor(env, actor, input.flag('enabled'), input.list('revokedKids')),
  'employer.configure': (env, actor, input) => configureEmployer(env, actor, input),
  'location.create': (env, actor, input) => createLocation(env, actor, input),
  'department.create': (env, actor, input) => createDepartment(env, actor, input),
  'division.create': (env, actor, input) => createDivision(env, actor, input),
  'department.division': (env, actor, input) => setDepartmentDivision(env, actor, input),
  'entity.create': (env, actor, input) => createLegalEntity(env, actor, input),
  'period.entity': (env, actor, input) => setPeriodEntity(env, actor, input),
  'schedule.create': (env, actor, input) => createSchedule(env, actor, input),
  'category.create': (env, actor, input) => createCategory(env, actor, input),
  'member.permissions': (env, actor, input, request) => setPermissions(env, actor, input, request),
  'access.give': (env, actor, input, request) => giveAccess(env, actor, input, request),
  'access.end': (env, actor, input, request) => endAccess(env, actor, input, request),
  'custom.propose':proposeCustomField,
  'compensation.record':writeCompensationRecord,
  'compensation.pay':editCompensationPay,
  'compensation.record.propose':proposeCompensationRecord,
  'compensation.record.resubmit':resubmitCompensationRecord,
  'compensation.definition.resubmit':resubmitCompensationDefinition,
  'job.field': editJobField,
  'person.field': editOtherPersonal,
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
  'document.propose': proposeDocument,
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
}
