import {PitchPlayback,wheelPixels} from './pitch-state.mjs';
import {mountPitchAudio} from './pitch-audio.mjs';

export function initPitch(doc=document,win=window){
  const stage=doc.querySelector('#pitch-stage');if(!stage||stage.dataset.mounted)return;stage.dataset.mounted='true';
  const slides=[...stage.querySelectorAll('[data-chapter]')],$=id=>doc.getElementById(id);
  const film=$('pitch-film'),poster=$('pitch-poster'),indexDialog=$('pitch-chapters'),reduced=win.matchMedia('(prefers-reduced-motion: reduce)');
  const savedData=Boolean(win.navigator.connection?.saveData),state=new PitchPlayback(slides.map(s=>Number(s.dataset.duration)),{playing:!reduced.matches&&!savedData});
  let filmVisual='',mediaRevision=0,motionConsent=false,disposed=false,interval=0,lastTime=win.performance.now(),gesture=null,wheel=0,wheelAt=0,lastNavigation=0;
  const soundtrack=mountPitchAudio(doc,win,{onPanelChange(open){state.lock('audio-settings',open);lastTime=win.performance.now();}});
  let frame=null;try{frame=win.frameElement;if(frame)doc.body.classList.add('is-embedded');}catch{}
  const listeners=[];
  function listen(target,event,fn,options){target.addEventListener(event,fn,options);listeners.push(()=>target.removeEventListener(event,fn,options));}
  const motionAllowed=()=>state.playing&&!state.locks.has('hidden')&&!state.locks.has('chapters')&&(!reduced.matches&&!savedData||motionConsent);
  function status(message=''){$('pitch-media-status').textContent=message;}
  function tellParent(type){if(frame)win.parent.postMessage({type},win.location.origin);}
  function updateFullscreen(){let full=false;try{full=Boolean(frame?frame.ownerDocument.fullscreenElement:doc.fullscreenElement);}catch{}$('pitch-fullscreen').setAttribute('aria-label',full?'Exit full screen':'Enter full screen');}
  async function fullscreen(){
    try{const target=frame?.closest('.pitch-frame-shell')||doc.documentElement,owner=target.ownerDocument;if(owner.fullscreenElement)await owner.exitFullscreen();else if(target.requestFullscreen)await target.requestFullscreen({navigationUI:'hide'});else status('Full screen is unavailable in this browser. The presentation still fills the window.');}
    catch{status('Full screen was unavailable. You can continue in this presentation view.');}updateFullscreen();
  }
  function updateMedia(){
    const visual=slides[state.index].dataset.visual;
    if(visual!==filmVisual){mediaRevision++;film.pause();film.classList.remove('is-ready');film.removeAttribute('src');film.load();filmVisual=visual;poster.src=`/api/investor/pitch-${visual}-poster`;film.dataset.visual=visual;}
    if(motionAllowed()){
      const revision=mediaRevision;
      if(!film.getAttribute('src')){film.src=`/api/investor/pitch-${visual}-video`;film.muted=true;film.load();}
      const play=film.play();play?.catch(error=>{if(disposed||revision!==mediaRevision||!motionAllowed()||error?.name==='AbortError')return;film.classList.remove('is-ready');status('Motion is paused by your browser. All chapter content remains available.');});
    }else film.pause();
    doc.body.dataset.paused=String(!motionAllowed());soundtrack.setBlocked('hidden',doc.hidden);soundtrack.setBlocked('chapters',indexDialog.open);
  }
  function reading(){
    const slide=slides[state.index],remaining=slide.scrollHeight-slide.clientHeight-slide.scrollTop;
    const overflow=slide.scrollHeight>slide.clientHeight+8,needsRead=overflow&&remaining>12;state.lock('reading',needsRead);$('pitch-reading-hint').hidden=!needsRead;updateControls();
  }
  function updateControls(){
    const n=state.index,title=slides[n].dataset.title;
    $('pitch-prev').disabled=n===0;$('pitch-next').disabled=n===slides.length-1;
    $('pitch-counter').textContent=`${String(n+1).padStart(2,'0')} / ${String(slides.length).padStart(2,'0')}`;$('pitch-now-title').textContent=title;
    const playLabel=state.playing?'Pause slides':'Play slides';$('pitch-play').setAttribute('aria-label',playLabel);$('pitch-play').setAttribute('aria-pressed',String(state.playing));$('pitch-play-label').textContent=playLabel;$('pitch-play-icon').textContent=state.playing?'Ⅱ':'▶';
    $('pitch-progress-fill').style.transform=`scaleX(${state.progress})`;doc.querySelector('.pitch-progress').setAttribute('aria-valuenow',String(Math.round(state.progress*100)));
    $('pitch-mode').textContent=state.locks.has('reading')?'Scroll to read · next chapter waits':state.playing?'Auto play · arrows or swipe to explore':reduced.matches&&!motionConsent?'Reduced motion · choose chapters at your pace':savedData&&!motionConsent?'Data saving · press Play to load film':'Paused · arrows or swipe to explore';
  }
  function show({focus=false,announce=false}={}){
    slides.forEach((slide,i)=>{const active=i===state.index;slide.hidden=!active;slide.classList.toggle('is-active',active);if(active)slide.scrollTop=0;});
    indexDialog.querySelectorAll('[data-jump]').forEach(button=>{if(Number(button.dataset.jump)===state.index)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
    if(focus)slides[state.index].querySelector('.pitch-title').focus({preventScroll:true});
    if(announce)$('pitch-announcement').textContent=`Chapter ${state.index+1} of ${slides.length}. ${slides[state.index].dataset.title}`;
    doc.body.dataset.chapter=slides[state.index].dataset.chapter;
    soundtrack.setChapter(slides[state.index].dataset.chapter);
    try{const url=new URL(win.location.href);url.hash=slides[state.index].dataset.chapter;win.history.replaceState(null,'',url);}catch{}
    updateMedia();reading();lastTime=win.performance.now();
  }
  function goTo(index,{manual=true}={}){if(disposed)return;const changed=state.goTo(index);if(!changed){updateControls();return;}lastNavigation=win.performance.now();show({focus:manual,announce:manual});}
  function togglePlay(){motionConsent=true;const previous=state.index;state.toggle();if(previous!==state.index)show({focus:true,announce:true});else{updateMedia();updateControls();}lastTime=win.performance.now();}
  function closeIndex(){if(indexDialog.open)indexDialog.close();}
  function cleanup(){if(disposed)return;disposed=true;win.clearInterval(interval);film.pause();film.removeAttribute('src');film.load();soundtrack.dispose();listeners.splice(0).forEach(off=>off());delete stage.dataset.mounted;}
  listen($('pitch-prev'),'click',()=>goTo(state.index-1));listen($('pitch-next'),'click',()=>goTo(state.index+1));listen($('pitch-play'),'click',togglePlay);listen($('pitch-fullscreen'),'click',fullscreen);
  listen(film,'playing',()=>{if(motionAllowed()&&film.dataset.visual===slides[state.index].dataset.visual){film.classList.add('is-ready');status();}else film.pause();});
  listen(film,'error',()=>{if(!film.getAttribute('src')||disposed)return;film.classList.remove('is-ready');status('Film is unavailable. The still-image presentation and PDF remain available.');});
  listen(poster,'error',()=>{if(!disposed)status('Concept image is unavailable. The presentation remains readable; reopen the investor room if your session expired.');});
  listen($('pitch-chapters-open'),'click',()=>{state.lock('chapters',true);indexDialog.showModal();updateMedia();});listen($('pitch-chapters-close'),'click',closeIndex);
  listen(indexDialog,'close',()=>{state.lock('chapters',false);updateMedia();reading();$('pitch-chapters-open').focus();lastTime=win.performance.now();});
  indexDialog.querySelectorAll('[data-jump]').forEach(button=>listen(button,'click',()=>{closeIndex();goTo(Number(button.dataset.jump));}));
  doc.querySelectorAll('[data-pitch-exit]').forEach(link=>listen(link,'click',event=>{if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;if(frame){event.preventDefault();tellParent('smarttec:pitch-close');}cleanup();}));
  slides.forEach(slide=>listen(slide,'scroll',()=>{if(slide===slides[state.index])reading();},{passive:true}));
  listen(doc,'keydown',event=>{
    if(event.altKey||event.ctrlKey||event.metaKey||event.defaultPrevented||indexDialog.open||soundtrack.panelOpen||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)||event.target.isContentEditable)return;
    if(event.key==='ArrowRight'||event.key==='PageDown'){event.preventDefault();goTo(state.index+1);}else if(event.key==='ArrowLeft'||event.key==='PageUp'){event.preventDefault();goTo(state.index-1);}else if(event.key==='Home'){event.preventDefault();goTo(0);}else if(event.key==='End'){event.preventDefault();goTo(slides.length-1);}else if(event.key===' '&&!/BUTTON|A/.test(event.target.tagName)){event.preventDefault();togglePlay();}else if(event.key.toLowerCase()==='m'){event.preventDefault();void soundtrack.toggle();}else if(event.key.toLowerCase()==='f'){event.preventDefault();fullscreen();}else if(event.key==='Escape'&&frame){let full=false;try{full=Boolean(frame.ownerDocument.fullscreenElement);}catch{}if(!full)tellParent('smarttec:pitch-close');}
  });
  listen(stage,'wheel',event=>{
    if(event.ctrlKey||event.metaKey||event.shiftKey||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
    const slide=slides[state.index];if(slide.scrollHeight>slide.clientHeight+8)return;
    const now=win.performance.now();if(now-lastNavigation<950)return;if(now-wheelAt>300)wheel=0;wheelAt=now;wheel+=wheelPixels(event,slide.clientHeight||win.innerHeight);
    if(Math.abs(wheel)>115){event.preventDefault();goTo(state.index+(wheel>0?1:-1));wheel=0;}
  },{passive:false});
  listen(stage,'touchstart',event=>{if(event.touches.length===1)gesture={x:event.touches[0].clientX,y:event.touches[0].clientY};else gesture=null;},{passive:true});
  listen(stage,'touchend',event=>{if(!gesture||!event.changedTouches.length)return;const dx=event.changedTouches[0].clientX-gesture.x,dy=event.changedTouches[0].clientY-gesture.y;gesture=null;if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.5)goTo(state.index+(dx<0?1:-1));},{passive:true});
  listen(win,'resize',reading);listen(doc,'fullscreenchange',()=>{updateFullscreen();reading();});
  listen(doc,'visibilitychange',()=>{state.lock('hidden',doc.hidden);lastTime=win.performance.now();updateMedia();updateControls();});
  listen(reduced,'change',()=>{motionConsent=false;if(reduced.matches)state.playing=false;updateMedia();updateControls();});
  listen(win,'message',event=>{if(!frame||event.origin!==win.location.origin||event.source!==win.parent)return;if(event.data?.type==='smarttec:pitch-stop')cleanup();if(event.data?.type==='smarttec:pitch-fullscreen'){updateFullscreen();reading();}});
  listen(win,'pagehide',cleanup);
  state.lock('hidden',doc.hidden);
  try{const requested=win.location.hash.slice(1),index=slides.findIndex(s=>s.dataset.chapter===requested);if(index>=0)state.goTo(index);}catch{}
  show();
  interval=win.setInterval(()=>{if(disposed)return;const now=win.performance.now(),elapsed=(now-lastTime)/1000;lastTime=now;const wasPlaying=state.playing;if(state.tick(elapsed))show();else if(wasPlaying&&!state.playing)updateMedia();soundtrack.tick();updateControls();},200);
  doc.fonts?.ready.then(()=>{if(!disposed)reading();});tellParent('smarttec:pitch-ready');
  return{state,goTo,togglePlay,cleanup};
}
if(typeof document!=='undefined')initPitch();
if(typeof window!=='undefined')window.addEventListener('pageshow',event=>{if(event.persisted)initPitch();});
