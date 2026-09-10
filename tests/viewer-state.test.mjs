// DOM state regression without a browser/GPU. This is not visual/WebGL QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mountCampus} from '../src/smarttec-architecture/campus-viewer.mjs';
test('image chapters, graphics fallback and repeated back-forward restores remain accurate',async()=>{
 const saved={};for(const k of ['document','window','matchMedia','IntersectionObserver','cancelAnimationFrame'])saved[k]=globalThis[k];
 const element=()=>({dataset:{},style:{},hidden:false,textContent:'',attributes:{},setAttribute(k,v){this.attributes[k]=v;},replaceChildren(){},addEventListener(){}});
 const ids=['sta-canvas','sta-poster','sta-stage','sta-status','sta-mode','sta-reset','sta-launch','sta-image','sta-image-disclosure','sta-title','sta-description','sta-development-status','sta-fact'];
 const nodes=Object.fromEntries(ids.map(id=>['#'+id,element()]));
 const buttons=['manufacturing','compute','energy','overview'].map(key=>Object.assign(element(),{dataset:{staView:key}}));
 const lifecycle=new EventTarget();let observations=0,disconnections=0;
 globalThis.document={querySelector:s=>nodes[s],querySelectorAll:()=>buttons};globalThis.window=lifecycle;
 globalThis.matchMedia=()=>({matches:true});globalThis.IntersectionObserver=class{observe(){observations++;}disconnect(){disconnections++;}};globalThis.cancelAnimationFrame=()=>{};
 const warn=console.warn;console.warn=()=>{};
 try{
  mountCampus();assert.equal(nodes['#sta-mode'].textContent,'CONCEPT IMAGE');assert.equal(nodes['#sta-canvas'].hidden,true);
  buttons[1].onclick();assert.match(nodes['#sta-poster'].src,/concept-compute$/);assert.match(nodes['#sta-poster'].alt,/not installed/);
  await nodes['#sta-launch'].onclick();assert.equal(nodes['#sta-mode'].textContent,'3D UNAVAILABLE · IMAGE VIEW');assert.equal(nodes['#sta-launch'].disabled,false);
  buttons[2].onclick();assert.match(nodes['#sta-poster'].src,/concept-energy$/);assert.equal(nodes['#sta-mode'].textContent,'3D UNAVAILABLE · IMAGE VIEW');
  nodes['#sta-image'].onclick();assert.equal(nodes['#sta-mode'].textContent,'CONCEPT IMAGE');
  buttons[3].onclick();assert.match(nodes['#sta-image-disclosure'].textContent,/MODEL PREVIEW/);assert.match(nodes['#sta-poster'].alt,/Geometry-rendered/);
  for(let visit=1;visit<=2;visit++){
   // Suspend during the asynchronous model import, then restore the same DOM.
   const interrupted=nodes['#sta-launch'].onclick();
   assert.equal(nodes['#sta-launch'].disabled,true);
   lifecycle.dispatchEvent(new Event('pagehide'));
   lifecycle.dispatchEvent(new Event('pageshow'));
   await interrupted;
   assert.equal(nodes['#sta-mode'].textContent,'MODEL PREVIEW');
   assert.equal(nodes['#sta-canvas'].hidden,true);
   assert.equal(nodes['#sta-launch'].disabled,false);
   assert.equal(nodes['#sta-launch'].attributes['aria-pressed'],'false');
   assert.match(nodes['#sta-poster'].src,/architecture-overview$/);
   assert.equal(observations,visit+1);assert.equal(disconnections,visit);
   // A fresh retry must execute and reach the normal no-GPU fallback, rather
   // than silently staying in the loading state because ended is still true.
   await nodes['#sta-launch'].onclick();
   assert.equal(nodes['#sta-mode'].textContent,'3D UNAVAILABLE · IMAGE VIEW');
   nodes['#sta-image'].onclick();
  }
 }finally{console.warn=warn;for(const [k,v]of Object.entries(saved))if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
});
