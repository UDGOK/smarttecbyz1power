/** One accessible menu lifecycle across home, public pages and investor access. */
export interface MenuHandle {open():void;close():void;readonly isOpen:boolean;}
type Instance={handle:MenuHandle;callbacks:Set<(open:boolean)=>void>};
const instances=new WeakMap<HTMLElement,Instance>();

export function initMenu(onToggle?:(open:boolean)=>void):MenuHandle|null {
  const toggleNode=document.querySelector<HTMLButtonElement>('#menu-toggle');
  const menuNode=document.querySelector<HTMLDialogElement>('#site-menu');
  const closerNode=document.querySelector<HTMLButtonElement>('#site-menu-close');
  if(!toggleNode||!menuNode||!closerNode)return null;
  const toggle=toggleNode,menu=menuNode,closer=closerNode;
  const existing=instances.get(menu);
  if(existing){if(onToggle)existing.callbacks.add(onToggle);return existing.handle;}
  const callbacks=new Set<(open:boolean)=>void>();if(onToggle)callbacks.add(onToggle);
  let open=false,frame=0;
  const announce=(value:boolean)=>{
    toggle.setAttribute('aria-expanded',String(value));
    document.documentElement.classList.toggle('menu-open',value);
    window.dispatchEvent(new CustomEvent('smarttec:menu-change',{detail:{open:value}}));
    callbacks.forEach(callback=>callback(value));
  };
  function finish(returnFocus=true){
    if(frame)cancelAnimationFrame(frame);frame=0;
    const changed=open;open=false;menu.classList.remove('is-open');
    if(menu.open&&typeof menu.close==='function')menu.close();else menu.removeAttribute('open');
    menu.hidden=true;
    if(changed)announce(false);
    if(changed&&returnFocus)toggle.focus({preventScroll:true});
  }
  function show(){
    if(open)return;
    menu.hidden=false;
    try{if(typeof menu.showModal==='function')menu.showModal();else menu.setAttribute('open','');}
    catch{menu.hidden=true;return;}
    open=true;announce(true);closer.focus({preventScroll:true});
    frame=requestAnimationFrame(()=>{frame=0;if(open)menu.classList.add('is-open');});
  }
  const handle={open:show,close:()=>finish(),get isOpen(){return open;}};
  instances.set(menu,{handle,callbacks});
  toggle.addEventListener('click',()=>open?finish():show());
  closer.addEventListener('click',()=>finish());
  menu.addEventListener('cancel',event=>{event.preventDefault();finish();});
  menu.addEventListener('close',()=>{if(open)finish();});
  menu.addEventListener('click',event=>{if(event.target===menu)finish();});
  // Keep the homepage's window-level cinematic scroller out of menu gestures.
  // Native scrolling inside the dialog remains enabled.
  for(const type of ['wheel','touchstart','touchmove','touchend'])menu.addEventListener(type,event=>event.stopPropagation(),{passive:true});
  // Native dialog contains focus; also covers a non-modal legacy fallback.
  menu.addEventListener('keydown',event=>{
    event.stopPropagation();
    if(event.key==='Escape'){event.preventDefault();finish();return;}
    if(event.key!=='Tab'||!open)return;
    const controls=[...menu.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex="0"]')].filter(el=>!el.hidden&&!el.closest?.('[hidden],[inert]')&&(!el.getClientRects||el.getClientRects().length>0));
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  });
  menu.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(link=>link.addEventListener('click',()=>{
    const href=link.getAttribute('href')||'';
    finish(!href.startsWith('#'));
    if(href.startsWith('#')){
      const heading=document.getElementById(href.slice(1))?.querySelector<HTMLElement>('h1,h2');
      if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
    }
  }));
  window.addEventListener('pagehide',()=>finish(false));
  window.addEventListener('pageshow',event=>{if((event as PageTransitionEvent).persisted)finish(false);});
  return handle;
}
