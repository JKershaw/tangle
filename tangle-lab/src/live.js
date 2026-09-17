// Reuse Browser-agent's engine interface and Wikipedia tool at the pinned commit.
import {createWebLLMEngine,downloadBytesFor} from '../../browser-agent-reference/src/llm/webllm.js';
import {detectCapabilities} from '../../browser-agent-reference/src/llm/engine.js';
import {estimateStorage,requestPersistence} from '../../browser-agent-reference/src/llm/storage.js';
import {executeWiki} from '../../browser-agent-reference/src/tools/wiki.js';
import * as mlc from '@mlc-ai/web-llm';

export {downloadBytesFor};
const RESULT_SCHEMA={type:'object',properties:{action:{type:'string',enum:['wiki','decompose','resolved','blocked']},query:{type:'string'},questions:{type:'array',items:{type:'string'}},finding:{type:'string'},evidence:{type:'array',items:{type:'string'}},reason:{type:'string'}},required:['action'],additionalProperties:false};
let cacheBackend='cache', rawEngine=null;
const appConfig=()=>({...mlc.prebuiltAppConfig,cacheBackend});
export const engine=createWebLLMEngine({importWebLLM:async()=>({
  ...mlc,
  hasModelInCache:id=>mlc.hasModelInCache(id,appConfig()),
  deleteModelAllInfoInCache:id=>mlc.deleteModelAllInfoInCache(id,appConfig()),
  CreateMLCEngine:async(id,options)=>{
    const instance=new mlc.MLCEngine({...options,appConfig:appConfig()});rawEngine=instance;
    try{await instance.reload(id,{context_window_size:4096});}
    catch(e){try{await instance.unload();}catch{}rawEngine=null;throw e;}
    return {
      chat:{completions:{create:async request=>{
        await instance.resetChat();
        return instance.chat.completions.create({...request,response_format:{type:'json_object',schema:JSON.stringify(RESULT_SCHEMA)}});
      }}},
      interruptGenerate:()=>{void instance.interruptGenerate().catch(()=>{});},
      unload:async()=>{await instance.unload();rawEngine=null;}
    };
  }
})});

export async function checkDevice(){
  const caps=await detectCapabilities();
  const storage=await estimateStorage();
  let cache='unavailable',reason='';
  try{const c=await caches.open('tangle-probe');await c.put('https://tangle.invalid/probe',new Response('ok'));await caches.delete('tangle-probe');cache='cache';}
  catch{
    try{
      await new Promise((resolve,reject)=>{
        const request=indexedDB.open('tangle-cache-probe',1);
        const timer=setTimeout(()=>reject(new Error('IndexedDB check timed out')),3000);
        request.onsuccess=()=>{clearTimeout(timer);request.result.close();indexedDB.deleteDatabase('tangle-cache-probe');resolve();};
        request.onerror=()=>{clearTimeout(timer);reject(request.error);};
      });cache='indexeddb';
    }catch(e){reason=e.message;}
  }
  if(cache!=='unavailable')cacheBackend=cache;
  return {...caps,storage,cache,cacheReason:reason,secure:globalThis.isSecureContext,protocol:location.protocol};
}
export async function loadModel(id,onProgress){
  await requestPersistence();await engine.load(id,onProgress);
}
export async function generate(messages,signal){
  const before=engine.stats().totalTokens;
  const timeout=setTimeout(()=>{void rawEngine?.interruptGenerate();},120000);
  const started=performance.now();
  let partialText='';
  try{
    const text=await engine.generate(messages,{signal,maxTokens:420,temperature:0.2,thinking:false,onDelta:delta=>{partialText+=delta;}});
    if(performance.now()-started>=120000)throw new Error('Generation time limit reached (120 seconds).');
    const tokens=engine.stats().totalTokens-before;
    return {text,tokens:tokens>0?tokens:null};
  }catch(error){error.partialText=partialText;throw error;
  }finally{clearTimeout(timeout);}
}
export async function lookup(query,signal){
  const result=await executeWiki({query},{signal,timeoutMs:20000,maxBytes:65536,allowlist:['en.wikipedia.org'],
    fetchImpl:(url,options)=>{
      const u=new URL(url);
      if(u.protocol!=='https:'||u.hostname!=='en.wikipedia.org')throw new Error('Only HTTPS Wikipedia requests are allowed.');
      return fetch(u,{...options,redirect:'error',credentials:'omit',referrerPolicy:'no-referrer'});
    }
  });
  if(!result.ok){
    if(result.error?.kind==='unreachable')return {...result,upstreamError:result.error,error:{kind:'unreachable',message:'Wikipedia lookup did not complete. This browser may be blocking requests from the current file origin, or the network/API may be unavailable. No proxy is used. Try Test Wiki access in a full browser or an HTTPS copy of this file. Raw request details are retained in the trace.'}};
    return result;
  }
  let revision=null;
  try{revision=JSON.parse(result.requests[1]?.body||'{}').revision??null;}catch{}
  return {...result,kind:'wiki',text:result.extract.slice(0,4000),revision,
    url:typeof revision==='string'&&/^\d+$/.test(revision)?'https://en.wikipedia.org/w/index.php?oldid='+revision:result.url};
}
