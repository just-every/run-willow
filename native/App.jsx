import React,{useEffect,useMemo,useRef,useState} from 'react'
import {ActivityIndicator,AppState,Platform,Pressable,SafeAreaView,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native'
import {WebView} from 'react-native-webview'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import {bridgeScript,createBridge} from './bridge'

// The home, clock and language controls are native. Existing sensitive forms
// open in this same-origin authenticated WebView and retain all server fences.
export function EmployeeHome({api,open,registerPush,onLocale=()=>{}}) {
 const [state,setState]=useState(null),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState('')
 const t=text=>state?.catalogs?.[state.language]?.messages?.[text]??text
 async function refresh(){const [mobile,me,clock]=await Promise.all([api('mobile'),api('me'),api('clock')]);setState({...mobile,me,clock});onLocale(mobile.catalogs[mobile.language].messages)}
 async function act(work){if(busy)return;setBusy(true);setFeedback('');try{await work();await refresh();setFeedback('Saved.')}catch(error){setFeedback(error.message);if(error.message==='authentication_required'){setState(null);open('/signin')}}finally{setBusy(false)}}
 useEffect(()=>{refresh().catch(error=>setFeedback(error.message));const subscription=AppState.addEventListener('change',status=>{if(status==='active')refresh().catch(()=>{setState(null);open('/signin')})});return()=>subscription.remove()},[])
 const button=(text,onPress,key=text)=> <Pressable key={key} accessibilityRole="button" accessibilityLabel={t(text)} disabled={busy} onPress={onPress} style={[styles.button,busy&&styles.disabled]}><Text style={styles.buttonText}>{t(text)}</Text></Pressable>
 if(!state)return <View style={styles.card}><ActivityIndicator/><Text accessibilityRole="alert">{t(feedback)}</Text>{button('Refresh',()=>act(refresh))}</View>
 const clockNames={in:'Clock in',break:'Start break',resume:'End break',out:'Clock out'}
 return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.body}>
 <Text accessibilityRole="header" style={styles.brand}>Willow</Text><Text style={styles.name}>{state.me.name}</Text>
 <View style={styles.card}><Text style={styles.heading}>{t('Display language')}</Text><View style={styles.row}>{Object.values(state.catalogs).map(c=>button(c.name,()=>act(()=>api('language.choose',{language:c.language})),c.language))}</View></View>
 <View style={styles.card}><Text accessibilityRole="header" style={styles.heading}>{t('Time clock')}</Text><Text style={styles.status}>{t(state.clock.state==='out'?'Off shift':state.clock.state==='break'?'On break':'Working')}</Text>{state.clock.allowed.map(kind=>button(clockNames[kind],()=>act(()=>api('clock.punch',{kind,revision:state.clock.revision}))))}</View>
 <View style={styles.card}><Text accessibilityRole="header" style={styles.heading}>{t('Your work')}</Text>{[['Home','/app'],['Your record','/app/people/'+state.me.person],['Request leave','/app/leave'],['Your tasks','/app/tasks'],['Signatures','/app/signatures'],['Surveys','/app/surveys'],['Voluntary self-ID','/app/eeo/self']].map(([text,path])=>button(text,()=>open(path)))}</View>
 {button('Enable push notifications',()=>act(async()=>{const token=await registerPush();await api('mobile.push.register',{token,platform:Platform.OS,enabled:true})}))}
 {button('Refresh',()=>act(refresh))}
 {feedback?<Text accessibilityRole="alert" style={styles.feedback}>{t(feedback in state.catalogs[state.language].messages?feedback:feedback.startsWith('missing_')?'Complete the required fields.':feedback==='Saved.'?feedback:'The request could not be completed. Review the details and try again.')}</Text>:null}
 </ScrollView></SafeAreaView>
}
export default function App() {
 const [address,setAddress]=useState(''),[confirmation,setConfirmation]=useState(''),[origin,setOrigin]=useState(''),[native,setNative]=useState(false),[messages,setMessages]=useState({}),[location,setLocation]=useState('/signin'),ref=useRef(null),admitted=useRef(false)
 const bridge=useMemo(()=>createBridge(()=>ref.current),[])
 const open=path=>{setNative(false);setLocation(path);ref.current?.injectJavaScript(`location.href=${JSON.stringify(path)};true;`)}
 useEffect(()=>{const subscription=Notifications.addNotificationResponseReceivedListener(()=>open('/app'));return()=>{subscription.remove();bridge.clear()}},[])
 async function registerPush(){
  if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('willow',{name:'Willow',importance:Notifications.AndroidImportance.DEFAULT,lockscreenVisibility:Notifications.AndroidNotificationVisibility.PRIVATE})
  const permissions=await Notifications.requestPermissionsAsync();if(permissions.status!=='granted')throw new Error('Push registration failed.')
  const projectId=Constants.expoConfig?.extra?.eas?.projectId;if(!projectId)throw new Error('Push registration failed.')
  return (await Notifications.getExpoPushTokenAsync({projectId})).data
 }
 if(!origin)return <SafeAreaView style={styles.safe}><View style={styles.body}><Text style={styles.brand}>Willow</Text><Text style={styles.heading}>Connect to your employer / Conectarse con su empleador</Text><TextInput accessibilityLabel="Employer URL / URL del empleador" autoCapitalize="none" keyboardType="url" value={address} onChangeText={setAddress} style={styles.input}/><Pressable accessibilityRole="button" onPress={()=>{try{const url=new URL(address);if(url.protocol==='https:'&&!url.username&&!url.password)setOrigin(url.origin)}catch{}}} style={styles.button}><Text style={styles.buttonText}>Continue / Continuar</Text></Pressable></View></SafeAreaView>
 return <SafeAreaView style={styles.safe}>
 {native?<EmployeeHome api={bridge.request} open={open} registerPush={registerPush} onLocale={setMessages}/>:null}
 <View style={native?{height:1,overflow:'hidden'}:{flex:1}} accessibilityElementsHidden={native} importantForAccessibility={native?'no-hide-descendants':'auto'}>
 <WebView downloadingMessage={messages['Downloading']??'Downloading'} lackPermissionToDownloadMessage={messages['Allow downloads in your device settings.']??'Allow downloads in your device settings.'} ref={ref} source={{uri:origin+location}} injectedJavaScript={bridgeScript} javaScriptEnabled sharedCookiesEnabled thirdPartyCookiesEnabled={false} originWhitelist={[origin]} onShouldStartLoadWithRequest={request=>request.url==='about:blank'||new URL(request.url).origin===origin} onMessage={event=>{if(new URL(event.nativeEvent.url).origin!==origin)return;try{const message=JSON.parse(event.nativeEvent.data);if(message.ready&&message.path.startsWith('/app')&&!admitted.current){admitted.current=true;setNative(true)}else bridge.receive(event.nativeEvent.data)}catch{}}} onNavigationStateChange={nav=>{if(nav.url.startsWith(origin+'/signin')){admitted.current=false;setNative(false);bridge.clear()}}}/>
 </View>
 {!native?<View><TextInput accessibilityLabel="Sign-in link / Enlace para iniciar sesión" value={confirmation} onChangeText={setConfirmation} autoCapitalize="none" placeholder="Paste email link / Pegue el enlace del correo" style={styles.input}/><Pressable accessibilityRole="button" style={styles.button} onPress={()=>{try{const link=new URL(confirmation);if(link.origin===origin&&link.pathname==='/auth/confirm'){open(link.pathname+link.search);setConfirmation('')}}catch{}}}><Text style={styles.buttonText}>Open sign-in link / Abrir enlace de inicio de sesión</Text></Pressable><Pressable accessibilityRole="button" disabled={!admitted.current} onPress={()=>{admitted.current=false;open('/app')}} style={styles.button}><Text style={styles.buttonText}>Willow</Text></Pressable></View>:null}
 </SafeAreaView>
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:'#faf7f8'},body:{padding:20,gap:16},brand:{fontSize:32,fontWeight:'700',color:'#4f172c'},name:{fontSize:18,color:'#594652'},card:{backgroundColor:'#fff',borderRadius:16,padding:20,gap:12},heading:{fontSize:20,fontWeight:'600',color:'#4f172c'},status:{fontSize:24,color:'#4f172c'},row:{gap:8},button:{backgroundColor:'#a00046',padding:16,borderRadius:10,minHeight:48,marginVertical:3},buttonText:{color:'#fff',fontSize:17,fontWeight:'500'},disabled:{opacity:.5},input:{borderWidth:1,borderColor:'#63796a',padding:16,borderRadius:8,fontSize:18},feedback:{fontSize:16,color:'#4f172c'}})
