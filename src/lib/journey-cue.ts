/** Displays the progress supplied by the active scroll engine, never a second scroll loop. */
export function initJourneyCue(labels:string[],onNext:(index:number)=>void){
  const root=document.querySelector<HTMLElement>('[data-journey-cue]');
  let ready=false,menu=false,ended=false,current=0,progress=0;
  const instruction=root?.querySelector<HTMLElement>('[data-journey-instruction]');
  const chapter=root?.querySelector<HTMLElement>('[data-journey-chapter]');
  const meter=root?.querySelector<HTMLElement>('[data-journey-progress]');
  const next=root?.querySelector<HTMLButtonElement>('[data-journey-next]');
  const coarse=window.matchMedia('(pointer: coarse)').matches;
  const text=(node:HTMLElement|null|undefined,value:string)=>{if(node&&node.textContent!==value)node.textContent=value;};
  const attr=(node:HTMLElement|null|undefined,key:string,value:string)=>{if(node&&node.getAttribute(key)!==value)node.setAttribute(key,value);};
  const render=()=>{
    if(!root)return;
    root.hidden=!ready||menu||ended||document.hidden||current>=labels.length-1;
    root.dataset.nudge=String(progress<.02);
    text(instruction,progress<.02?(coarse?'Swipe up to explore':'Scroll to explore'):'Keep scrolling to follow the signal');
    text(chapter,`${String(current+1).padStart(2,'0')} / ${String(labels.length).padStart(2,'0')} · ${labels[current]}`);
    const total=Math.max(0,Math.min(1,(current+progress)/(labels.length-1)));
    root.style.setProperty('--journey-progress',String(total));
    attr(meter,'aria-valuenow',String(Math.round(total*100)));attr(meter,'aria-valuetext',`Chapter ${current+1} of ${labels.length}`);
    attr(next,'aria-label',`Next chapter: ${labels[Math.min(labels.length-1,current+1)]}`);
  };
  next?.addEventListener('click',()=>{if(!ready||menu||ended||current>=labels.length-1)return;onNext(current+1);});
  window.addEventListener('smarttec:menu-change',(event:Event)=>{menu=Boolean((event as CustomEvent).detail?.open);render();});
  document.addEventListener('visibilitychange',render);
  window.addEventListener('pagehide',()=>{ended=true;render();});
  window.addEventListener('pageshow',()=>{ended=false;render();});
  return {
    update(index:number,p:number){current=index;progress=Math.max(0,Math.min(1,p));render();},
    enable(){ready=true;render();},
    disable(){ready=false;render();},
  };
}
