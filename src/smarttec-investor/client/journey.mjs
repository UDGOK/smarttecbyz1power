import {journey} from '../data/journey.mjs';

export function mountJourney(){
  const menu=document.querySelector('#inv-journey-menu');
  const opener=document.querySelector('#inv-menu-open');
  const dock=document.querySelector('.inv-journey-dock');
  if(!menu||!opener||!dock||opener.dataset.mounted)return;
  opener.dataset.mounted='true';
  const sections=journey.map(chapter=>document.getElementById(chapter.id));
  if(sections.some(section=>!section))return;
  const number=index=>String(index+1).padStart(2,'0');
  const links=[...document.querySelectorAll('[data-inv-chapter]')];
  const previous=document.querySelector('#inv-journey-prev');
  const next=document.querySelector('#inv-journey-next');
  let active=-1, frame=0;

  // Native modal provides focus trapping, Escape and inert background content.
  // There is no body scroll lock to strand forms after closing or browser Back.
  if(typeof menu.showModal==='function'){
    opener.hidden=false;
    opener.addEventListener('click',()=>{
      menu.showModal();opener.setAttribute('aria-expanded','true');
      document.querySelector('#inv-menu-close').focus();
    });
    document.querySelector('#inv-menu-close').addEventListener('click',()=>menu.close());
    menu.addEventListener('close',()=>opener.setAttribute('aria-expanded','false'));
    menu.querySelectorAll('a[href]').forEach(link=>link.addEventListener('click',()=>menu.close()));
  }else{
    // Browsers without dialog support still get all chapter links.
    menu.setAttribute('open','');menu.classList.add('inv-menu-fallback');
    document.querySelector('#inv-menu-close').hidden=true;
  }

  const update=()=>{
    frame=0;
    // Reading position, rather than intersection area: the calculator can be
    // much taller than a viewport. Its chapter stays current while editing.
    let index=0;
    for(let i=0;i<sections.length;i++){
      if(sections[i].getBoundingClientRect().top<=Math.max(200,Math.min(innerHeight*.3,220)))index=i;
    }
    if(index===active)return;
    active=index;const current=journey[index];
    links.forEach(link=>{
      if(link.dataset.invChapter===current.id)link.setAttribute('aria-current','location');
      else link.removeAttribute('aria-current');
    });
    document.querySelector('#inv-ruler-label').textContent=`${number(index)} / ${current.label.toUpperCase()}`;
    document.querySelector('#inv-journey-count').textContent=`${number(index)} / ${String(journey.length).padStart(2,'0')}`;
    document.querySelector('#inv-journey-title').textContent=current.label;
    const back=journey[Math.max(0,index-1)],forward=journey[index+1]||journey[0];
    previous.href='#'+back.id;
    previous.setAttribute('aria-label',index===0?'Back to the beginning':`Previous chapter: ${back.label}`);
    next.href='#'+forward.id;
    next.setAttribute('aria-label',index===journey.length-1?'Back to the beginning':`Next chapter: ${forward.label}`);
    next.querySelector('.inv-dock-direction').textContent=index===journey.length-1?'Start':'Next';
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
  window.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',schedule,{passive:true});
  // Images, FAQ content, calculator rows and disclosure panels can change
  // section positions without a scroll event.
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;
  sections.forEach(section=>observer?.observe(section));
  window.addEventListener('pageshow',()=>{if(menu.open&&!menu.classList.contains('inv-menu-fallback'))menu.close();schedule();});
  window.addEventListener('pagehide',()=>{if(frame)cancelAnimationFrame(frame);frame=0;});
  document.querySelectorAll('.inv-chrome a[href^="#"], .inv-journey-menu a[href^="#"], .inv-journey-dock a[href^="#"]').forEach(link=>{
    link.addEventListener('click',()=>{
      const section=document.querySelector(link.getAttribute('href'));
      const heading=section?.querySelector('h1,h2');
      if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
    });
  });
  dock.hidden=false;update();
}
