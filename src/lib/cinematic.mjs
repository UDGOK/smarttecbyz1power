/** Event-driven art direction. Never captures scrolling or starts a WebGL loop. */
export function mountCinematicArt(){document.querySelectorAll('[data-cinematic]').forEach(mountCinematic);}
export function mountCinematic(root){
  if(root.dataset.cinemaMounted)return;root.dataset.cinemaMounted='true';
  const motion=matchMedia('(prefers-reduced-motion: reduce)'),pointer=matchMedia('(pointer: fine)');
  let frame=0,ended=false,menuOpen=false;
  const syncPause=()=>{root.dataset.paused=String(ended||menuOpen||document.hidden);};
  const reset=()=>{if(frame)cancelAnimationFrame(frame);frame=0;root.style.setProperty('--pan-x','0px');root.style.setProperty('--pan-y','0px');};
  root.querySelectorAll('[data-cinema-select]').forEach(button=>button.addEventListener('click',()=>{
    const selected=button.dataset.cinemaSelect;
    root.querySelectorAll('[data-cinema-select]').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.cinemaSelect===selected)));
    root.querySelectorAll('[data-cinema-detail]').forEach(panel=>panel.hidden=panel.dataset.cinemaDetail!==selected);
  }));
  root.querySelector('[data-cinema-light]')?.addEventListener('click',event=>{const on=root.dataset.light!=='bright';root.dataset.light=on?'bright':'dusk';event.currentTarget.setAttribute('aria-pressed',String(on));});
  root.querySelector('[data-cinema-flow]')?.addEventListener('click',event=>{const on=root.dataset.flow!=='on';root.dataset.flow=on?'on':'off';event.currentTarget.setAttribute('aria-pressed',String(on));});
  // Listen on the opening so pointer movement over its readable copy also
  // shifts the image; only the image is transformed, never the header.
  const surface=root.closest('.doc__opening,.inv-hero,.inv-login')||root;
  surface.addEventListener('pointermove',event=>{
    if(ended||menuOpen||motion.matches||!pointer.matches||frame)return;
    frame=requestAnimationFrame(()=>{frame=0;if(ended||menuOpen||motion.matches)return;const box=surface.getBoundingClientRect();if(!box.width||!box.height)return;root.style.setProperty('--pan-x',`${Math.max(-1,Math.min(1,(event.clientX-box.left)/box.width*2-1))*8}px`);root.style.setProperty('--pan-y',`${Math.max(-1,Math.min(1,(event.clientY-box.top)/box.height*2-1))*5}px`);});
  },{passive:true});
  surface.addEventListener('pointerleave',reset);
  motion.addEventListener('change',reset);pointer.addEventListener('change',reset);
  document.addEventListener('visibilitychange',()=>{syncPause();if(document.hidden)reset();});
  window.addEventListener('smarttec:menu-change',event=>{menuOpen=Boolean(event.detail?.open);syncPause();if(menuOpen)reset();});
  window.addEventListener('pagehide',()=>{ended=true;syncPause();reset();});
  window.addEventListener('pageshow',()=>{ended=false;syncPause();reset();});
  syncPause();
}
