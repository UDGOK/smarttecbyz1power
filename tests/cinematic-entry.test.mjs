import test from 'node:test';
import assert from 'node:assert/strict';
import {initLoader,INTRO_DURATION_MS,REDUCED_INTRO_MS,FADE_MS} from '../src/lib/loader.ts';
import {mountCinematic} from '../src/lib/cinematic.mjs';
import {mountMenuPreview} from '../src/lib/menu-preview.mjs';

class Element extends EventTarget{
 dataset={};attributes={};hidden=false;style={values:{},setProperty(k,v){this.values[k]=v;}};
 classList={values:new Set(),add(v){this.values.add(v);},contains(v){return this.values.has(v);}};
 setAttribute(k,v){this.attributes[k]=v;}getAttribute(k){return this.attributes[k];}removeAttribute(k){delete this.attributes[k];}
 toggleAttribute(k,on){if(on)this.attributes[k]='';else delete this.attributes[k];}
 focus(){document.activeElement=this;this.dispatchEvent(new Event('focus'));}
 click(extra={}){const event=new Event('click',{cancelable:true});Object.assign(event,{button:0,...extra});this.dispatchEvent(event);return event;}
 closest(){return null;}getBoundingClientRect(){return{left:0,top:0,width:1000,height:700};}
}
function environment(){
 const keys=['window','document','matchMedia','requestAnimationFrame','cancelAnimationFrame'];
 const saved=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const window=new EventTarget(),document=new Element(),motion=new Element(),pointer=new Element();motion.matches=false;pointer.matches=true;document.hidden=false;document.body={dataset:{}};
 const frames=new Map(),timers=new Map();let next=0;
  window.setTimeout=(fn,delay)=>{timers.set(++next,{fn,delay});return next;};
 window.clearTimeout=id=>timers.delete(id);
 const storage=new Map();window.sessionStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))};
 window.matchMedia=query=>query.includes('reduced-motion')?motion:pointer;
 const env={window,document,matchMedia:window.matchMedia,requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id)};
 for(const[k,v]of Object.entries(env))Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true});
 return{...env,motion,pointer,frames,timers,storage,fire(delay){const timer=[...timers].find(([,t])=>t.delay===delay);assert.ok(timer,`expected timer with delay ${delay}`);timers.delete(timer[0]);timer[1].fn();},flush(){const f=[...frames.values()];frames.clear();f.forEach(fn=>fn());},restore(){for(const[k,v]of Object.entries(saved)){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}};
}
function entrance(){const e=environment(),loader=new Element(),enter=new Element(),main=new Element();main.setAttribute('inert','');e.document.body.dataset.entryPending='';loader.querySelector=s=>s==='#loader-skip'?enter:null;e.document.querySelector=s=>s==='#loader'?loader:s==='#main'?main:null;e.document.querySelectorAll=()=>[main];return{...e,loader,enter,main};}
function assertReleased(e){assert.ok(!('entryPending' in e.document.body.dataset));assert.ok(!('inert' in e.main.attributes));assert.equal(e.loader.hidden,true);assert.equal(e.loader.classList.contains('is-done'),true);}
function pageShow(e,persisted=true){const event=new Event('pageshow');Object.assign(event,{persisted});e.window.dispatchEvent(event);}
test('first visit enters automatically after the short reveal without audio or a gesture',()=>{
 const e=entrance();try{let starts=0,gestures=0;assert.equal(INTRO_DURATION_MS,4200);initLoader(()=>starts++,()=>gestures++);for(const type of ['wheel','pointerdown','touchstart','keydown'])e.window.dispatchEvent(new Event(type));assert.equal(starts,0);assert.ok('inert' in e.main.attributes);e.fire(INTRO_DURATION_MS);assert.equal(starts,0);e.fire(FADE_MS);assert.equal(starts,1);assert.equal(gestures,0);assertReleased(e);assert.equal(e.document.activeElement,e.main);assert.ok(e.storage.get('smarttec:intro-seen'));assert.equal(e.timers.size,0);}finally{e.restore();}
});
test('Skip cancels automatic entry, tolerates unavailable audio and completes once',()=>{
 const e=entrance();try{let starts=0,gestures=0;initLoader(()=>starts++,()=>{gestures++;throw new Error('audio unavailable');});const staleAuto=[...e.timers.values()][0].fn;assert.equal(e.enter.click().defaultPrevented,true);e.enter.click();staleAuto();assert.equal(starts,0);assert.equal(gestures,1);assert.equal(e.timers.size,1);e.fire(FADE_MS);assert.equal(starts,1);assertReleased(e);assert.equal(e.document.activeElement,e.main);assert.equal(e.timers.size,0);}finally{e.restore();}
});
test('automatic fade wins a simultaneous Skip without a second completion or audio',()=>{
 const e=entrance();try{let starts=0,gestures=0;initLoader(()=>starts++,()=>gestures++);e.fire(INTRO_DURATION_MS);e.enter.click();e.fire(FADE_MS);e.enter.click();assert.equal(starts,1);assert.equal(gestures,0);assert.equal(e.timers.size,0);}finally{e.restore();}
});
test('modified Skip clicks preserve their native destination and do not enter early',()=>{
 const e=entrance();try{let starts=0;initLoader(()=>starts++);for(const extra of [{ctrlKey:true},{metaKey:true},{altKey:true},{shiftKey:true},{button:1}])assert.equal(e.enter.click(extra).defaultPrevented,false);assert.equal(starts,0);assert.equal(e.timers.size,1);e.fire(INTRO_DURATION_MS);e.fire(FADE_MS);assert.equal(starts,1);}finally{e.restore();}
});
for(const quick of ['reduced motion','repeat visit','hidden startup'])test(`${quick} enters nearly immediately without the animated fade`,()=>{
 const e=entrance();try{let starts=0,gestures=0;if(quick==='reduced motion')e.motion.matches=true;if(quick==='repeat visit')e.storage.set('smarttec:intro-seen','true');if(quick==='hidden startup')e.document.hidden=true;assert.equal(REDUCED_INTRO_MS,80);initLoader(()=>starts++,()=>gestures++);e.fire(REDUCED_INTRO_MS);e.fire(0);assert.equal(starts,1);assert.equal(gestures,0);assertReleased(e);assert.equal(e.timers.size,0);}finally{e.restore();}
});
for(const interruption of ['tab becomes hidden','reduced motion enabled'])test(`${interruption} completes silently without waiting for the reveal`,()=>{
 const e=entrance();try{let starts=0,gestures=0;initLoader(()=>starts++,()=>gestures++);if(interruption==='tab becomes hidden'){e.document.hidden=true;e.document.dispatchEvent(new Event('visibilitychange'));}else{e.motion.matches=true;e.motion.dispatchEvent(new Event('change'));}e.fire(0);assert.equal(starts,1);assert.equal(gestures,0);assertReleased(e);assert.equal(e.timers.size,0);}finally{e.restore();}
});
for(const interruption of ['tab becomes hidden','reduced motion enabled'])test(`${interruption} also releases an entrance already fading`,()=>{
 const e=entrance();try{let starts=0;initLoader(()=>starts++);e.fire(INTRO_DURATION_MS);if(interruption==='tab becomes hidden'){e.document.hidden=true;e.document.dispatchEvent(new Event('visibilitychange'));}else{e.motion.matches=true;e.motion.dispatchEvent(new Event('change'));}assert.equal(e.timers.size,1);e.fire(0);assert.equal(starts,1);assertReleased(e);assert.equal(e.timers.size,0);}finally{e.restore();}
});
for(const duringFade of [false,true])test(`pagehide ${duringFade?'during the fade':'during the reveal'} releases content and starts once on persisted return`,()=>{
 const e=entrance();try{let starts=0;initLoader(()=>starts++);if(duringFade)e.fire(INTRO_DURATION_MS);e.window.dispatchEvent(new Event('pagehide'));assert.equal(starts,0);assert.equal(e.timers.size,0);assertReleased(e);pageShow(e,false);assert.equal(starts,0);pageShow(e);assert.equal(starts,1);pageShow(e);assert.equal(starts,1);}finally{e.restore();}
});
test('returning from browser history after completed entry does not reboot the experience',()=>{
 const e=entrance();try{let starts=0;initLoader(()=>starts++);e.fire(INTRO_DURATION_MS);e.fire(FADE_MS);e.window.dispatchEvent(new Event('pagehide'));pageShow(e);assert.equal(starts,1);assert.equal(e.timers.size,0);}finally{e.restore();}
});
test('mounting the entrance twice does not duplicate timers or completion',()=>{
 const e=entrance();try{let starts=0;initLoader(()=>starts++);initLoader(()=>starts++);assert.equal(e.timers.size,1);e.fire(INTRO_DURATION_MS);e.fire(FADE_MS);assert.equal(starts,1);}finally{e.restore();}
});
test('unavailable session storage never blocks first-visit entry',()=>{
 const e=entrance();try{let starts=0;e.window.sessionStorage={getItem(){throw new Error('storage blocked');},setItem(){throw new Error('storage blocked');}};initLoader(()=>starts++);e.fire(INTRO_DURATION_MS);e.fire(FADE_MS);assert.equal(starts,1);assertReleased(e);}finally{e.restore();}
});
test('cinematic controls expose matching detail and preserve pause across tab/menu lifecycle',()=>{
 const e=environment();try{
  const root=new Element();root.dataset={light:'dusk',flow:'off'};
  const buttons=[0,1,2,0,1,2].map(n=>{const b=new Element();b.dataset.cinemaSelect=String(n);return b;});
  const panels=[0,1,2].map(n=>{const p=new Element();p.dataset.cinemaDetail=String(n);return p;});const light=new Element(),flow=new Element();
  root.querySelector=s=>s==='[data-cinema-light]'?light:flow;root.querySelectorAll=s=>s==='[data-cinema-select]'?buttons:panels;
  mountCinematic(root);mountCinematic(root);buttons[4].click();assert.deepEqual(panels.map(p=>p.hidden),[true,false,true]);assert.deepEqual(buttons.map(b=>b.attributes['aria-pressed']),['false','true','false','false','true','false']);
  light.click();flow.click();assert.equal(root.dataset.light,'bright');assert.equal(root.dataset.flow,'on');assert.equal(flow.attributes['aria-pressed'],'true');
  e.window.dispatchEvent(new CustomEvent('smarttec:menu-change',{detail:{open:true}}));e.document.hidden=true;e.document.dispatchEvent(new Event('visibilitychange'));e.document.hidden=false;e.document.dispatchEvent(new Event('visibilitychange'));assert.equal(root.dataset.paused,'true');
  e.window.dispatchEvent(new CustomEvent('smarttec:menu-change',{detail:{open:false}}));assert.equal(root.dataset.paused,'false');
  const move=new Event('pointermove');Object.assign(move,{clientX:800,clientY:500});root.dispatchEvent(move);assert.equal(e.frames.size,1);e.window.dispatchEvent(new Event('pagehide'));assert.equal(e.frames.size,0);assert.equal(root.dataset.paused,'true');e.window.dispatchEvent(new Event('pageshow'));assert.equal(root.dataset.paused,'false');
  e.motion.matches=true;root.dispatchEvent(move);assert.equal(e.frames.size,0);
 }finally{e.restore();}
});
test('menu previews work by keyboard without changing current-page truth or loading on mount',()=>{
 const e=environment();try{
  const menu=new Element(),image=new Element(),heading=new Element(),caption=new Element(),link=new Element();let src='';Object.defineProperty(image,'src',{get:()=>src,set:v=>{src=v;image.setAttribute('src',v);}});image.complete=false;image.naturalWidth=0;
  const nodes={'[data-preview-image]':image,'[data-preview-heading]':heading,'[data-preview-caption]':caption,'[data-preview-link]':link};
  const links=['/site','/compute','/model-planner'].map((href,i)=>{const a=new Element();a.setAttribute('href',href);a.dataset={previewArt:i===0?'campus.webp':'compute.webp',previewTitle:href,previewNote:'Concept'};return a;});links[0].setAttribute('aria-current','page');
  menu.querySelector=s=>nodes[s];menu.querySelectorAll=()=>links;e.document.querySelector=()=>menu;mountMenuPreview();assert.equal(src,'');e.window.dispatchEvent(new CustomEvent('smarttec:menu-change',{detail:{open:true}}));assert.equal(src,'campus.webp');
  links[1].focus();const old=image.onload;links[2].focus();assert.equal(link.href,'/model-planner');old();assert.equal(image.hidden,true);image.onload();assert.equal(image.hidden,false);assert.equal(links[0].getAttribute('aria-current'),'page');assert.equal(links[2].getAttribute('aria-current'),undefined);assert.equal(heading.textContent,'/model-planner');
 }finally{e.restore();}
});
