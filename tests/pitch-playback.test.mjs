import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {PitchPlayback,wheelPixels} from '../src/smarttec-investor/client/pitch-state.mjs';
import {initPitch} from '../src/smarttec-investor/client/pitch.mjs';

test('wheel navigation treats line and page devices in the same pixel units',()=>{
 assert.equal(wheelPixels({deltaY:120,deltaMode:0},700),120);
 assert.equal(wheelPixels({deltaY:3,deltaMode:1},700),48);
 assert.equal(wheelPixels({deltaY:-1,deltaMode:2},700),-700);
 assert.equal(wheelPixels({deltaY:NaN,deltaMode:0},700),0);
});

test('playback waits for reading, visibility and chapter drawer independently',()=>{
 const s=new PitchPlayback([1,2]);s.tick(.5);assert.equal(s.progress,.5);
 s.lock('reading',true);s.lock('hidden',true);s.tick(20);assert.equal(s.progress,.5);
 s.lock('reading',false);s.tick(.5);assert.equal(s.progress,.5);
 s.lock('hidden',false);s.lock('chapters',true);s.tick(.5);assert.equal(s.index,0);
 s.lock('chapters',false);assert.equal(s.tick(.5),true);assert.equal(s.index,1);assert.equal(s.elapsed,0);
});
test('completion holds the closing chapter, and Replay resets the clock once',()=>{
 const s=new PitchPlayback([1,1]);for(let i=0;i<4;i++)s.tick(.5);assert.equal(s.index,1);assert.equal(s.progress,1);assert.equal(s.playing,false);
 s.tick(100);assert.equal(s.index,1);s.toggle();assert.equal(s.index,0);assert.equal(s.elapsed,0);assert.equal(s.playing,true);
});
test('manual navigation bounds and delayed frames never skip chapters',()=>{
 const s=new PitchPlayback([1,1,1]);s.tick(100);assert.equal(s.elapsed,.5);assert.equal(s.index,0);
 s.goTo(100);assert.equal(s.index,2);assert.equal(s.elapsed,0);s.goTo(-8);assert.equal(s.index,0);s.goTo(NaN);assert.equal(s.index,0);
 assert.throws(()=>new PitchPlayback([1,NaN]));assert.throws(()=>new PitchPlayback([]));
});

function fixture({reduced=false}={}){
 const markup=`<body class="pitch"><img id="pitch-poster"><video id="pitch-film"></video><main id="pitch-stage">${['opening','middle','closing'].map((id,i)=>`<section class="pitch-slide" data-chapter="${id}" data-title="${id}" data-visual="${['fiber','campus','compute'][i]}" data-duration="1" ${i?'hidden':''}><h2 class="pitch-title" tabindex="-1">${id}</h2></section>`).join('')}</main><button id="pitch-prev"></button><button id="pitch-next"></button><button id="pitch-play"></button><span id="pitch-play-icon"></span><span id="pitch-play-label"></span><button id="pitch-sound"><span data-sound-label>Sound off</span></button><button id="pitch-fullscreen"></button><button id="pitch-chapters-open"></button><span id="pitch-counter"></span><span id="pitch-now-title"></span><div class="pitch-progress"><i id="pitch-progress-fill"></i></div><span id="pitch-mode"></span><span id="pitch-reading-hint"></span><span id="pitch-announcement"></span><span id="pitch-media-status"></span><dialog id="pitch-chapters"><button id="pitch-chapters-close"></button>${[0,1,2].map(i=>`<button data-jump="${i}"></button>`).join('')}</dialog></body>`;
 const dom=new JSDOM(markup,{url:'https://www.smarttec.dev/investors/pitch'}),win=dom.window,doc=win.document;
 const pref=new win.EventTarget();pref.matches=reduced;win.matchMedia=()=>pref;
 let hidden=false,plays=0,pauses=0;Object.defineProperty(doc,'hidden',{get:()=>hidden});
 win.HTMLMediaElement.prototype.play=function(){plays++;return Promise.resolve();};win.HTMLMediaElement.prototype.pause=function(){pauses++;};win.HTMLMediaElement.prototype.load=function(){};
 const timers=new Map();win.setInterval=fn=>{timers.set(1,fn);return 1;};win.clearInterval=id=>timers.delete(id);
 const dialog=doc.getElementById('pitch-chapters');dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new win.Event('close'));};
 const app=initPitch(doc,win);return{dom,doc,win,pref,app,timers,get plays(){return plays;},get pauses(){return pauses;},hide(value){hidden=value;doc.dispatchEvent(new win.Event('visibilitychange'));},cleanup(){app.cleanup();dom.window.close();}};
}
test('Replay updates visible slide, counter, media and focus together',()=>{
 const f=fixture();try{f.app.goTo(2);f.app.state.elapsed=1;f.app.state.playing=false;f.app.togglePlay();assert.equal(f.app.state.index,0);assert.equal(f.doc.querySelector('[data-chapter=opening]').hidden,false);assert.equal(f.doc.querySelector('[data-chapter=closing]').hidden,true);assert.equal(f.doc.getElementById('pitch-counter').textContent,'01 / 03');assert.equal(f.doc.getElementById('pitch-film').dataset.visual,'fiber');assert.equal(f.doc.activeElement.textContent,'opening');}finally{f.cleanup();}
});
test('reduced motion starts with a poster and never requests video until explicit Play',()=>{
 const f=fixture({reduced:true});try{assert.equal(f.app.state.playing,false);assert.equal(f.plays,0);assert.equal(f.doc.getElementById('pitch-film').getAttribute('src'),null);f.app.goTo(1);assert.equal(f.plays,0);f.app.togglePlay();assert.equal(f.plays,1);assert.match(f.doc.getElementById('pitch-film').src,/pitch-campus-video/);}finally{f.cleanup();}
});
test('hidden pages and chapter drawer suspend motion; cleanup releases timers and media',()=>{
 const f=fixture();try{f.hide(true);assert.equal(f.app.state.locks.has('hidden'),true);assert.equal(f.doc.body.dataset.paused,'true');f.doc.getElementById('pitch-chapters-open').click();f.hide(false);assert.equal(f.app.state.locks.has('chapters'),true);assert.equal(f.doc.body.dataset.paused,'true');f.doc.getElementById('pitch-chapters-close').click();assert.equal(f.doc.body.dataset.paused,'false');f.app.cleanup();assert.equal(f.timers.size,0);assert.equal(f.doc.getElementById('pitch-film').getAttribute('src'),null);assert.equal(f.doc.getElementById('pitch-stage').dataset.mounted,undefined);}finally{f.cleanup();}
});
test('only the active chapter remains accessible and each manual move resets its timer',()=>{
 const f=fixture();try{f.app.state.tick(.5);f.doc.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(f.app.state.index,1);assert.equal(f.app.state.elapsed,0);assert.equal(f.doc.querySelectorAll('.pitch-slide:not([hidden])').length,1);assert.match(f.doc.getElementById('pitch-announcement').textContent,/Chapter 2 of 3/);f.pref.matches=true;f.pref.dispatchEvent(new f.win.Event('change'));assert.equal(f.app.state.playing,false);}finally{f.cleanup();}
});
