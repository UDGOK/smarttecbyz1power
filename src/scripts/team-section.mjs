export function mountTeamSection(root,doc=document,win=window){
  if(!root||root.dataset.teamMounted)return;
  root.dataset.teamMounted='true';
  const preference=win.matchMedia('(prefers-reduced-motion: reduce)'),button=root.querySelector('.team-motion');
  let visible=false,paused=false,observer;
  function sync(){
    root.classList.toggle('is-motion-active',visible&&!paused&&!doc.hidden&&!preference.matches);
    if(paused||preference.matches)root.querySelectorAll('.is-revealed').forEach(card=>card.classList.remove('is-revealed'));
    button.hidden=preference.matches;
    button.setAttribute('aria-pressed',String(paused));
    button.querySelector('[data-team-motion-label]').textContent=paused?'Resume motion':'Pause motion';
    button.firstElementChild.textContent=paused?'▶':'Ⅱ';
  }
  function toggle(){paused=!paused;sync();}
  function finish(event){if(event.animationName==='team-arrive')event.target.classList.remove('is-revealed');}
  try{
    observer=new win.IntersectionObserver(entries=>{for(const entry of entries){if(entry.target===root)visible=entry.isIntersecting;else if(entry.isIntersecting){if(!paused&&!preference.matches&&!doc.hidden)entry.target.classList.add('is-revealed');observer.unobserve(entry.target);}}sync();},{threshold:0,rootMargin:'0px 0px -35px 0px'});
    observer.observe(root);root.querySelectorAll('.team-card').forEach(card=>observer.observe(card));
  }catch{delete root.dataset.teamMounted;return;}
  button.addEventListener('click',toggle);root.addEventListener('animationend',finish);doc.addEventListener('visibilitychange',sync);preference.addEventListener('change',sync);sync();
  return()=>{observer.disconnect();button.removeEventListener('click',toggle);root.removeEventListener('animationend',finish);doc.removeEventListener('visibilitychange',sync);preference.removeEventListener('change',sync);root.classList.remove('is-motion-active');root.querySelectorAll('.is-revealed').forEach(card=>card.classList.remove('is-revealed'));button.hidden=true;delete root.dataset.teamMounted;};
}
if(typeof document!=='undefined'){
  let cleanup;
  const mount=()=>{cleanup=mountTeamSection(document.querySelector('[data-team-section]'));};
  mount();window.addEventListener('pagehide',()=>cleanup?.());window.addEventListener('pageshow',event=>{if(event.persisted)mount();});
}
