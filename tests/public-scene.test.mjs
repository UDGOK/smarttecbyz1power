// Interaction/lifecycle checks without a browser or GPU; not visual/WebGL QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mountPageScene} from '../src/lib/public-scene/controller.mjs';

class Element extends EventTarget {
  dataset={}; hidden=false; disabled=false; textContent=''; value='28'; attributes={};
  setAttribute(key,value){this.attributes[key]=value;}
  replaceChildren(){this.cleared=true;}
  focus(){this.focused=true;}
  click(){this.dispatchEvent(new Event('click'));}
}
const settle=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
function fixture({coarse=false,reduced=false,compact=false,saveData=false,load}={}){
  const keys=['document','window','matchMedia','IntersectionObserver','navigator'];
  const descriptors=keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
  const install=(key,value)=>Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  const root=new Element();root.dataset={sceneKind:'campus',sceneCompact:String(compact)};
  const nodes=Object.fromEntries(['host','launch','fallback','controls','status','badge','position','panel'].map(key=>[key,new Element()]));
  const actions=Object.fromEntries(['close','reset','left','right','in','out','interact','play'].map(key=>{
    const el=new Element();el.dataset.sceneAction=key;return[key,el];
  }));
  const focus=new Element();focus.dataset.sceneFocus='solar';
  root.querySelector=selector=>{
    if(selector==='.page-scene__tools')return nodes.panel;
    const action=selector.match(/^\[data-scene-action="([^"]+)"\]$/);if(action)return actions[action[1]];
    return nodes[selector.match(/^\[data-scene-([^\]]+)\]$/)?.[1]];
  };
  root.querySelectorAll=selector=>selector==='[data-scene-action]'?Object.values(actions):[focus];
  const motion=new Element();motion.matches=reduced;
  const lifecycle=new EventTarget();let observer,loads=0;
  install('window',lifecycle);install('document',{querySelectorAll:()=>[root]});
  install('matchMedia',query=>query.includes('reduced-motion')?motion:{matches:coarse});
  install('navigator',{connection:{saveData}});
  install('IntersectionObserver',class{constructor(callback){this.callback=callback;observer=this;}observe(){this.observed=true;}disconnect(){this.observed=false;}});
  const scenes=[];
  const defaultLoad=async()=>({createPublicScene:async(_host,_kind,{signal,onError})=>{
    const scene={signal,onError,disposed:0,visibility:[],calls:[],dispose(){this.disposed++;},setVisible(v){this.visibility.push(v);}};
    for(const method of ['reset','orbit','zoom','focus','setPosition','setInteractive','setPlaying'])scene[method]=(...args)=>scene.calls.push([method,...args]);
    scenes.push(scene);return scene;
  }});
  return {
    root,nodes,actions,motion,scenes,lifecycle,focus,
    mount(){mountPageScene(root,()=>{loads++;return(load||defaultLoad)();});},
    get loads(){return loads;},
    visible(value){observer.callback([{isIntersecting:value}]);},
    restore(){lifecycle.dispatchEvent(new Event('pagehide'));for(const[key,descriptor]of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}},
  };
}

test('desktop waits for explicit launch, pauses offscreen and releases on close',async()=>{
  const f=fixture();try{
    f.mount();assert.equal(f.loads,0);f.visible(true);await settle();assert.equal(f.loads,0);f.nodes.launch.click();await settle();
    assert.equal(f.loads,1);assert.equal(f.nodes.controls.hidden,false);
    f.visible(false);assert.equal(f.scenes[0].visibility.at(-1),false);
    f.actions.close.click();assert.equal(f.scenes[0].disposed,1);assert.equal(f.nodes.launch.focused,true);
    f.visible(true);await settle();assert.equal(f.loads,1,'closing must prevent automatic reload');
    f.nodes.launch.click();await settle();assert.equal(f.loads,2);
  }finally{f.restore();}
});

for(const mode of ['coarse','reduced','compact','saveData'])test(`${mode} requires explicit 3D opt-in`,async()=>{
  const f=fixture({[mode]:true});try{
    f.mount();f.visible(true);await settle();assert.equal(f.loads,0);
    f.nodes.launch.click();await settle();assert.equal(f.loads,1);
    if(mode==='reduced')assert.equal(f.actions.play.hidden,true);
  }finally{f.restore();}
});

test('controls forward intended actions and motion stops when preferences change',async()=>{
  const f=fixture();try{
    f.mount();f.visible(true);f.nodes.launch.click();await settle();const scene=f.scenes[0];
    for(const action of ['left','right','in','out','interact','play'])f.actions[action].click();
    f.focus.click();f.nodes.position.value='65';f.nodes.position.dispatchEvent(new Event('input'));
    assert.deepEqual(scene.calls,[['orbit',-65,0],['orbit',65,0],['zoom',1],['zoom',-1],['setInteractive',true],['setPlaying',true],['focus','solar'],['setPosition',.65]]);
    f.motion.matches=true;f.motion.dispatchEvent(new Event('change'));
    assert.deepEqual(scene.calls.at(-1),['setPlaying',false]);assert.equal(f.actions.play.hidden,true);
    f.actions.reset.click();assert.equal(f.nodes.position.value,'28');
  }finally{f.restore();}
});

test('failed imports show a retry and cannot cause an automatic retry loop',async()=>{
  const f=fixture({load:async()=>{throw new Error('offline');}});try{
    f.mount();f.visible(true);f.nodes.launch.click();await settle();assert.equal(f.nodes.launch.textContent,'Retry 3D ↗');
    assert.equal(f.nodes.fallback.hidden,false);assert.equal(f.nodes.controls.hidden,true);
    f.visible(false);f.visible(true);await settle();assert.equal(f.loads,1);
    f.nodes.launch.click();await settle();assert.equal(f.loads,2);
  }finally{f.restore();}
});

test('an import completing after navigation never creates a stale scene',async()=>{
  let resolve,created=0;const pending=new Promise(r=>resolve=r);
  const f=fixture({load:()=>pending});try{
    f.mount();f.visible(true);f.nodes.launch.click();f.lifecycle.dispatchEvent(new Event('pagehide'));
    resolve({createPublicScene:async()=>{created++;}});await settle();
    assert.equal(created,0);assert.equal(f.nodes.controls.hidden,true);
  }finally{f.restore();}
});

test('context failure releases graphics; back-forward restoration can reopen once',async()=>{
  const f=fixture();try{
    f.mount();f.visible(true);f.nodes.launch.click();await settle();f.scenes[0].onError();
    assert.equal(f.scenes[0].signal.aborted,true);assert.equal(f.nodes.controls.hidden,true);
    f.nodes.launch.click();await settle();f.lifecycle.dispatchEvent(new Event('pagehide'));
    assert.equal(f.scenes[1].disposed,1);f.lifecycle.dispatchEvent(new Event('pageshow'));
    f.visible(true);await settle();assert.equal(f.loads,2);f.nodes.launch.click();await settle();assert.equal(f.loads,3);
    mountPageScene(f.root,()=>{throw new Error('mounted twice');});
  }finally{f.restore();}
});

test('a scene created after navigation is immediately disposed',async()=>{
  let resolve,disposed=0;const pending=new Promise(r=>resolve=r);
  const f=fixture({load:async()=>({createPublicScene:()=>pending})});try{
    f.mount();f.visible(true);f.nodes.launch.click();await settle();
    f.lifecycle.dispatchEvent(new Event('pagehide'));
    resolve({dispose(){disposed++;}});await settle();
    assert.equal(disposed,1);assert.equal(f.nodes.controls.hidden,true);
  }finally{f.restore();}
});

test('collapsing scene tools releases drag and closing 3D resets the panel',async()=>{
 const f=fixture();try{
  f.mount();f.visible(true);f.nodes.launch.click();await settle();f.nodes.panel.open=true;f.actions.interact.click();
  f.nodes.panel.open=false;f.nodes.panel.dispatchEvent(new Event('toggle'));
  assert.deepEqual(f.scenes[0].calls.at(-1),['setInteractive',false]);assert.equal(f.actions.interact.attributes['aria-pressed'],'false');
  f.nodes.panel.open=true;f.actions.close.click();assert.equal(f.nodes.panel.open,false);
 }finally{f.restore();}
});
test('the shared menu pauses visible 3D and restores it after closing',async()=>{
 const f=fixture();try{
  f.mount();f.visible(true);f.nodes.launch.click();await settle();
  f.lifecycle.dispatchEvent(new CustomEvent('smarttec:menu-change',{detail:{open:true}}));assert.equal(f.scenes[0].visibility.at(-1),false);
  f.lifecycle.dispatchEvent(new CustomEvent('smarttec:menu-change',{detail:{open:false}}));assert.equal(f.scenes[0].visibility.at(-1),true);
 }finally{f.restore();}
});
test('3D activation keeps keyboard focus on available controls without stealing it',async()=>{
 const f=fixture();try{
  const original=f.root.querySelector,summary=new Element();f.root.querySelector=s=>s==='.page-scene__tools summary'?summary:original(s);
  f.mount();f.visible(true);document.activeElement=f.nodes.launch;f.nodes.launch.click();await settle();assert.equal(summary.focused,true);
  f.actions.close.click();summary.focused=false;document.activeElement=f.nodes.launch;f.nodes.launch.click();document.activeElement=f.nodes.position;await settle();assert.equal(summary.focused,false);
 }finally{f.restore();}
});
