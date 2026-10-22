// Settings definitions never supply employee values or owner-only decisions.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { all } from '../core'
import { WEEKDAYS } from '../employer'
import { requireSetting,type SettingsKey } from '../levels/settings'
import { connectionSettings } from '../connections'
import { adoption,stateRules } from '../retention/settings'
import { h,page,table,form,field,select,type Html } from './html'
export async function settingAreaData(env:Bindings,actor:Actor,key:SettingsKey) {
 requireSetting(actor,key)
 if(key==='locations')return {locations:await all(env,'SELECT id,name,timezone,work_state FROM wl_locations ORDER BY name'),departments:await all(env,'SELECT id,name FROM wl_departments ORDER BY name')}
 if(key==='schedules')return {schedules:await all(env,'SELECT id,name,mon+tue+wed+thu+fri+sat+sun AS weekly_minutes FROM wl_schedules ORDER BY name')}
 if(key==='document-categories')return {categories:await all(env,'SELECT id,name,subject_reads,manager_reads,acknowledgement FROM wl_doc_categories ORDER BY name')}
 if(key==='payroll-connections')return {layout:await all(env,'SELECT format,revision FROM wl_payroll_layout WHERE singleton=1')}
 if(key==='sign-in')return {emailLinks:true,optionalProviderEnabled:!!(await connectionSettings(env)).oidc}
 if(key==='retention') {const adopted=await adoption(env);return {adoption:adopted?{table_version:adopted.table_version}:null,states:(await stateRules(env)).map(({state,decision,class:recordClass,years})=>({state,decision,class:recordClass,years}))}}
 return {}
}
export async function settingAreaPage(env:Bindings,actor:Actor,key:SettingsKey,url:URL) {
 const data=await settingAreaData(env,actor,key) as Record<string,any>,path=`/app/settings/${key}`
 let title:string,body:Html
 if(key==='locations') {title='Locations and departments';body=h`<section class="card"><h2>Locations</h2>${table(['Name','Time zone','Work state'],data.locations.map((row:any)=>[row.name,row.timezone,row.work_state??'Not recorded']))}${form('location.create',path,[field('Name','name'),field('Time zone','timezone',{value:'America/New_York'}),field('US work state','workState',{required:false})],'Add location')}</section><section class="card"><h2>Departments</h2>${table(['Name'],data.departments.map((row:any)=>[row.name]))}${form('department.create',path,field('Name','name'),'Add department')}</section>`}
 else if(key==='schedules') {title='Working schedules';body=h`<section class="card">${table(['Name','Hours per week'],data.schedules.map((row:any)=>[row.name,(row.weekly_minutes/60).toFixed(2)]))}${form('schedule.create',path,[field('Schedule name','name'),...WEEKDAYS.map(day=>field(day,day,{required:false}))],'Add schedule')}</section>`}
 else if(key==='document-categories') {title='Document categories';body=h`<section class="card">${table(['Category','Person reads','Manager reads','Receipt requested'],data.categories.map((row:any)=>[row.name,row.subject_reads?'Yes':'No',row.manager_reads?'Yes':'No',row.acknowledgement?'Yes':'No']))}${form('category.create',path,[field('Category name','name'),select('Person reads','subjectReads',[{value:'yes',label:'Yes'},{value:'no',label:'No'}],'no'),select('Manager reads','managerReads',[{value:'yes',label:'Yes'},{value:'no',label:'No'}],'no'),select('Receipt requested','acknowledgement',[{value:'yes',label:'Yes'},{value:'no',label:'No'}],'no')],'Add category')}</section>`}
 else if(key==='payroll-connections') {title='Payroll connection settings';body=h`<section class="card"><h2>Recorded handoff layout</h2>${table(['Format'],data.layout.map((row:any)=>[row.format]))}<p>The owner configures provider and file mappings. Opening these settings does not grant payroll records or exports.</p></section>`}
 else if(key==='sign-in') {title='Sign-in settings';body=h`<section class="card">${table(['Method','State'],[['Email links','Available'],['Optional sign-in provider',data.optionalProviderEnabled?'Enabled':'Disabled']])}<p>The owner authorizes provider links and security policy. Your level supplies no owner policy or other person’s sessions.</p></section>`}
 else {title='Retention settings';body=h`<section class="card"><h2>Recorded retention policy</h2><p>${data.adoption?`Adopted table: ${data.adoption.table_version}`:'No retention table has been adopted.'}</p>${table(['State','Decision','Record class','Years'],(data.states??[]).map((row:any)=>[row.state,row.decision,row.class,row.years??'Table default']))}<p>The owner adopts policy and decides holds and erasures. Employee records, retained material and those decisions need their separate authority.</p></section>`}
 return page(title,actor,h`<header class="page-head"><h1>${title}</h1><p>These settings do not grant access to the records they govern.</p></header>${body}`,{current:path,url})
}
