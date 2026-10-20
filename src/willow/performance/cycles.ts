import type { Bindings } from '../../auth.server'
import { requirePermission, type Actor } from '../actor'
import { commit, guard, insist, json, newId, now, one, stmt } from '../core'
import { requireDate } from '../dates'
import type { Input } from '../input'
import { cycleRow, currentManager, openGuard } from './store'
export async function createReviewCycle(env:Bindings,actor:Actor,input:Input) {
 requirePermission(actor,'people.manage')
 const id=newId(),name=input.text('name',{max:160}),due=requireDate(input.text('dueDate'),'invalid_dueDate'),people=[...new Set(input.list('people'))]
 insist(people.length>0&&people.length<=200,'invalid_people')
 const questions=(input.has('questions')?input.json('questions'):Object.fromEntries(['self','peer','manager'].map(role=>[role,input.text(role+'Questions',{max:10000}).split('\n').map(q=>q.trim()).filter(Boolean)]))) as Record<string,unknown>
 insist(questions&&typeof questions==='object'&&!Array.isArray(questions)&&Object.keys(questions).every(k=>['self','peer','manager'].includes(k)),'invalid_questions')
 for(const role of ['self','peer','manager'])insist(Array.isArray(questions[role])&&(questions[role] as unknown[]).length>0&&(questions[role] as unknown[]).length<=20&&(questions[role] as unknown[]).every(q=>typeof q==='string'&&q.trim().length>0&&q.length<=500),'invalid_questions')
 for(const person of people)insist(await one(env,'SELECT 1 FROM wl_people WHERE id=?',person),'person_not_found',404)
 await commit(env,[stmt(env,'INSERT INTO wl_review_cycles(id,name,due_date,questions,created_at) VALUES(?,?,?,?,?)',id,name,due,JSON.stringify(questions),now()),...people.map(p=>stmt(env,'INSERT INTO wl_review_subjects(cycle_id,person_id) VALUES(?,?)',id,p))],{actor:actor.id,action:'performance.cycle.create',subject:id,detail:{people:people.length}})
 return {id}
}
export async function assignReview(env:Bindings,actor:Actor,input:Input) {
 requirePermission(actor,'people.manage')
 const id=newId(),cycle=input.text('cycle'),person=input.text('person'),member=input.text('member'),role=input.text('role'),due=requireDate(input.text('dueDate'),'invalid_dueDate')
 const c=await cycleRow(env,cycle);insist(c.status==='open','cycle_locked',409)
 insist(['self','peer','manager'].includes(role),'invalid_role')
 const m=await one(env,`SELECT m.* FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=? AND m.status='active' AND o.status='active'`,member)
 insist(m,'member_not_active',409)
 insist(role!=='self'||m.person_id===person,'self_mismatch')
 if(role==='manager') {
  insist((await currentManager(env,person,actor.today))?.id===member,'manager_mismatch',409)
 }
 insist(await one(env,'SELECT 1 FROM wl_review_subjects WHERE cycle_id=? AND person_id=?',cycle,person),'subject_not_found',404)
 insist(!await one(env,'SELECT 1 FROM wl_review_assignments WHERE cycle_id=? AND person_id=? AND member_id=? AND role=?',cycle,person,member,role),'assignment_exists',409)
 await commit(env,[openGuard(env,cycle),stmt(env,'INSERT INTO wl_review_assignments(id,cycle_id,person_id,member_id,role,due_date) VALUES(?,?,?,?,?,?)',id,cycle,person,member,role,due)],{actor:actor.id,action:'performance.input.request',subject:id})
 return {id}
}
export async function respondReview(env:Bindings,actor:Actor,input:Input) {
 const id=newId(),assignment=input.text('assignment'),a=await one(env,'SELECT * FROM wl_review_assignments WHERE id=?',assignment)
 insist(a&&a.member_id===actor.id,'not_found',404)
 const cycle=await cycleRow(env,a.cycle_id);insist(cycle.status==='open','cycle_locked',409)
 const answers=input.list('answers',{keepEmpty:true}),questions=json<Record<string,string[]>>(cycle.questions,{})[a.role]
 insist(answers.length===questions.length&&answers.every(s=>s.length>0&&s.length<=5000),'invalid_answers')
 await commit(env,[openGuard(env,a.cycle_id),stmt(env,'INSERT INTO wl_review_inputs(id,assignment_id,author,answers,created_at) VALUES(?,?,?,?,?)',id,assignment,actor.id,JSON.stringify(answers),now())],{actor:actor.id,action:'performance.input.submit',subject:assignment})
 return {id}
}
export async function closeReviewCycle(env:Bindings,actor:Actor,input:Input) {
 requirePermission(actor,'people.manage');const id=input.text('cycle');const c=await cycleRow(env,id);insist(c.status==='open','cycle_locked',409)
 const complete=`NOT EXISTS(SELECT 1 FROM wl_review_subjects s WHERE s.cycle_id=? AND (NOT EXISTS(SELECT 1 FROM wl_review_summaries r WHERE r.cycle_id=s.cycle_id AND r.person_id=s.person_id) OR EXISTS(SELECT 1 FROM json_each('["self","peer","manager"]') role WHERE NOT EXISTS(SELECT 1 FROM wl_review_assignments a JOIN wl_review_inputs i ON i.assignment_id=a.id WHERE a.cycle_id=s.cycle_id AND a.person_id=s.person_id AND a.role=role.value)))) AND NOT EXISTS(SELECT 1 FROM wl_review_assignments a WHERE a.cycle_id=? AND NOT EXISTS(SELECT 1 FROM wl_review_inputs i WHERE i.assignment_id=a.id))`
 insist((await one(env,`SELECT (${complete}) AS ok`,id,id))?.ok,'cycle_incomplete',409)
 await commit(env,[openGuard(env,id),guard(env,'incomplete',complete,id,id),stmt(env,"UPDATE wl_review_cycles SET status='closed' WHERE id=?",id)],{actor:actor.id,action:'performance.cycle.close',subject:id})
 return {id}
}
