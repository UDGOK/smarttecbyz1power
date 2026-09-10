import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {loadTS} from './helpers/load-ts.mjs';

const labels=['Land','Power','Machine','Signal','Campus'];
function fixture(t,{coarse=false}={}){
  const dom=new JSDOM(`<aside data-journey-cue hidden>
    <span data-journey-instruction></span><span data-journey-chapter></span>
    <button data-journey-next>Next chapter</button>
    <div data-journey-progress role="progressbar" aria-valuemin="0" aria-valuemax="100"></div>
  </aside>`,{url:'https://www.smarttec.dev/',pretendToBeVisual:true});
  t.after(()=>dom.window.close());
  const {window}=dom,document=window.document,$=selector=>document.querySelector(selector);
  let hidden=false;
  Object.defineProperty(document,'hidden',{get:()=>hidden,configurable:true});
  window.matchMedia=()=>({matches:coarse});
  const calls=[];
  const cue=loadTS('src/lib/journey-cue.ts',{window,document}).initJourneyCue(labels,index=>calls.push(index));
  return {window,document,$,cue,calls,root:$('[data-journey-cue]'),
    menu(open){window.dispatchEvent(new window.CustomEvent('smarttec:menu-change',{detail:{open}}));},
    visibility(value){hidden=value;document.dispatchEvent(new window.Event('visibilitychange'));},
  };
}

test('journey waits for an active engine and reports its supplied chapter and progress',t=>{
  const {cue,root,$,calls}=fixture(t);
  $('[data-journey-next]').click();assert.deepEqual(calls,[]);assert.equal(root.hidden,true);
  cue.enable();assert.equal(root.hidden,false);assert.equal($('[data-journey-instruction]').textContent,'Scroll to explore');
  cue.update(1,.5);
  assert.equal($('[data-journey-chapter]').textContent,'02 / 05 · Power');
  assert.equal($('[data-journey-progress]').getAttribute('aria-valuenow'),'38');
  assert.equal($('[data-journey-progress]').getAttribute('aria-valuetext'),'Chapter 2 of 5');
  assert.equal(root.style.getPropertyValue('--journey-progress'),'0.375');
  assert.equal(root.dataset.nudge,'false');
  assert.equal($('[data-journey-instruction]').textContent,'Keep scrolling to follow the signal');
  assert.equal($('[data-journey-next]').getAttribute('aria-label'),'Next chapter: Machine');
  $('[data-journey-next]').click();assert.deepEqual(calls,[2]);
});

test('touch visitors receive a swipe instruction and bounded progress',t=>{
  const {cue,root,$}=fixture(t,{coarse:true});cue.enable();
  assert.equal($('[data-journey-instruction]').textContent,'Swipe up to explore');
  cue.update(0,-.4);assert.equal(root.dataset.nudge,'true');
  assert.equal($('[data-journey-progress]').getAttribute('aria-valuenow'),'0');
  cue.update(3,2);assert.equal($('[data-journey-progress]').getAttribute('aria-valuenow'),'100');
  assert.equal(root.style.getPropertyValue('--journey-progress'),'1');
});

test('opening the menu suspends the cue and its action while preserving chapter position',t=>{
  const {cue,root,$,menu,calls}=fixture(t);cue.enable();cue.update(2,.2);
  menu(true);assert.equal(root.hidden,true);$('[data-journey-next]').click();assert.deepEqual(calls,[]);
  menu(false);assert.equal(root.hidden,false);assert.equal($('[data-journey-chapter]').textContent,'03 / 05 · Machine');
  $('[data-journey-next]').click();assert.deepEqual(calls,[3]);
});

test('campus hides the story cue and returning to a story chapter restores it',t=>{
  const {cue,root,$,calls}=fixture(t);cue.enable();cue.update(4,0);
  assert.equal(root.hidden,true);$('[data-journey-next]').click();assert.deepEqual(calls,[]);
  cue.update(3,.5);assert.equal(root.hidden,false);$('[data-journey-next]').click();assert.deepEqual(calls,[4]);
});

test('tab and page lifecycle suspend the cue without losing menu or disabled state',t=>{
  const {window,cue,root,visibility,menu}=fixture(t);cue.enable();
  visibility(true);assert.equal(root.hidden,true);visibility(false);assert.equal(root.hidden,false);
  window.dispatchEvent(new window.Event('pagehide'));assert.equal(root.hidden,true);
  menu(true);window.dispatchEvent(new window.Event('pageshow'));assert.equal(root.hidden,true);
  menu(false);assert.equal(root.hidden,false);
  cue.disable();assert.equal(root.hidden,true);
  window.dispatchEvent(new window.Event('pageshow'));assert.equal(root.hidden,true);
});

test('a failed engine disables next-chapter actions as well as the visual cue',t=>{
  const {cue,root,$,calls}=fixture(t);cue.enable();cue.update(1,.3);cue.disable();
  assert.equal(root.hidden,true);$('[data-journey-next]').click();assert.deepEqual(calls,[]);
  cue.update(2,.4);assert.equal(root.hidden,true);
});
