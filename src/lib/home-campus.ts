const descriptions:Record<string,string>={
  '13-hero-arrival':'Campus arrival · Buildings A, B and C, with proposed cooling and manufacturing.',
  '01-campus-aerial':'Campus aerial · The proposed three-tract campus and future solar field.',
  '14-datahall-interior':'Inside compute · Proposed B300 racks and overhead liquid-cooling connections.',
  '16-manufacturing-interior':'Inside manufacturing · The proposed inverter assembly hall.',
};

/** The homepage shows lightweight renders; the detailed model stays on /site/campus. */
export function initHomeCampus(){
  const visual=document.querySelector<HTMLElement>('#home-campus-visual');
  const ui=document.querySelector<HTMLElement>('#campus-ui');
  const panel=document.querySelector<HTMLElement>('[data-stage-panel][data-stage="campus"]');
  const images=Array.from(visual?.querySelectorAll<HTMLImageElement>('.home-campus-image')||[]);
  const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>('[data-campus-view]'));
  const status=document.querySelector<HTMLElement>('#home-campus-status');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let active=false,selection='13-hero-arrival',shown='',token=0,front=0;

  function visibility(){
    if(!visual||!ui||!panel)return;
    const rect=panel.getBoundingClientRect(),visible=active&&rect.bottom>=80&&rect.top<=innerHeight&&!document.hidden;
    visual.hidden=!visible;ui.hidden=!visible;
    visual.classList.toggle('is-moving',visible&&!reduced.matches);
  }
  async function select(key:string){
    if(!descriptions[key]||images.length!==2)return;
    selection=key;const request=++token;
    buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.campusView===key)));
    if(shown===key){if(status)status.textContent=descriptions[key];return;}
    if(status)status.textContent='Loading this campus view…';
    const incoming=images[1-front];incoming.classList.remove('is-active');
    incoming.src=`/assets/campus/2026-09/renders/${key}-1600.webp`;
    let deadline:ReturnType<typeof setTimeout>|undefined;
    try{
      await Promise.race([incoming.decode(),new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error('Image loading timed out')),15000);})]);
      if(request!==token||!active)return;
      images[front].classList.remove('is-active');incoming.classList.add('is-active');front=1-front;shown=key;
      if(status)status.textContent=descriptions[key];
    }catch{
      if(request!==token||!active)return;
      if(status)status.textContent='This view could not load. Choose another view or open the full campus experience.';
    }finally{clearTimeout(deadline);}
  }
  buttons.forEach(button=>button.addEventListener('click',()=>{void select(button.dataset.campusView||'');}));
  // Match the header cutoff so a slow return from services wakes the gallery.
  const observer=new IntersectionObserver(visibility,{threshold:0,rootMargin:'-80px 0px 0px 0px'});if(panel)observer.observe(panel);
  document.addEventListener('visibilitychange',visibility);reduced.addEventListener('change',visibility);
  window.addEventListener('pageshow',visibility);
  return {
    enter(){active=true;visibility();void select(selection);},
    exit(){active=false;token++;visibility();},
  };
}
