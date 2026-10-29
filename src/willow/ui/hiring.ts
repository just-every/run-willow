import { msg } from '../locale/runtime'
// HIRING-003: native forms reuse the existing guarded manual pipeline actions.
import type { Bindings } from '../../auth.server'
import { can, employerZone, type Actor } from '../actor'
import { hiringOpenings, hiringOpening, hiringApplication, hiringResume } from '../hiring'
import { members } from '../members'
import { h, page, form, field, hidden, select, area, checks, table, when, tag, fileField } from './html'
const root = '/app/hiring'
const teamOptions = async (env: Bindings, actor: Actor, request: Request) =>
 (await members(env, actor, request)).filter(m => m.status === 'active' && m.signIn === 'active').map(m => ({ value: m.id, label: m.name }))

export async function hiringPage(env: Bindings, actor: Actor, request: Request, url: URL) {
 const openings = await hiringOpenings(env, actor)
 const options = can(actor, 'people.manage') ? await teamOptions(env, actor, request) : null
 return page(msg('Hiring'), actor, h`<h1>Hiring</h1><p>Internal manual reviews. Openings here are not published job postings. People decide every stage change.</p>
 ${openings.length ? table(['Opening', 'Stages'], openings.map(o => [h`<a href="${root}/openings/${o.id}">${o.name}</a>`, o.stages.join(' → ')])) : h`<p>No hiring reviews are available to you.</p>`}
 ${options ? h`<section class="card"><h2>Create an internal review</h2>${form('hiring.opening', root, [field('Opening name', 'name'),
 h`<fieldset><legend>Stages in order</legend>${Array.from({length:6}, (_, i) => field(`Stage ${i + 1}`, 'stages', {value:['New','Screen','Interview','Offer','Hired','Rejected'][i],required:i<2}))}</fieldset>`,
 checks('Hiring team', 'members', options)], 'Create review')}</section>` : ''}`, {current:root, url})
}

export async function hiringOpeningPage(env: Bindings, actor: Actor, request: Request, url: URL, id: string) {
 const opening = await hiringOpening(env, actor, id)
 const options = can(actor, 'people.manage') ? await teamOptions(env, actor, request) : null
 const here = `${root}/openings/${id}`
 return page(opening.name, actor, h`<p class="back"><a href="${root}">← Hiring</a></p><h1>${opening.name}</h1>
 <p>Internal review · ${opening.stages.join(' → ')}</p>
 ${options?h`<section class="card"><h2>Careers publication</h2><p><a href="/careers/${id}">Open public application page</a> · <a href="/app/translations">Employer translations</a></p>${form('career.publish',here,[hidden('opening',id),field('Public description','description'),h`<label class="check"><input type="checkbox" name="active" value="yes" checked> Publish this opening and email a separate voluntary self-identification invitation after application</label>`],'Save careers publication')}</section>`:''}
 ${table(['Candidate', 'Stage', 'Source'], opening.candidates.map(c => [h`<a href="${root}/applications/${c.id}">${c.name}</a>`, tag(c.stage), c.source]))}
 <section class="card"><h2>Add a candidate</h2><p>A contact email is not verified identity. Applications stay separate, including repeat email addresses.</p>
 ${form('hiring.candidate', here, [hidden('opening', id),field('Candidate name','name'),field('Contact email','contactEmail',{type:'email'}),field('Source','source')], 'Add candidate')}</section>
 ${options ? h`<section class="card"><h2>Hiring team</h2><p>Only HR and this opening’s current team may read its candidates and interviewer evidence.</p>
 ${form('hiring.team', here, [hidden('opening', id),hidden('revision', opening.revision),checks('Team members','members',options, opening.team.map(m=>String(m.member_id)))], 'Save team')}</section>` : ''}`, {current:root,url})
}

export async function hiringApplicationPage(env: Bindings, actor: Actor, url: URL, id: string) {
 if (url.searchParams.has('resume')) return hiringResume(env, actor, id, url.searchParams.get('resume')!)
 const candidate = await hiringApplication(env, actor, id)
 const zone = await employerZone(env)
 const opening = await hiringOpening(env, actor, candidate.opening_id)
 const here = `${root}/applications/${id}`
 const closed = candidate.closure
 const own = candidate.scorecards.filter(s => s.author === actor.id).sort((a,b) => Number(b.version)-Number(a.version))[0]
 return page(candidate.name, actor, h`<p class="back"><a href="${root}/openings/${opening.id}">← ${opening.name}</a></p><h1>${candidate.name}</h1>
 <dl><dt>Contact email</dt><dd>${candidate.contact_email}</dd><dt>Source</dt><dd>${candidate.source}</dd><dt>Stage</dt><dd>${tag(candidate.stage)}</dd></dl>
 <section class="card"><h2>Resumes</h2><p>Only HR and this opening’s current team can open these files. Uploading a correction keeps earlier versions.</p>
 ${candidate.resumes.length ? table(['Version','File','Size','Uploaded'], candidate.resumes.map(r=>[r.version,h`<a href="${here}?resume=${r.id}">${r.filename}</a>`,`${r.size} bytes`,when(r.uploaded_at,zone)])) : h`<p>No resume has been uploaded.</p>`}
 ${form('hiring.resume',here,[hidden('application',id),hidden('version',candidate.resumes[0]?.version??0),fileField('Resume file','file',{required:true})], 'Upload resume', {multipart:true})}<p class="hint">Up to 10 MB. Files download as attachments.</p></section>
 ${closed ? h`<section class="card"><h2>Application closed</h2><p>${closed.outcome}</p></section>` : h`<section class="card"><h2>Move candidate</h2>${form('hiring.move',here,[hidden('application',id),hidden('revision',candidate.revision),select('Next stage','stage',opening.stages.filter(s=>s!==candidate.stage).map(value=>({value,label:value})))], 'Move candidate')}</section>`}
 ${can(actor,'people.manage') ? h`<section class="card"><h2>Private self-identification invitation</h2><p>A separate private link is sent to this application's contact email. No answers or completion status appear in the hiring review. Post-offer invitations require the Offer stage or a closed hired application.</p>
 ${!closed || closed.outcome==='hired' ? form('hiring.selfId.invite',here,[hidden('application',id),select('Invitation phase','phase',closed ? [{value:'post-offer',label:'Post-offer'}] : [{value:'pre-offer',label:'Pre-offer'},...(candidate.stage.trim().toLowerCase()==='offer' ? [{value:'post-offer',label:'Post-offer'}] : [])])],'Send private invitation') : ''}</section>
 ${!closed ? h`<section class="card"><h2>Close application</h2><p>This records the human decision and ends further stage changes.</p>${form('hiring.close',here,[hidden('application',id),hidden('revision',candidate.revision),hidden('openingRevision',opening.revision),select('Outcome','outcome',[{value:'hired',label:'Hired'},{value:'rejected',label:'Rejected'},{value:'withdrawn',label:'Withdrawn'}])],'Close application')}</section>` : ''}` : ''}
 <section class="card"><h2>Your interviewer evidence</h2><p>Saving a correction keeps earlier versions. Evidence never advances, ranks or rejects a candidate.</p>${form('hiring.scorecard',here,[hidden('application',id),hidden('version',own?.version??0),area('Observed evidence','evidence',String(own?.evidence??''))], own?'Save correction':'Record evidence')}</section>
 <section class="card"><h2>Interviewer history</h2>${table(['Interviewer','Version','Evidence','Recorded'],candidate.scorecards.map(s=>[s.authorName,s.version,s.evidence,when(s.created_at,zone)]))}</section>
 <section class="card"><h2>Stage timeline</h2>${table(['From','To','By','Recorded'],candidate.timeline.map(e=>[e.from_stage??'New application',e.to_stage,e.actorName,when(e.at,zone)]))}</section>`,{current:root,url})
}
