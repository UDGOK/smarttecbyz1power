import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {initPitchLauncher} from '../src/smarttec-investor/client/pitch-launch.mjs';

function fixture(){
 const dom=new JSDOM('<a href="/investors/pitch" data-pitch-launch>Open pitch</a><dialog id="investor-pitch-dialog"><div class="pitch-frame-shell"><div id="investor-pitch-loading"></div><iframe></iframe><button id="investor-pitch-close">Close</button></div></dialog>',{url:'https://www.smarttec.dev/investors'}),win=dom.window,doc=win.document;
 const dialog=doc.querySelector('dialog'),frame=doc.querySelector('iframe'),shell=doc.querySelector('.pitch-frame-shell'),link=doc.querySelector('a');let fullscreen=null,exits=0,resolveFullscreen;
 Object.defineProperty(doc,'fullscreenElement',{get:()=>fullscreen});doc.exitFullscreen=async()=>{fullscreen=null;exits++;};shell.requestFullscreen=()=>new Promise(resolve=>{resolveFullscreen=()=>{fullscreen=shell;resolve();};});
 dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new win.Event('close'));};
 const timers=new Map();win.setTimeout=fn=>{timers.set(1,fn);return 1;};win.clearTimeout=id=>timers.delete(id);
 const changes=[];win.addEventListener('smarttec:menu-change',event=>changes.push(event.detail.open));const app=initPitchLauncher(doc,win);
 return{dom,doc,win,dialog,frame,shell,link,timers,changes,app,get exits(){return exits;},resolveFullscreen(){resolveFullscreen();},message(type,{origin=win.location.origin,source=frame.contentWindow}={}){win.dispatchEvent(new win.MessageEvent('message',{origin,source,data:{type}}));},cleanup(){app.close();dom.window.close();}};
}
test('the investor link loads the private frame only on activation, then closes and restores focus',()=>{
 const f=fixture();try{assert.equal(f.frame.getAttribute('src'),null);f.link.click();assert.equal(f.dialog.open,true);assert.equal(f.frame.getAttribute('src'),'/investors/pitch');assert.equal(f.doc.activeElement.id,'investor-pitch-close');f.message('smarttec:pitch-ready');assert.equal(f.doc.getElementById('investor-pitch-loading').hidden,true);f.message('smarttec:pitch-close');assert.equal(f.dialog.open,false);assert.equal(f.frame.getAttribute('src'),null);assert.equal(f.doc.activeElement,f.link);assert.equal(f.timers.size,0);assert.deepEqual(f.changes,[true,false]);}finally{f.cleanup();}
});
test('frame messages require the exact same origin and the currently open frame',()=>{
 const f=fixture();try{f.link.click();f.message('smarttec:pitch-close',{origin:'https://evil.example'});assert.equal(f.dialog.open,true);f.message('smarttec:pitch-close',{source:f.win});assert.equal(f.dialog.open,true);f.message('smarttec:pitch-ready',{source:f.win});assert.equal(f.doc.getElementById('investor-pitch-loading').hidden,false);f.message('smarttec:pitch-close');assert.equal(f.dialog.open,false);}finally{f.cleanup();}
});
test('a fullscreen permission result arriving after Close cannot reopen a blank fullscreen view',async()=>{
 const f=fixture();try{f.link.click();f.app.close();f.resolveFullscreen();await Promise.resolve();await Promise.resolve();assert.equal(f.doc.fullscreenElement,null);assert.equal(f.exits,1);assert.equal(f.frame.getAttribute('src'),null);}finally{f.cleanup();}
});

for(const reopen of [false,true])test(`fullscreen exit restores focus after browser focus changes${reopen?' without stealing it from a reopened pitch':''}`,async()=>{
 const f=fixture();try{
  f.link.click();f.resolveFullscreen();await Promise.resolve();
  const exit=f.doc.exitFullscreen;let finish;
  f.doc.exitFullscreen=()=>new Promise(resolve=>{finish=async()=>{await exit();f.frame.focus();resolve();};});
  f.app.close();assert.equal(f.frame.getAttribute('src'),null,'Media unloads without waiting for fullscreen exit');
  if(reopen){f.link.click();f.message('smarttec:pitch-ready');}
  await finish();await Promise.resolve();
  assert.equal(f.doc.activeElement,reopen?f.frame:f.link);
 }finally{f.cleanup();}
});
