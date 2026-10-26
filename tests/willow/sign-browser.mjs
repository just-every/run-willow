// Browser children use the runner's real home; CLI and Worker fixtures keep their isolation.
export async function launchSigningBrowser() {
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH??'@playwright/test')
 const executablePath=process.env.WILLOW_CHROMIUM_PATH??process.env.WILLOW_CHROMIUM
 const env=process.env.WILLOW_BROWSER_HOME?{...process.env,HOME:process.env.WILLOW_BROWSER_HOME}:process.env
 return chromium.launch({headless:true,...(executablePath?{executablePath}:{}),env,args:['--use-mock-keychain','--password-store=basic']})
}
