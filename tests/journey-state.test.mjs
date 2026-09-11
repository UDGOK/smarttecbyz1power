// State checks only. Native dialog focus/inert behavior and visual layout still
// need a browser pass on the Vercel preview; this fixture does not claim that.
import test from 'node:test';
import assert from 'node:assert/strict';
import {journey} from '../src/smarttec-investor/data/journey.mjs';
import {mountJourney} from '../src/smarttec-investor/client/journey.mjs';

test('chapter tracking survives a tall calculator, short viewport and browser restore',()=>{
  const keys=['document','window','innerHeight','requestAnimationFrame','cancelAnimationFrame','ResizeObserver'];
  const saved=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  class Node extends EventTarget{
    dataset={};hidden=true;attributes={};textContent='';open=false;
    classList={contains:()=>false};
    setAttribute(key,value){this.attributes[key]=value;}
    removeAttribute(key){delete this.attributes[key];}
    getAttribute(key){return this.attributes[key];}
    focus(){focused=this;}
    showModal(){this.open=true;}
    close(){this.open=false;this.dispatchEvent(new Event('close'));}
    querySelector(){return this.child;}
    querySelectorAll(){return this.children||[];}
  }
  let focused,scroll=0,queued=new Map(),sequence=0,resize;
  const lifecycle=new EventTarget();
  const selectors=['.inv-journey-dock','#inv-journey-prev','#inv-journey-next','#inv-ruler-label','#inv-journey-count','#inv-journey-title'];
  const nodes=Object.fromEntries(selectors.map(selector=>[selector,new Node()]));
  nodes['#inv-journey-next'].child=new Node();
  const positions=[0,450,900,2000,3000,4000,14000,15000];
  const sections=journey.map((chapter,index)=>{const section=new Node();section.child=new Node();section.getBoundingClientRect=()=>({top:positions[index]-scroll});nodes['#'+chapter.id]=section;return section;});
  const links=journey.map(chapter=>{const link=new Node();link.dataset.invChapter=chapter.id;link.attributes.href='#'+chapter.id;return link;});
  globalThis.document={querySelector:s=>nodes[s],getElementById:id=>nodes['#'+id],querySelectorAll:()=>links};
  globalThis.window=lifecycle;globalThis.innerHeight=800;
  globalThis.requestAnimationFrame=callback=>{queued.set(++sequence,callback);return sequence;};
  globalThis.cancelAnimationFrame=id=>queued.delete(id);
  globalThis.ResizeObserver=class{constructor(callback){resize=callback;}observe(){}};
  const flush=()=>{const callbacks=[...queued.values()];queued.clear();callbacks.forEach(callback=>callback());};
  const move=position=>{scroll=position;lifecycle.dispatchEvent(new Event('scroll'));flush();};
  try{
    mountJourney();assert.equal(nodes['.inv-journey-dock'].hidden,false);
    assert.equal(nodes['#inv-journey-title'].textContent,'The opportunity');
    assert.equal(nodes['#inv-journey-count'].textContent,'01 / 08');
    assert.equal(nodes['#inv-journey-next'].href,'#investor-presentation','The opening must lead to the presentation instead of skipping it');
    assert.equal(nodes['#inv-journey-next'].getAttribute('aria-label'),'Next chapter: Immersive pitch & PDF');
    move(450);assert.equal(nodes['#inv-journey-title'].textContent,'Immersive pitch & PDF');
    assert.equal(nodes['#inv-journey-prev'].href,'#opportunity');
    assert.equal(nodes['#inv-journey-next'].href,'#campus');
    move(4100);assert.equal(nodes['#inv-journey-title'].textContent,'Test the economics');
    move(11000);assert.equal(nodes['#inv-journey-title'].textContent,'Test the economics');
    assert.equal(nodes['#inv-journey-next'].href,'#evidence');
    // Anchor positioning includes the fixed header clearance, even landscape.
    globalThis.innerHeight=340;move(14000-190);
    assert.equal(nodes['#inv-journey-title'].textContent,'Review the evidence');
    const returnsIndex=journey.findIndex(chapter=>chapter.id==='returns');
    links[returnsIndex].dispatchEvent(new Event('click'));
    assert.equal(focused,sections[returnsIndex].child);
    lifecycle.dispatchEvent(new Event('pagehide'));lifecycle.dispatchEvent(new Event('pageshow'));flush();
    move(15100);assert.equal(nodes['#inv-journey-next'].href,'#opportunity');
    assert.equal(nodes['#inv-journey-next'].child.textContent,'Start');
    // Content can expand above the reader without a new scroll event.
    positions[journey.findIndex(chapter=>chapter.id==='questions')]=16000;resize();flush();assert.equal(nodes['#inv-journey-title'].textContent,'Review the evidence');
  }finally{for(const key of keys){if(saved[key]===undefined)delete globalThis[key];else globalThis[key]=saved[key];}}
});
