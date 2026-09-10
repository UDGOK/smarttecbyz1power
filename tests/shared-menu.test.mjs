// Navigation lifecycle regression. Native visual focus behavior needs browser QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import {initMenu} from '../src/lib/menu.ts';

function fixture(){
  const keys=['document','window','requestAnimationFrame','cancelAnimationFrame'];
  const saved=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  const classes=()=>{const set=new Set();return{add:x=>set.add(x),remove:x=>set.delete(x),contains:x=>set.has(x),toggle:(x,on)=>on?set.add(x):set.delete(x)}};
  class Element extends EventTarget{
    attributes={};hidden=true;open=false;classList=classes();
    setAttribute(key,value){this.attributes[key]=value;if(key==='open')this.open=true;}
    getAttribute(key){return this.attributes[key];}
    removeAttribute(key){delete this.attributes[key];if(key==='open')this.open=false;}
    focus(){document.activeElement=this;}
    showModal(){this.open=true;}
    close(){this.open=false;this.dispatchEvent(new Event('close'));}
    click(){this.dispatchEvent(new Event('click'));}
  }
  const opener=new Element(),menu=new Element(),closer=new Element(),brand=new Element(),chapter=new Element(),heading=new Element();
  brand.attributes.href='/';chapter.attributes.href='#returns';
  const controls=[brand,closer,chapter];controls.forEach(el=>el.hidden=false);
  menu.querySelectorAll=selector=>selector==='a[href]'?[brand,chapter]:controls;
  const selectors={'#menu-toggle':opener,'#site-menu':menu,'#site-menu-close':closer};
  globalThis.document={querySelector:s=>selectors[s],documentElement:{classList:classes()},activeElement:null,getElementById:id=>id==='returns'?{querySelector:()=>heading}:null};
  const lifecycle=new EventTarget(),frames=new Map();let next=0;
  globalThis.window=lifecycle;globalThis.requestAnimationFrame=fn=>{frames.set(++next,fn);return next;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
  return{opener,menu,closer,brand,chapter,heading,lifecycle,frames,
    flush(){const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn());},
    key(key,shiftKey=false){const event=new Event('keydown',{cancelable:true});Object.assign(event,{key,shiftKey});menu.dispatchEvent(event);return event;},
    restore(){lifecycle.dispatchEvent(new Event('pagehide'));for(const key of keys){if(saved[key]===undefined)delete globalThis[key];else globalThis[key]=saved[key];}},
  };
}
test('one menu instance accepts homepage callback and returns focus when closed',()=>{
 const f=fixture();try{
  const values=[],events=[];f.lifecycle.addEventListener('smarttec:menu-change',e=>events.push(e.detail.open));
  const first=initMenu(),second=initMenu(value=>values.push(value));assert.equal(first,second);
  f.opener.click();f.flush();assert.equal(first.isOpen,true);assert.equal(f.menu.open,true);assert.equal(document.activeElement,f.closer);assert.equal(f.opener.attributes['aria-expanded'],'true');
  f.closer.click();assert.equal(first.isOpen,false);assert.equal(f.menu.hidden,true);assert.equal(document.activeElement,f.opener);assert.deepEqual(values,[true,false]);assert.deepEqual(events,[true,false]);
 }finally{f.restore();}
});
test('Escape and native cancel close the menu without stranding focus',()=>{
 const f=fixture();try{
  const handle=initMenu();handle.open();assert.equal(f.key('Escape').defaultPrevented,true);assert.equal(handle.isOpen,false);
  handle.open();const event=new Event('cancel',{cancelable:true});f.menu.dispatchEvent(event);assert.equal(event.defaultPrevented,true);assert.equal(handle.isOpen,false);assert.equal(document.activeElement,f.opener);
 }finally{f.restore();}
});
test('chapter links close before focusing the destination heading',()=>{
 const f=fixture();try{
  const handle=initMenu();handle.open();f.chapter.click();assert.equal(handle.isOpen,false);assert.equal(document.activeElement,f.heading);assert.equal(f.heading.tabIndex,-1);
 }finally{f.restore();}
});
test('navigation cancels queued opening work and permits a clean restore',()=>{
 const f=fixture();try{
  const handle=initMenu();handle.open();assert.equal(f.frames.size,1);f.lifecycle.dispatchEvent(new Event('pagehide'));f.flush();assert.equal(f.menu.hidden,true);assert.equal(f.menu.classList.contains('is-open'),false);
  const event=new Event('pageshow');event.persisted=true;f.lifecycle.dispatchEvent(event);handle.open();f.flush();assert.equal(handle.isOpen,true);
 }finally{f.restore();}
});
test('menu gestures stay inside the dialog while native scrolling is preserved',()=>{
 const f=fixture();try{
  const handle=initMenu();handle.open();
  for(const type of ['wheel','touchstart','touchmove','touchend']){let stopped=false;const event=new Event(type,{cancelable:true});event.stopPropagation=()=>stopped=true;f.menu.dispatchEvent(event);assert.equal(stopped,true);assert.equal(event.defaultPrevented,false);}
  f.chapter.focus();assert.equal(f.key('Tab').defaultPrevented,true);assert.equal(document.activeElement,f.brand);
  assert.equal(f.key('Tab',true).defaultPrevented,true);assert.equal(document.activeElement,f.chapter);
 }finally{f.restore();}
});
