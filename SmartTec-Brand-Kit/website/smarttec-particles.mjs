import {createEnergyRenderer} from './energy-renderer.mjs';
/** Mount inside a sized container. Call destroy() before removing it in an SPA. */
export async function mountSmartTec(container,{logoUrl=new URL('./smarttec-logo.png',import.meta.url).href,intensity='website',speed=1,formation=true,transparent=false}={}){
  if(!(container instanceof HTMLElement))throw new TypeError('A container element is required.');
  const canvas=document.createElement('canvas');canvas.className='smarttec-particles';canvas.setAttribute('role','img');canvas.setAttribute('aria-label','SmartTec by Z1Power — flowing data and energy');
  const fallback=document.createElement('img');fallback.src=logoUrl;fallback.alt='SmartTec by Z1Power';fallback.className='smarttec-particles-fallback';
  container.append(fallback,canvas);
  let disposed=false,renderer=null,raf=0,t=0,last=0,visible=true,inView=true;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');let playing=!reduced.matches,reveal=formation;
  const image=new Image();image.decoding='async';image.crossOrigin='anonymous';
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('SmartTec logo did not load. Keep assets same-origin or enable image CORS.'));image.src=logoUrl;});
  if(disposed)return;
  const surface=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  try{renderer=createEnergyRenderer(canvas,image,surface,{intensity,speed,transparent});fallback.hidden=true;}catch(e){canvas.remove();throw e;}
  function draw(){renderer.render(t,{formation:reveal&&!reduced.matches,staticFrame:reduced.matches});}
  function size(){const b=container.getBoundingClientRect();renderer.resize(Math.max(1,b.width),Math.max(1,b.height),Math.min(devicePixelRatio||1,2));draw();}
  function frame(now){raf=0;if(disposed)return;if(playing&&visible&&inView){t+=Math.min((now-last)/1000,.05)||0;draw();}last=now;if(playing&&visible&&inView)raf=requestAnimationFrame(frame);}
  function start(){if(!raf&&playing&&visible&&inView&&!disposed){last=performance.now();raf=requestAnimationFrame(frame);}}
  function stop(){cancelAnimationFrame(raf);raf=0;}
  const ro=new ResizeObserver(size);ro.observe(container);
  const io=new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;inView?start():stop();},{threshold:.05});io.observe(container);
  const visibility=()=>{visible=!document.hidden;visible?start():stop();};document.addEventListener('visibilitychange',visibility);
  const preference=()=>{playing=!reduced.matches;draw();playing?start():stop();};reduced.addEventListener('change',preference);
  size();start();
  return {play(){playing=true;start();},pause(){playing=false;stop();},replay(){t=0;reveal=true;playing=true;start();},setIntensity(value){renderer.config.intensity=value==='conference'?'conference':'website';draw();},setSpeed(value){renderer.config.speed=Math.min(2,Math.max(.2,Number(value)||1));},destroy(){disposed=true;stop();ro.disconnect();io.disconnect();document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',preference);renderer.destroy();canvas.remove();fallback.remove();}};
}
