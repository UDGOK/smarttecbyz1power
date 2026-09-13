import test from 'node:test';
import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import {setImmediate as nextTurn,setTimeout as delay} from 'node:timers/promises';
import {abortable,fetchBytes,waitUntilReady} from '../src/smarttec-campus/resources.mjs';

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function waitForAbort(signal){return new Promise((resolve,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});}
const noListeners=signal=>assert.equal(getEventListeners(signal,'abort').length,0,'settled work releases its parent abort listener');

test('abortable returns its asset and detaches cancellation after success',async()=>{
 const controller=new AbortController(),source=deferred(),asset={scene:'active'},disposed=[];
 const result=abortable(source.promise,controller.signal,value=>disposed.push(value));
 source.resolve(asset);assert.equal(await result,asset);noListeners(controller.signal);
 controller.abort(new Error('A later load was cancelled'));await nextTurn();assert.deepEqual(disposed,[],'active assets must not be disposed by a later cancellation');
});

test('abortable forwards the original rejection and releases its listener',async()=>{
 const controller=new AbortController(),failure=new Error('Decode failed'),disposed=[];
 const result=abortable(Promise.reject(failure),controller.signal,value=>disposed.push(value));
 await assert.rejects(result,error=>error===failure);noListeners(controller.signal);assert.deepEqual(disposed,[]);
});

test('abortable rejects promptly and disposes a late decoded asset exactly once',async()=>{
 const controller=new AbortController(),source=deferred(),reason=new Error('Superseded attempt'),asset={scene:'late'},disposed=[];
 const result=abortable(source.promise,controller.signal,value=>disposed.push(value));
 const rejected=assert.rejects(result,error=>error===reason);controller.abort(reason);await rejected;
 assert.deepEqual(disposed,[],'cancellation does not invent an asset to dispose');
 source.resolve(asset);await nextTurn();controller.abort(new Error('Repeated cancellation'));await nextTurn();
 assert.deepEqual(disposed,[asset]);noListeners(controller.signal);
});

test('abortable handles an already-aborted attempt and still cleans up its late result',async()=>{
 const controller=new AbortController(),reason=new Error('Cancelled before import'),source=deferred(),disposed=[];controller.abort(reason);
 const result=abortable(source.promise,controller.signal,value=>disposed.push(value));
 await assert.rejects(result,error=>error===reason);noListeners(controller.signal);
 const asset={scene:'late after early abort'};source.resolve(asset);await nextTurn();assert.deepEqual(disposed,[asset]);
});

test('a late rejection after cancellation is consumed without a second failure',async()=>{
 const controller=new AbortController(),source=deferred(),reason=new Error('Cancelled'),disposed=[];
 const result=abortable(source.promise,controller.signal,value=>disposed.push(value));
 const rejected=assert.rejects(result,error=>error===reason);controller.abort(reason);await rejected;
 source.reject(new Error('Decoder rejected after its caller left'));await nextTurn();await nextTurn();
 assert.deepEqual(disposed,[]);noListeners(controller.signal);
 // Node's test runner also fails this test if the late rejection is unhandled.
});

test('fetchBytes returns the complete body and cancels its timeout after success',async t=>{
 const parent=new AbortController(),bytes=new Uint8Array([0x67,0x6c,0x54,0x46]),body=deferred();let child;
 t.mock.method(globalThis,'fetch',async(url,{signal})=>{assert.equal(url,'/campus.glb');child=signal;return {ok:true,arrayBuffer:()=>body.promise};});
 const result=fetchBytes('/campus.glb',parent.signal,20);body.resolve(bytes.buffer);
 assert.deepEqual(new Uint8Array(await result),bytes);assert.notEqual(child,parent.signal);noListeners(parent.signal);
 await delay(35);assert.equal(child.aborted,false,'completed request does not receive a stale timeout');
 parent.abort(new Error('Later cancellation'));assert.equal(child.aborted,false,'completed request detached from its parent');
});

test('fetchBytes rejects HTTP failure without reading its body',async t=>{
 const parent=new AbortController();let readBody=false;
 t.mock.method(globalThis,'fetch',async()=>({ok:false,status:503,arrayBuffer:async()=>{readBody=true;return new ArrayBuffer(0);}}));
 await assert.rejects(fetchBytes('/campus.glb',parent.signal,1000),/503/);assert.equal(readBody,false);noListeners(parent.signal);
});

test('fetchBytes propagates parent cancellation while waiting for headers',async t=>{
 const parent=new AbortController(),reason=new Error('New renderer requested');let child;
 t.mock.method(globalThis,'fetch',(url,{signal})=>{child=signal;return waitForAbort(signal);});
 const result=fetchBytes('/campus.glb',parent.signal,1000),rejected=assert.rejects(result,error=>error===reason);
 parent.abort(reason);await rejected;assert.equal(child.aborted,true);assert.equal(child.reason,reason);noListeners(parent.signal);
});

test('fetchBytes propagates cancellation after headers while body is pending',async t=>{
 const parent=new AbortController(),reason=new Error('Page left during body transfer'),started=deferred();let child;
 t.mock.method(globalThis,'fetch',async(url,{signal})=>{child=signal;return {ok:true,arrayBuffer(){started.resolve();return waitForAbort(signal);}};});
 const result=fetchBytes('/campus.glb',parent.signal,1000),rejected=assert.rejects(result,error=>error===reason);
 await started.promise;parent.abort(reason);await rejected;assert.equal(child.reason,reason);noListeners(parent.signal);
});

test('fetchBytes timeout covers stalled response bodies, without aborting its parent',async t=>{
 const parent=new AbortController(),started=deferred();let child;
 t.mock.method(globalThis,'fetch',async(url,{signal})=>{child=signal;return {ok:true,arrayBuffer(){started.resolve();return waitForAbort(signal);}};});
 const result=fetchBytes('/campus.glb',parent.signal,20),rejected=assert.rejects(result,/timed out/i);
 await started.promise;await rejected;assert.equal(child.aborted,true);assert.equal(parent.signal.aborted,false);noListeners(parent.signal);
});

test('fetchBytes forwards an already-aborted parent to fetch immediately',async t=>{
 const parent=new AbortController(),reason=new Error('Already cancelled');parent.abort(reason);let calls=0;
 t.mock.method(globalThis,'fetch',(url,{signal})=>{calls++;assert.equal(signal.aborted,true);assert.equal(signal.reason,reason);return waitForAbort(signal);});
 await assert.rejects(fetchBytes('/campus.glb',parent.signal,1000),error=>error===reason);assert.equal(calls,1);noListeners(parent.signal);
});

test('waitUntilReady resolves when readiness changes and then stops polling',async()=>{
 const parent=new AbortController();let calls=0;
 await waitUntilReady(()=>++calls===3,parent.signal);assert.equal(calls,3);noListeners(parent.signal);
 await delay(40);assert.equal(calls,3,'successful readiness does not leave a polling timer');
});

test('waitUntilReady cancellation stops checks before disposed programs can be read',async()=>{
 const parent=new AbortController(),reason=new Error('Renderer disposed');let calls=0;
 const result=waitUntilReady(()=>{calls++;return false;},parent.signal),rejected=assert.rejects(result,error=>error===reason);
 assert.equal(calls,1,'initial check ran');parent.abort(reason);await rejected;
 const stoppedAt=calls;await delay(50);assert.equal(calls,stoppedAt,'no readiness check after disposal');noListeners(parent.signal);
});

test('waitUntilReady never checks an already-aborted renderer',async()=>{
 const parent=new AbortController(),reason=new Error('Renderer already disposed');parent.abort(reason);let calls=0;
 await assert.rejects(waitUntilReady(()=>{calls++;return true;},parent.signal),error=>error===reason);
 assert.equal(calls,0);noListeners(parent.signal);
});

test('waitUntilReady rejects a thrown readiness error and clears polling',async()=>{
 const parent=new AbortController(),failure=new Error('Program became unavailable');let calls=0;
 await assert.rejects(waitUntilReady(()=>{calls++;if(calls===2)throw failure;return false;},parent.signal),error=>error===failure);
 assert.equal(calls,2);await delay(40);assert.equal(calls,2);noListeners(parent.signal);
});
