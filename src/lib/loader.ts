/** A bounded visual introduction. Entry never depends on animation or asset loading. */
export const INTRO_DURATION_MS = 4200;
export const REDUCED_INTRO_MS = 80;
export const FADE_MS = 350;
export function initLoader(onComplete: () => void, onGesture?: () => void): void {
  const el=document.querySelector<HTMLElement>('#loader');
  const enter=el?.querySelector<HTMLAnchorElement>('#loader-skip');
  const release=()=>{
    delete document.body.dataset.entryPending;
    document.querySelectorAll<HTMLElement>('[data-entry-content]').forEach(node=>node.removeAttribute('inert'));
  };
  if(!el||!enter){release();onComplete();return;}
  if(el.dataset.ready)return;
  el.dataset.ready='true';
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let seen=false;
  try{seen=window.sessionStorage.getItem('smarttec:intro-seen')==='true';}catch{}
  let done=false,completed=false,suspended=false,autoTimer=0,fadeTimer=0;
  const clear=()=>{window.clearTimeout(autoTimer);window.clearTimeout(fadeTimer);};
  const complete=()=>{
    if(completed)return;completed=true;el.hidden=true;release();
    try{window.sessionStorage.setItem('smarttec:intro-seen','true');}catch{}
    try{onComplete();}finally{
      const main=document.querySelector<HTMLElement>('#main');
      if(main){main.tabIndex=-1;main.focus({preventScroll:true});}
    }
  };
  const finish=(gesture=false,instant=false)=>{
    if(done){
      if(instant&&!completed&&!suspended){clear();fadeTimer=window.setTimeout(complete,0);}
      return;
    }
    done=true;clear();
    if(gesture){try{onGesture?.();}catch{/* Optional audio never blocks entry. */}}
    el.classList.add('is-done');el.setAttribute('inert','');
    fadeTimer=window.setTimeout(complete,instant||motion.matches||seen?0:FADE_MS);
  };
  if(motion.matches||seen||document.hidden)el.dataset.quick='true';
  else el.dataset.playing='true';
  autoTimer=window.setTimeout(()=>finish(false,document.hidden),motion.matches||seen||document.hidden?REDUCED_INTRO_MS:INTRO_DURATION_MS);
  enter.addEventListener('click',(event:MouseEvent)=>{
    if(event.button!==0||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;
    event.preventDefault();finish(true);
  });
  motion.addEventListener('change',()=>{if(motion.matches)finish(false,true);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)finish(false,true);});
  window.addEventListener('pagehide',()=>{
    clear();if(completed)return;suspended=true;done=true;el.hidden=true;el.classList.add('is-done');release();
  });
  window.addEventListener('pageshow',(event:PageTransitionEvent)=>{if(event.persisted&&suspended){suspended=false;complete();}});
}
