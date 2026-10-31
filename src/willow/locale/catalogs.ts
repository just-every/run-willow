/// <reference types="vite/client" />
// Add a JSON catalog here; locale discovery and selectors need no code changes.
const files=import.meta.glob('./messages/*.json',{eager:true,import:'default'}) as Record<string,{language:string;name:string;messages:Record<string,string>}>
export default Object.fromEntries(Object.values(files).map(file=>[file.language,file]))
