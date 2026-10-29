// Disposable verification only: all owner and fixture creation uses production
// HTTP. No database writes, test routes or substituted application adapters.
export default async function({request,origin,claim,displayName,returnTo}) {
 const response=await request(new URL(claim.path,origin).href,{method:'POST',redirect:'manual',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token:claim.token,displayName:'Olive Owner',returnTo})})
 if(response.status!==303)throw Error('Native owner claim refused')
 const cookie=response.headers.getSetCookie().map(value=>value.split(';',1)[0]).join('; ')
 async function action(name,args) {
  const result=await request(new URL(`/api/willow/${name}`,origin).href,{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(args)})
  if(!result.ok)throw Error('Native fixture action refused: '+name+' '+result.status)
  return result.json()
 }
 await request(new URL('/setup',origin).href,{method:'POST',redirect:'manual',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/x-www-form-urlencoded'},body:'confirm=yes'})
 await action('employer.configure',{name:'Harbour Works',timezone:'UTC',country:'US',currency:'USD'})
 const me=await (await request(new URL('/api/willow/me',origin).href,{headers:{Cookie:cookie}})).json()
 const template=await action('template.create',{kind:'joiner',name:'New starter',requiredFields:[],taskTitle:['Confirm records'],taskAssignee:['hr'],taskDueDays:['0'],taskEvidence:['no'],taskSystem:[''],taskAction:['']})
 const review=await action('template.preview',{template:template.id})
 await action('template.publish',{review:review.id})
 await action('joiner.start',{template:template.id,legalName:'Ana Rivera',workEmail:'ana@example.invalid',startDate:'2026-01-01',employmentType:'full_time',jobTitle:'Operations coordinator',payBasis:'salary',payAmount:'84000'})
 await action('proposal.create',{kind:'joiner',summary:'Prepare Bea for HR',agent:'Native HR preparation',plan:{template:template.id,legalName:'Bea Morgan',workEmail:'bea@example.invalid',startDate:'2026-11-01',employmentType:'full_time',jobTitle:'Operations coordinator'}})
 await action('hiring.opening',{name:'Operations coordinator',stages:['Applied','Interview','Decision'],members:[me.id]})
 return response
}
