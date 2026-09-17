import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun,nextNode,importRun} from '../src/core.js';
import {SEED} from '../src/simulation.js';
import {visit} from '../src/runner.js';
const signal=()=>new AbortController().signal;

test('precomputed run grows and resolves with a parent revisit',async()=>{
  const s=createRun(SEED,'simulation');
  while(nextNode(s)&&!s.stopReason)await visit(s,{signal:signal(),preset:'revisit'});
  assert.equal(s.nodes[0].status,'resolved');
  assert.equal(s.nodes[0].visits,3);
  assert.equal(s.nodes.length,9);
  assert.equal(s.visits,13);
  assert.ok(s.evidence.every(e=>e.kind==='fixture'));
  assert.equal(importRun(JSON.stringify(s)).nodes.length,9);
});
test('blocked scenario preserves an unresolved parent',async()=>{
  const s=createRun(SEED,'simulation');
  while(nextNode(s)&&!s.stopReason)await visit(s,{signal:signal(),preset:'blocked'});
  assert.equal(s.nodes[0].status,'waiting');
  assert.ok(s.nodes.some(n=>n.status==='blocked'));
  assert.equal(nextNode(s),null);
});
test('repeating scenario stops at the depth ceiling, without removing repeats',async()=>{
  const s=createRun(SEED,'simulation');
  while(nextNode(s)&&!s.stopReason)await visit(s,{signal:signal(),preset:'repeat'});
  assert.equal(s.nodes.length,7);
  assert.equal(s.nodes[6].status,'error');
  assert.match(s.nodes[6].reason,/Depth safety/);
});
test('live path requests a tool and uses observed source IDs',async()=>{
  const s=createRun('What is evaporation?','live');let calls=0;
  await visit(s,{signal:signal(),generate:async()=>({text:JSON.stringify(++calls===1?{action:'wiki',query:'Evaporation'}:{action:'resolved',finding:'Liquid becomes vapour.',evidence:['e1']}),tokens:12}),
    wiki:async()=>({ok:true,kind:'wiki',title:'Evaporation',text:'Liquid becomes vapour.',url:'https://en.wikipedia.org/wiki/Evaporation'})});
  assert.equal(s.nodes[0].status,'resolved');assert.equal(s.modelCalls,2);assert.equal(s.tokens,24);assert.equal(s.lookups,1);
});
test('denied Wikipedia request never reaches the network',async()=>{
  const s=createRun('a','live');let network=0;
  await visit(s,{signal:signal(),generate:async()=>({text:'{"action":"wiki","query":"x"}'}),approve:async()=>false,wiki:async()=>{network++;}});
  assert.equal(network,0);assert.equal(s.nodes[0].status,'blocked');
});
test('malformed model output is recorded and pauses without mutation',async()=>{
  const s=createRun('a','live');
  await visit(s,{signal:signal(),generate:async()=>({text:'not JSON'})});
  assert.equal(s.nodes.length,1);assert.equal(s.nodes[0].status,'error');assert.ok(s.trace.some(e=>e.raw==='not JSON'));
});
test('stop cancels a visit but never marks it resolved',async()=>{
  const s=createRun('a','live'),c=new AbortController();
  await visit(s,{signal:c.signal,generate:async()=>{c.abort();return{text:'{"action":"blocked","reason":"x"}'};}});
  assert.equal(s.nodes[0].status,'open');assert.ok(s.trace.some(e=>e.event==='node_cancelled'));
});
