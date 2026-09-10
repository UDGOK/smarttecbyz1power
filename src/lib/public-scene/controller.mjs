// This small controller is the only 3D-related code on the initial page path.
// The renderer, Three.js and exactly one public scene load on demand.
export function mountPageScenes(){
  document.querySelectorAll('[data-page-scene]').forEach(root=>mountPageScene(root));
}
export function mountPageScene(root,load=()=>import('./renderer')){
  if(root.dataset.mounted)return;
  root.dataset.mounted='true';
  const $=selector=>root.querySelector(selector);
  const host=$('[data-scene-host]'),launch=$('[data-scene-launch]'),fallback=$('[data-scene-fallback]');
  const controls=$('[data-scene-controls]'),status=$('[data-scene-status]'),badge=$('[data-scene-badge]');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let renderer=null,token=0,loading=false,visible=false,menuOpen=false,closed=false,ended=false,abort=null,playing=false,interactive=false;
  const button=name=>$(`[data-scene-action="${name}"]`);
  function release(){token++;abort?.abort();abort=null;renderer?.dispose();renderer=null;host.replaceChildren();loading=false;playing=false;interactive=false;controls.hidden=true;const panel=$('.page-scene__tools');if(panel)panel.open=false;fallback.hidden=false;launch.hidden=false;launch.disabled=false;launch.textContent='Explore in 3D ↗';badge.textContent='3D EXPLORER';button('play').textContent='Play motion';button('play').setAttribute('aria-pressed','false');if(button('interact')){button('interact').textContent='Enable drag';button('interact').setAttribute('aria-pressed','false');}}
  function fail(){release();closed=true;launch.textContent='Retry 3D ↗';badge.textContent='READING VIEW';status.textContent='3D is unavailable in this browser. The full page remains available; you can retry the scene.';}
  async function start(){
    if(loading||renderer||ended)return;
    closed=false;loading=true;abort=new AbortController();const signal=abort.signal,current=++token;
    launch.disabled=true;launch.textContent='Opening 3D…';badge.textContent='LOADING';status.textContent='Opening the selected concept…';
    try{
      const module=await load();if(signal.aborted||current!==token||ended)return;
      const made=await module.createPublicScene(host,root.dataset.sceneKind,{signal,onError:fail});
      if(signal.aborted||current!==token||ended){made?.dispose();return;}
      if(!made)throw new Error('Scene unavailable');
      const returnFocus=document.activeElement===launch;
      renderer=made;renderer.setVisible(visible&&!menuOpen);loading=false;launch.hidden=true;launch.disabled=false;fallback.hidden=true;controls.hidden=false;badge.textContent='INTERACTIVE CONCEPT';
      if(returnFocus)$('.page-scene__tools summary')?.focus({preventScroll:true});
      status.textContent=root.dataset.sceneKind==='campus'?'Choose a viewpoint or enable drag. Turn drag off to continue scrolling over the scene.':'Move the slider to explore the scene. Motion is optional.';
    }catch{if(!signal.aborted&&current===token&&!ended)fail();}
  }
  launch.addEventListener('click',start);
  root.querySelectorAll('[data-scene-action]').forEach(control=>control.addEventListener('click',()=>{
    if(!renderer)return;
    switch(control.dataset.sceneAction){
      case 'close':closed=true;release();status.textContent='3D closed. Open it again whenever you like.';launch.focus();break;
      case 'reset':renderer.reset();if($('[data-scene-position]'))$('[data-scene-position]').value='28';break;
      case 'left':renderer.orbit(-65,0);break;
      case 'right':renderer.orbit(65,0);break;
      case 'in':renderer.zoom(1);break;
      case 'out':renderer.zoom(-1);break;
      case 'interact':interactive=!interactive;renderer.setInteractive(interactive);control.setAttribute('aria-pressed',String(interactive));control.textContent=interactive?'Finish dragging':'Enable drag';break;
      case 'play':playing=!playing;renderer.setPlaying(playing);control.setAttribute('aria-pressed',String(playing));control.textContent=playing?'Pause motion':'Play motion';break;
    }
  }));
  root.querySelectorAll('[data-scene-focus]').forEach(control=>control.addEventListener('click',()=>renderer?.focus(control.dataset.sceneFocus)));
  $('[data-scene-position]')?.addEventListener('input',event=>renderer?.setPosition(Number(event.target.value)/100));
  const panel=$('.page-scene__tools');
  panel?.addEventListener('toggle',()=>{
    if(!panel.open&&interactive){interactive=false;renderer?.setInteractive(false);const control=button('interact');if(control){control.textContent='Enable drag';control.setAttribute('aria-pressed','false');}}
  });
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
    visible=entries.some(entry=>entry.isIntersecting);renderer?.setVisible(visible&&!menuOpen);
    // Keep the cinematic art on screen. Real WebGL is an explicit choice on
    // every device; visibility alone must not load or replace the artwork.
  },{threshold:.05}):null;
  if(observer)observer.observe(root);else visible=true;
  const onMotion=()=>{button('play').hidden=reduced.matches;if(reduced.matches&&playing){playing=false;renderer?.setPlaying(false);button('play').textContent='Play motion';button('play').setAttribute('aria-pressed','false');}};
  onMotion();
  window.addEventListener('smarttec:menu-change',event=>{menuOpen=Boolean(event.detail?.open);renderer?.setVisible(visible&&!menuOpen);});
  reduced.addEventListener('change',onMotion);
  window.addEventListener('pagehide',()=>{ended=true;observer?.disconnect();release();});
  window.addEventListener('pageshow',()=>{if(!ended)return;ended=false;observer?.observe(root);status.textContent='Open the interactive concept. The page stays ready to read.';});
}
