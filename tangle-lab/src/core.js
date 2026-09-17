export const VERSION='0.1.0';
export const REFERENCE='68d7f4c263d8ca20613bd2ed231035d3ed343678';
export const PROMPT_VERSION='tangle-pocket-1';
export const DEFAULT_LIMITS={maxNodes:40,maxVisits:60,maxDepth:6,maxLookups:2,maxPasses:4};
export const clone=x=>JSON.parse(JSON.stringify(x));
const text=(x,max=1000)=>typeof x==='string'&&x.trim().length>0&&x.length<=max;
function check(ok,message){if(!ok)throw new Error(message);}
export function createRun(seed,mode='simulation',limits={}){
  check(text(seed,400),'Give the seed a question of 1–400 characters.');
  return {format:'tangle-pocket-1',version:VERSION,reference:REFERENCE,promptVersion:PROMPT_VERSION,
    created:new Date().toISOString(),mode,seed,limits:{...DEFAULT_LIMITS,...limits},
    nodes:[{id:'n1',parent:null,depth:0,question:seed,status:'open',visits:0,finding:'',evidence:[],observed:[],reason:''}],
    evidence:[],trace:[],visits:0,modelCalls:0,tokens:0,lookups:0,stopReason:null};
}
export function record(s,event,data={}){s.trace.push({seq:s.trace.length+1,time:new Date().toISOString(),event,...data});}
export function children(s,id){return s.nodes.filter(n=>n.parent===id);}
export function nextNode(s){
  function walk(n){
    for(const c of children(s,n.id)){const result=walk(c);if(result)return result;}
    if(n.status==='open')return n;
    if(n.status==='waiting'&&children(s,n.id).every(c=>c.status==='resolved'))return n;
    return null;
  }
  return walk(s.nodes[0]);
}
export function addEvidence(s,nodeId,source){
  check(text(source.text,16000),'Evidence must contain captured text.');
  const e={...source,id:'e'+(s.evidence.length+1),capturedAt:new Date().toISOString(),node:nodeId};
  s.evidence.push(e);s.nodes.find(n=>n.id===nodeId).observed.push(e.id);
  record(s,'evidence_captured',{node:nodeId,evidence:e.id,kind:e.kind});return e;
}
export function buildContext(s,n){
  const allChildren=children(s,n.id).filter(c=>c.status==='resolved');
  const childResults=allChildren.slice(-6).map(c=>({id:c.id,question:c.question,finding:c.finding.slice(0,500),evidence:c.evidence}));
  const ids=[...new Set([...n.observed,...childResults.flatMap(c=>c.evidence)])];
  const included=ids.slice(-5);
  const evidence=included.map(id=>s.evidence.find(e=>e.id===id)).filter(Boolean).map(e=>({id:e.id,title:e.title,text:e.text.slice(0,700),kind:e.kind}));
  return {question:n.question,children:childResults,evidence,omittedChildren:allChildren.length-childResults.length,
    omittedEvidence:ids.length-evidence.length,excerptCharacterLimit:700};
}
export function parseResult(raw){
  check(typeof raw==='string','Model output was not text.');
  let cleaned=raw.replace(/<think>[\s\S]*?<\/think>/g,'').trim();
  const fenced=cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if(fenced)cleaned=fenced[1];
  const value=JSON.parse(cleaned);
  check(value&&typeof value==='object'&&!Array.isArray(value),'Expected a JSON object.');
  return value;
}
export function validateResult(s,n,result,allowed){
  check(result&&typeof result==='object','Expected a result object.');
  check(['wiki','decompose','resolved','blocked'].includes(result.action),'Unknown action.');
  if(result.action==='wiki')check(text(result.query,180),'Wikipedia query must be 1–180 characters.');
  if(result.action==='decompose'){
    check(Array.isArray(result.questions)&&result.questions.length>=1&&result.questions.length<=3,'Propose 1–3 questions.');
    check(result.questions.every(q=>text(q,300)),'Each question must be 1–300 characters.');
    check(n.depth<s.limits.maxDepth,'Depth safety limit reached. The node remains unresolved.');
    check(s.nodes.length+result.questions.length<=s.limits.maxNodes,'Node safety limit reached. The node remains unresolved.');
  }
  if(result.action==='resolved'){
    check(text(result.finding,1400),'A resolution needs a finding of 1–1,400 characters.');
    check(Array.isArray(result.evidence)&&result.evidence.length>=1&&result.evidence.length<=8,'A resolution needs inspected evidence IDs.');
    check(result.evidence.every(id=>allowed.includes(id)&&s.evidence.some(e=>e.id===id)),'Uninspected or invented evidence reference.');
  }
  if(result.action==='blocked')check(text(result.reason,1000),'A blocked node needs a reason.');
}
export function applyResult(s,id,result,allowed){
  const n=s.nodes.find(n=>n.id===id);check(n,'Unknown node.');
  check(['open','waiting','working'].includes(n.status),'Node is not runnable.');
  validateResult(s,n,result,allowed);
  if(result.action==='wiki')throw new Error('Tools do not mutate node outcomes.');
  if(result.action==='decompose'){
    n.status='waiting';
    for(const question of result.questions)s.nodes.push({id:'n'+(s.nodes.length+1),parent:id,depth:n.depth+1,question:question.trim(),status:'open',visits:0,finding:'',evidence:[],observed:[],reason:''});
  }else if(result.action==='resolved'){
    n.status='resolved';n.finding=result.finding.trim();n.evidence=[...new Set(result.evidence)];
  }else{n.status='blocked';n.reason=result.reason;}
  record(s,'node_'+result.action,{node:id,result:clone(result)});
}
export function runSummary(s){
  if(s.nodes[0].status==='resolved')return 'Root resolved';
  if(s.stopReason)return s.stopReason;
  if(!nextNode(s))return 'No runnable nodes · root unresolved';
  return 'Ready';
}
export function importRun(raw){
  check(typeof raw==='string'&&raw.length<8_000_000,'Import is too large (8 MB maximum).');
  const s=JSON.parse(raw);
  check(s&&s.format==='tangle-pocket-1','Not a Tangle Pocket Lab export.');
  check(['simulation','live'].includes(s.mode)&&text(s.seed,400),'Invalid run metadata.');
  check(Array.isArray(s.nodes)&&s.nodes.length>=1&&s.nodes.length<=150,'Invalid node count.');
  check(Array.isArray(s.evidence)&&s.evidence.length<=300,'Invalid evidence count.');
  check(Array.isArray(s.trace)&&s.trace.length<=5000,'Invalid trace count.');
  const nodeIds=new Set(), evidenceIds=new Set();
  for(const e of s.evidence){
    check(/^e\d+$/.test(e.id)&&!evidenceIds.has(e.id)&&text(e.text,16000)&&text(e.title,300),'Invalid evidence.');
    evidenceIds.add(e.id);
    check(['wiki','fixture'].includes(e.kind),'Unknown evidence kind.');
    if(e.url){const u=new URL(e.url);check(u.protocol==='https:'&&u.hostname==='en.wikipedia.org'&&!u.username&&!u.password,'Unsafe evidence URL.');}
  }
  for(const n of s.nodes){
    check(/^n\d+$/.test(n.id)&&!nodeIds.has(n.id),'Invalid or duplicate node ID.');nodeIds.add(n.id);
    check(text(n.question,400)&&['open','waiting','resolved','blocked','error','working'].includes(n.status),'Invalid node.');
    check(typeof n.finding==='string'&&n.finding.length<=1400&&typeof n.reason==='string'&&n.reason.length<=4000,'Invalid node text.');
    check(Number.isInteger(n.visits)&&n.visits>=0&&n.visits<=10000,'Invalid visits.');
    for(const key of ['evidence','observed'])check(Array.isArray(n[key])&&n[key].length<=300&&n[key].every(id=>evidenceIds.has(id)),'Missing evidence reference.');
  }
  check(s.nodes[0].id==='n1'&&s.nodes[0].parent===null,'Invalid root.');
  for(const n of s.nodes){
    let p=n,depth=0;const seen=new Set();
    while(p.parent!==null){
      check(!seen.has(p.id),'Cycle in parent references.');seen.add(p.id);
      p=s.nodes.find(x=>x.id===p.parent);check(p,'Missing parent.');depth++;
    }
    check(p.id==='n1'&&depth===n.depth,'Disconnected node or invalid depth.');
    if(n.status==='working'){n.status='error';n.reason='Exported while in progress; inspect only.';}
  }
  for(const k of ['visits','modelCalls','tokens','lookups'])check(Number.isFinite(s[k])&&s[k]>=0,'Invalid counters.');
  s.readOnly=true;return s;
}
