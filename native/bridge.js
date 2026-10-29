// Runs inside the employer's authenticated WebView. HttpOnly cookies stay in
// the OS WebView jar; native JS never reads, logs or persists session secrets.
export const bridgeScript = `window.willowNativeRequest=async function(id,path,body){
 if(!/^\\/api\\/willow\\/[a-zA-Z0-9_./?=&%-]+$/.test(path))return;
 try{const r=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',headers:{accept:'application/json',...(body?{'content-type':'application/json','origin':location.origin}:{})},body:body?JSON.stringify(body):undefined});
 window.ReactNativeWebView.postMessage(JSON.stringify({id,status:r.status,data:await r.json()}));}
 catch(e){window.ReactNativeWebView.postMessage(JSON.stringify({id,status:0,data:{error:'network_unavailable'}}));}};window.ReactNativeWebView.postMessage(JSON.stringify({ready:true,path:location.pathname}));true;`
export function createBridge(webview) {
 let sequence=0
 const pending=new Map()
 return {
  request(path,body){return new Promise((resolve,reject)=>{
   const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('network_unavailable'))},20000)
   pending.set(id,{resolve,reject,timer})
   webview()?.injectJavaScript(`window.willowNativeRequest(${JSON.stringify(id)},${JSON.stringify('/api/willow/'+path)},${JSON.stringify(body)});true;`)
  })},
  receive(value){try{const message=JSON.parse(value),entry=pending.get(message.id);if(!entry)return
   clearTimeout(entry.timer);pending.delete(message.id)
   if(message.status>=200&&message.status<300)entry.resolve(message.data)
   else entry.reject(new Error(message.data?.error??'network_unavailable'))
  }catch{}},
  clear(){for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(new Error('authentication_required'))}pending.clear()}
 }
}
