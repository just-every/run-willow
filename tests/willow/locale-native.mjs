import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
const require=createRequire(import.meta.url)
export async function nativeLocaleJourney(h,cookie,page) {
 const babel=require('../../native/node_modules/@babel/core'),preset=createRequire(require.resolve('../../native/node_modules/expo/package.json')).resolve('babel-preset-expo')
 const renderer=require('../../native/node_modules/react-test-renderer'),React=require('../../native/node_modules/react')
 const nativeHost=new URL('./locale-native-host.mjs',import.meta.url).href
 const source=readFileSync('native/App.jsx','utf8')
 let code=babel.transformSync(source,{filename:'native/App.jsx',presets:[[preset,{jsxRuntime:'classic'}]],babelrc:false,configFile:false,caller:{name:'metro',supportsStaticESM:true,platform:'ios'}}).code
 for(const spec of ['react-native','react-native-webview','expo-notifications','expo-constants'])code=code.replaceAll("'"+spec+"'","'"+nativeHost+"'").replaceAll('"'+spec+'"','"'+nativeHost+'"')
 code=code.replaceAll("'react'","'"+pathToFileURL(require.resolve('../../native/node_modules/react/index.js')).href+"'").replaceAll('"react"','"'+pathToFileURL(require.resolve('../../native/node_modules/react/index.js')).href+'"')
 code=code.replace(/(['"])\.\/bridge\1/g,JSON.stringify(pathToFileURL(process.cwd()+'/native/bridge.js').href))
 code=code.replace(/(['"])(@babel\/runtime[^'"]+)\1/g,(_,quote,spec)=>JSON.stringify(pathToFileURL(createRequire(require.resolve('../../native/package.json')).resolve(spec)).href))
 const {EmployeeHome}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
 const {Platform}=await import(nativeHost)
 const {bridgeScript,createBridge}=await import('../../native/bridge.js')
 let bridge,ready=false,resolveReady
 const readyEvent=new Promise(resolve=>{resolveReady=resolve})
 if(page){await page.goto(h.origin+'/app');bridge=createBridge(()=>({injectJavaScript:script=>page.evaluate(script)}));await page.exposeFunction('willowNativeResponse',value=>{if(JSON.parse(value).ready){ready=true;resolveReady()}else bridge.receive(value)});await page.evaluate(()=>{window.ReactNativeWebView={postMessage:value=>window.willowNativeResponse(value)}});await page.evaluate(bridgeScript);await Promise.race([readyEvent,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('native bridge startup timed out')),5000);timer.unref()})]);assert.ok(ready,'native home waits for the authenticated WebView bridge')}
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 for(const platform of ['ios','android']) {
  Platform.OS=platform
  await h.api('language.choose',cookie,{language:'en'})
  let app;const opened=[]
  const api=async(path,body)=>{try{return await (bridge?bridge.request(path,body):h.api(path,cookie,body))}catch(error){console.error('native public door failed',path,error.message);throw error}}
  await renderer.act(async()=>{app=renderer.create(React.createElement(EmployeeHome,{api,open:path=>opened.push(path),registerPush:async()=>`ExpoPushToken[locale-${platform}]`}))})
  for(let n=0;n<100&&!app.root.findAllByType('Pressable').some(node=>node.props.accessibilityLabel==='Español (Estados Unidos)');n++)await renderer.act(async()=>{await new Promise(resolve=>setTimeout(resolve,50))})
  const press=async name=>{const target=app.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel===name);assert.ok(target,platform+': '+name);await renderer.act(async()=>{await target.props.onPress()})}
  await press('Español (Estados Unidos)')
  assert.equal((await api('me')).language,'es-US')
  await press('Registrar entrada');assert.equal((await api('clock')).state,'in')
  await press('Iniciar descanso');assert.equal((await api('clock')).state,'break')
  await press('Terminar descanso');assert.equal((await api('clock')).state,'resume')
  await press('Registrar salida');assert.equal((await api('clock')).state,'out')
  await press('Activar notificaciones push')
  await press('Solicitar permiso');assert.ok(opened.includes('/app/leave'))
  await press('English');assert.equal((await api('me')).language,'en')
  await press('Clock in');await press('Start break');await press('End break');await press('Clock out')
  await renderer.act(async()=>app.unmount())
 }
 bridge?.clear()
 await h.api('language.choose',cookie,{language:'en'})
 console.log('PASS native iOS/Android React component journey: retained language, native clock in/break/resume/out and scoped WebView navigation; OS host edge recorded')
}
