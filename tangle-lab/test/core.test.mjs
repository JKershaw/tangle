import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, nextNode, applyResult, addEvidence, buildContext, parseResult, importRun } from '../src/core.js';

test('a parent waits, then revisits rather than auto-resolving', () => {
  const s = createRun('seed', 'simulation');
  applyResult(s, 'n1', {action:'decompose', questions:['a','b']}, []);
  assert.equal(nextNode(s).id, 'n2');
  for (const id of ['n2','n3']) {
    const e = addEvidence(s, id, {title:'fixture', text:'observed text', kind:'fixture'});
    applyResult(s,id,{action:'resolved',finding:'claim',evidence:[e.id]},[e.id]);
  }
  assert.equal(s.nodes[0].status,'waiting');
  assert.equal(nextNode(s).id,'n1');
  applyResult(s,'n1',{action:'decompose',questions:['a new question']},[]);
  assert.equal(nextNode(s).id,'n4');
});

test('uninspected evidence cannot be cited; rejection is atomic', () => {
  const s = createRun('seed','live');
  const before=JSON.stringify(s);
  assert.throws(()=>applyResult(s,'n1',{action:'resolved',finding:'claim',evidence:['e99']},[]));
  assert.equal(JSON.stringify(s),before);
});

test('blocked children leave their parent unresolved', () => {
  const s=createRun('seed','live');
  applyResult(s,'n1',{action:'decompose',questions:['child']},[]);
  applyResult(s,'n2',{action:'blocked',reason:'no source'},[]);
  assert.equal(nextNode(s),null);
  assert.equal(s.nodes[0].status,'waiting');
});

test('bounded context includes child findings, never sibling findings', () => {
  const s=createRun('root secret','live');
  applyResult(s,'n1',{action:'decompose',questions:['left','right']},[]);
  const e=addEvidence(s,'n2',{title:'x',text:'evidence',kind:'wiki',url:'https://en.wikipedia.org/wiki/X'});
  applyResult(s,'n2',{action:'resolved',finding:'left secret',evidence:[e.id]},[e.id]);
  const context=buildContext(s,s.nodes[2]);
  assert.ok(!JSON.stringify(context).includes('left secret'));
  assert.ok(!JSON.stringify(context).includes('root secret'));
  assert.ok(JSON.stringify(buildContext(s,s.nodes[0])).includes('left secret'));
});

test('node and depth ceilings reject mutations without inventing completion', () => {
  const s=createRun('seed','live',{maxNodes:2,maxDepth:1});
  assert.throws(()=>applyResult(s,'n1',{action:'decompose',questions:['a','b']},[]),/limit/i);
  assert.equal(s.nodes.length,1);
  applyResult(s,'n1',{action:'decompose',questions:['a']},[]);
  assert.throws(()=>applyResult(s,'n2',{action:'decompose',questions:['b']},[]),/limit/i);
});

test('duplicates are retained as observations',()=>{
  const s=createRun('seed','live');
  applyResult(s,'n1',{action:'decompose',questions:['same','same']},[]);
  assert.equal(s.nodes.length,3);
});

test('parser accepts fenced JSON but never evaluates code',()=>{
  assert.equal(parseResult('```json\n{"action":"blocked","reason":"unknown"}\n```').action,'blocked');
  assert.throws(()=>parseResult('window.alert(1)'));
});

test('export imports as data; cyclic references and unsafe URLs are rejected',()=>{
  const s=createRun('seed','simulation');
  assert.equal(importRun(JSON.stringify(s)).nodes[0].question,'seed');
  s.nodes[0].parent='n1';
  assert.throws(()=>importRun(JSON.stringify(s)));
  s.nodes[0].parent=null;
  s.evidence.push({id:'e1',title:'evil',text:'x',kind:'wiki',url:'javascript:alert(1)'});
  assert.throws(()=>importRun(JSON.stringify(s)));
});
