import {createRun,clone,record,buildContext,nextNode,runSummary,importRun,VERSION,REFERENCE} from './core.js';
import {SEED} from './simulation.js';
import {visit} from './runner.js';
import {engine,checkDevice,loadModel,generate,lookup,downloadBytesFor} from './live.js';
import {NodeMap} from './map.js';

const $=id=>document.getElementById(id);
const el=(tag,text,className)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(className)x.className=className;return x;};
const sessions={simulation:createRun(SEED),live:createRun(SEED,'live')};
sessions.simulation.preset='revisit';
let mode='simulation',selected='n1',busy=false,playing=false,controller=null,loading=false,loadedModel=null,archived=null,approvalResolve=null,lastActive='n1';
const state=()=>archived||sessions[mode];
const map=new NodeMap($('map'),id=>{selected=id;$('follow').checked=false;if(map.scale<.6){map.scale=.9;map.focus(id);}render();});
function say(text){$('status').textContent=text;}
function render(){
  const s=state();
  $('simMode').setAttribute('aria-pressed',String(mode==='simulation'));$('liveMode').setAttribute('aria-pressed',String(mode==='live'));
  $('simMode').disabled=busy||playing||loading;$('liveMode').disabled=busy||playing||loading;
  $('simSetup').hidden=mode!=='simulation'||!!archived;$('liveSetup').hidden=mode!=='live'||!!archived;
  $('modeNote').textContent=archived?'Imported run · inspection only':mode==='simulation'?'Precomputed responses · no network':'Inference on this device · Wikipedia online';
  $('run').textContent=playing?'Pause after node':mode==='simulation'?'Run simulation':'Run local model';
  const canRun=!archived&&!loading&&(!busy||playing)&&!!nextNode(s)&&!s.stopReason&&(mode==='simulation'||!!loadedModel);
  $('run').disabled=!canRun&&!playing;$('step').disabled=busy||playing||loading||!canRun;$('stop').disabled=!busy&&!playing;
  for(const id of ['reset','scenario','newLive','import','model','autoWiki'])$(id).disabled=busy||playing||loading;
  $('model').disabled=busy||playing||loading||!!loadedModel;
  $('loadModel').disabled=loading||busy||playing||!!loadedModel;$('unloadModel').disabled=!loadedModel||loading||busy||playing;
  $('checkDevice').disabled=loading||busy||playing;$('clearModel').disabled=loading||busy||playing||!!loadedModel;$('testWiki').disabled=loading||busy||playing;
  const count=s.nodes.filter(n=>n.status==='resolved').length;
  $('metrics').replaceChildren(...[[s.nodes.length,'nodes'],[s.visits,'visits'],[s.modelCalls,mode==='simulation'?'scripted calls':'model calls'],[count,'resolved']].map(([v,k])=>{const x=el('span');x.append(el('b',v),document.createTextNode(' '+k));return x;}));
  map.draw(s,selected,$('follow').checked?lastActive:null);
  const n=s.nodes.find(n=>n.id===selected)||s.nodes[0];selected=n.id;
  $('nodeId').textContent=n.id+(n.parent?' · child of '+n.parent:' · seed');$('nodeStatus').textContent=n.status;
  $('nodeQuestion').textContent=n.question;$('nodeVisits').textContent=n.visits+' visits · depth '+n.depth+' · '+n.observed.length+' sources read here';
  $('finding').replaceChildren();
  if(n.finding)$('finding').append(el('strong','Finding'),el('p',n.finding));
  else if(n.reason)$('finding').append(el('strong',n.status==='error'?'Harness stopped':'Unresolved'),el('p',n.reason));
  else $('finding').append(el('p',n.status==='waiting'?'Waiting for child findings. A fresh visit must still decide whether this question is resolved.':'No finding yet.','muted'));
  $('evidence').replaceChildren();
  for(const id of [...new Set([...n.evidence,...n.observed])]){
    const e=s.evidence.find(x=>x.id===id);if(!e)continue;
    const card=el('div',undefined,'evidence-card');card.append(el('strong',e.id+' · '+e.title));
    card.append(el('p',e.kind==='fixture'?'Illustrative fixture · not a fetched source':(e.exact?'Wikipedia summary':'Wikipedia search snippet')+' · captured '+e.capturedAt,'muted'));
    card.append(el('blockquote',e.text));
    if(e.url){const a=el('a','Source article ↗');a.href=e.url;a.target='_blank';a.rel='noopener noreferrer';card.append(a);}
    $('evidence').append(card);
  }
  const input=[...s.trace].reverse().find(e=>e.event==='model_input'&&e.node===n.id);
  $('context').textContent=JSON.stringify(input?.context||buildContext(s,n),null,2)+(input?'':'\n\nNot yet sent to a model.');
  $('nodeTrace').textContent=s.trace.filter(e=>e.node===n.id).map(e=>JSON.stringify(e,null,2)).join('\n\n')||'No invocations yet.';
  $('retry').hidden=!!archived||!['error','blocked'].includes(n.status);$('retry').disabled=busy||loading;
}
function selectMode(next){if(busy||playing||loading)return;mode=next;archived=null;selected='n1';lastActive='n1';map.active=null;$('follow').checked=true;render();say(runSummary(state())+'. The '+mode+' graph is kept separate.');}
$('simMode').onclick=()=>selectMode('simulation');$('liveMode').onclick=()=>selectMode('live');
function reset(){
  if(busy||playing||loading)return;
  if(state().visits>0&&!confirm('Start a new graph? Export first if you want to keep this run.'))return;
  try{
    archived=null;sessions[mode]=createRun(mode==='simulation'?SEED:$('seed').value.trim(),mode);
    if(mode==='simulation')sessions[mode].preset=$('scenario').value;
    $('autoWiki').checked=false;selected='n1';lastActive='n1';map.active=null;map.scale=1;$('follow').checked=true;render();say('One seed. Ready to investigate.');
  }catch(e){say(e.message);}
}
$('reset').onclick=reset;$('newLive').onclick=reset;
$('scenario').onchange=()=>{const chosen=$('scenario').value;reset();if(sessions.simulation.preset!==chosen)$('scenario').value=sessions.simulation.preset;};
function abortableDelay(ms,signal){return new Promise((resolve,reject)=>{if(signal.aborted){reject(signal.reason);return;}const abort=()=>{clearTimeout(timer);reject(signal.reason);};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});});}
async function approval(query,signal){
  if($('autoWiki').checked)return true;
  $('approvalQuery').textContent=query;$('approval').hidden=false;say('Waiting for your Wikipedia approval.');
  return new Promise(resolve=>{
    const done=value=>{signal.removeEventListener('abort',cancel);approvalResolve=null;$('approval').hidden=true;resolve(value);};
    const cancel=()=>done(false);approvalResolve=done;signal.addEventListener('abort',cancel,{once:true});
    if(signal.aborted)done(false);
  });
}
$('allow').onclick=()=>approvalResolve?.(true);$('deny').onclick=()=>approvalResolve?.(false);
async function one(){
  if(busy||archived||loading)return false;
  const s=state();if(s.mode==='live'&&!loadedModel){say('Load a local model first.');return false;}
  busy=true;controller=new AbortController();
  if(s.mode==='live'){s.model=loadedModel;s.runtime='@mlc-ai/web-llm@0.2.84';}
  render();
  const outcome=await visit(s,{signal:controller.signal,generate,wiki:lookup,approve:approval,preset:s.preset,
    pace:s.mode==='simulation'?signal=>abortableDelay(320,signal):null,
    onUpdate:(id,message)=>{if(id){lastActive=id;if($('follow').checked)selected=id;}if(message)say(id+' · '+message);render();}});
  const cancelled=controller.signal.aborted;busy=false;controller=null;
  if(cancelled)say('Stopped. Captured evidence and the raw trace are retained.');
  else if(!outcome||!nextNode(s)||s.nodes[0].status==='resolved')say(runSummary(s));
  render();return outcome&&!cancelled;
}
$('step').onclick=()=>{void one();};
$('run').onclick=async()=>{
  if(playing){playing=false;$('run').textContent='Pausing…';$('run').disabled=true;return;}
  playing=true;render();
  while(playing){const ok=await one();if(!ok||!nextNode(state())||state().stopReason)break;await new Promise(resolve=>setTimeout(resolve,mode==='simulation'?550:50));}
  playing=false;render();
};
$('stop').onclick=()=>{playing=false;controller?.abort(new DOMException('Stopped by user','AbortError'));if(!busy){say('Stopped between visits.');render();}};
$('retry').onclick=()=>{
  const s=state(),n=s.nodes.find(x=>x.id===selected);if(!n||busy||archived)return;
  n.status=s.nodes.some(x=>x.parent===n.id)?'waiting':'open';n.reason='';s.stopReason=null;record(s,'manual_retry',{node:n.id});render();say('Retry queued. Press One node or Run.');
};
$('fit').onclick=()=>{$('follow').checked=false;map.fit();};$('zoomIn').onclick=()=>map.zoom(1.2);$('zoomOut').onclick=()=>map.zoom(1/1.2);$('follow').onchange=()=>{if($('follow').checked)map.focus(lastActive);};
const size=bytes=>bytes==null?'unknown':(bytes/1024**3).toFixed(2)+' GiB';
async function inspectDevice(){
  $('deviceStatus').textContent='Checking WebGPU and storage…';const d=await checkDevice();
  $('deviceStatus').textContent=(d.webgpu?'WebGPU adapter found':'WebGPU unavailable: '+d.reason)+' · '+(d.secure?'secure context':'insecure context')+' · cache: '+d.cache+' · storage headroom: '+size(d.storage.freeBytes);
  return d;
}
$('checkDevice').onclick=async()=>{try{await inspectDevice();}catch(e){$('deviceStatus').textContent=e.message;}};
$('loadModel').onclick=async()=>{
  if(loading||busy)return;loading=true;render();$('loadStatus').textContent='Checking this device before downloading…';
  try{
    const d=await inspectDevice();if(!d.webgpu)throw new Error('No usable WebGPU adapter. Try a compatible browser or an HTTPS copy of this file; simulation remains available.');
    if(d.cache==='unavailable')throw new Error('This file origin cannot use persistent model storage. Open an HTTPS or localhost copy of this same file.');
    const id=$('model').value,needed=downloadBytesFor(id),cached=await engine.isCached(id);
    if(!cached&&needed&&d.storage.freeBytes!==null&&d.storage.freeBytes<needed)throw new Error('Model needs approximately '+size(needed)+' of storage; browser reports '+size(d.storage.freeBytes)+' free.');
    $('loadProgress').hidden=false;
    await loadModel(id,p=>{$('loadProgress').value=p.progress;$('loadStatus').textContent=p.text||'Loading model…';});
    loadedModel=id;$('modelBadge').textContent='ready';$('loadStatus').textContent='Ready. Inference runs on this device.';$('loadProgress').value=1;$('modelSettings').open=false;
    say('Local model loaded. Start a graph or press Run.');
  }catch(e){$('loadStatus').textContent='Could not load: '+String(e.message||e)+'. You can retry, free storage, or use simulation.';$('modelBadge').textContent='not loaded';}
  finally{loading=false;render();}
};
$('unloadModel').onclick=async()=>{loading=true;render();try{await engine.unload();loadedModel=null;$('modelBadge').textContent='not loaded';$('loadStatus').textContent='Model unloaded from memory; cached download kept.';$('loadProgress').hidden=true;}catch(e){$('loadStatus').textContent=e.message;}finally{loading=false;render();}};
$('clearModel').onclick=async()=>{
  if(!confirm('Delete cached weights for the selected model? They will need to download again.'))return;
  loading=true;render();const ok=await engine.deleteFromCache($('model').value);$('loadStatus').textContent=ok?'Selected model cache removed; it can be downloaded again.':'Could not clear the cache. Use this browser’s site-storage controls if necessary.';loading=false;render();
};
$('testWiki').onclick=async()=>{
  if(!confirm('Send the search term “Water cycle” to English Wikipedia to test access?'))return;
  busy=true;controller=new AbortController();render();$('wikiTestStatus').textContent='Testing Wikipedia search and summary…';
  try{const r=await lookup('Water cycle',controller.signal);$('wikiTestStatus').textContent=r.ok?'Success: '+r.title+' ('+(r.exact?'article summary':'search snippet fallback')+'). No evidence was added to the graph.':'Failed: '+r.error.message;}
  catch(e){$('wikiTestStatus').textContent=e.message;}
  finally{busy=false;controller=null;render();}
};
$('export').onclick=()=>{
  const s=clone(state());s.exportedAt=new Date().toISOString();s.version=VERSION;s.reference=REFERENCE;
  const blob=new Blob([JSON.stringify(s,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');
  a.href=url;a.download='tangle-'+s.mode+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
};
$('import').onclick=()=>$('importFile').click();$('importFile').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{if(file.size>8_000_000)throw new Error('Maximum import size is 8 MB.');archived=importRun(await file.text());mode=archived.mode;selected='n1';lastActive='n1';map.active=null;render();map.fit();say('Imported '+file.name+' · inspect-only; your existing runs are unchanged.');}
  catch(err){say('Import rejected: '+err.message);}finally{e.target.value='';}
};
$('helpButton').onclick=()=>{$('help').open=!$('help').open;if($('help').open)$('help').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});};
window.addEventListener('beforeunload',e=>{if(busy||loading){e.preventDefault();e.returnValue='';}});
render();
