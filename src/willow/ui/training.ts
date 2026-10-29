import { msg } from '../locale/runtime'
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { insist } from '../core'
import { trainingHome } from '../training'
import { h,page,form,field,hidden,area,select } from './html'
const ROOT='/app/training'
export async function trainingPage(env:Bindings,actor:Actor,url:URL) {
 const settings=url.pathname==='/app/settings/training'
 if(settings)insist(can(actor,'people.manage'),'forbidden',403)
 const d=await trainingHome(env,actor)
 const assignable=d.people.filter(p=>p.mayAssign)
 return page(settings?'Training settings':'Training',actor,h`<h1>${settings?msg('Training settings'):msg('Training')}</h1><p>TalentLMS: ${d.connection.state}. These are native manual records; completion evidence is not provider verification.</p>
 ${settings?h`<p><a href="${ROOT}">Training records</a></p><section class="card"><h2>Add a course</h2>${form('training.course','/app/settings/training',[field('Course title','title'),h`<label class="check"><input type="checkbox" name="selfCompletion" value="yes"> Allow self completion</label>`],'Add course')}</section>`:h`
 ${d.mayManage?h`<p><a href="/app/settings/training">Training settings</a></p>`:''}
 ${assignable.length&&d.courses.length?h`<details><summary>Assign training</summary>${form('training.assign',ROOT,[select('Person','person',assignable.map(p=>({value:p.id,label:p.name}))),select('Course','course',d.courses.map(c=>({value:c.id,label:c.title}))),field('Due date','dueDate',{type:'date',value:actor.today})],'Assign training')}</details>`:''}
 <h2>Permitted training records</h2>${d.assignments.length?d.assignments.map(row=>h`<section class="card"><h3>${row.title} · ${row.personName}</h3>
 ${row.assignment?h`<p>Due ${row.assignment.dueDate}</p>`:''}
 ${row.completion?h`<p>${row.completion.outcome==='completed'?msg('Completed'):msg('Waived')} · ${row.completion.evidence}</p>`:''}
 ${row.certification?h`<p>Certification evidence: ${row.certification.evidence}</p>`:''}
 ${row.mayComplete?form('training.complete',ROOT,[hidden('assignment',row.id),area('Completion evidence','evidence'),...row.mayCertify?[area('Certification evidence (optional)','certificate','',false)]:[]],row.completionRequiresApproval?msg('Request completion'):row.certificateRequiresApproval?msg('Submit completion'):msg('Record completion')):''}
 ${row.mayWaive?h`<details><summary>Waive assignment</summary>${form('training.waive',ROOT,[hidden('assignment',row.id),area('Waiver reason','evidence')],row.waiverRequiresApproval?msg('Request waiver'):msg('Waive assignment'))}</details>`:''}</section>`):h`<p>No training records are available to you.</p>`}
 <h2>Training change requests</h2>${d.requests.length?d.requests.map(row=>h`<section class="card"><h3>${row.personName} · ${row.operation==='assign'?msg('Assignment'):row.operation==='complete'?msg('Completion'):msg('Waiver')} · ${row.status}</h3><dl class="facts"><dt>Course</dt><dd>${row.courseTitle}</dd>${row.operation==='assign'?h`<dt>Due date</dt><dd>${row.payload.dueDate}</dd>`:h`<dt>Evidence</dt><dd>${row.payload.evidence}</dd>${row.payload.certificate?h`<dt>Certification evidence</dt><dd>${row.payload.certificate}</dd>`:''}`}</dl>${row.reason?h`<p>${row.reason}</p>`:''}${h`<p><a href="/app/self-changes/${row.id}">Review change and decision history</a></p>`}</section>`):h`<p>No training changes await your review.</p>`}`}`,{current:ROOT,url})
}
