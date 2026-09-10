import type {SceneContext,StageScene} from '../scene/types';
import type {CampusScene} from '../scene/stage-campus';
import type {PublicSceneKind} from '../../data/page-experiences';

const settings={pixelRatio:1,terrainSegments:120,particleCount:320,shadows:false,fog:true};
const sceneFactories={
  campus:async()=>new (await import('../scene/stage-campus')).CampusScene(),
  power:async()=>new (await import('../scene/stage-power')).PowerStage(),
  machine:async()=>new (await import('../scene/stage-machine')).MachineScene(),
};

export async function createPublicScene(host:HTMLElement,kind:PublicSceneKind,{signal,onError}:{signal:AbortSignal;onError:()=>void}){
  const THREE=await import('three');
  if(signal.aborted)return null;
  const stage:StageScene=await sceneFactories[kind]();
  if(signal.aborted){stage.dispose();return null;}
  const canvas=document.createElement('canvas');
  canvas.tabIndex=0;
  canvas.setAttribute('aria-label',kind==='campus'?'Campus concept. Use the labeled viewpoint controls, or enable drag.':'Interactive concept. Use the labeled scene position slider.');
  let renderer:InstanceType<typeof THREE.WebGLRenderer>|null=null;
  let observer:ResizeObserver|null=null,frame=0,disposed=false,visible=true,playing=false,settleUntil=0,last=0,time=0,position=.28,drag=false;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const coarse=matchMedia('(pointer: coarse)').matches;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.1,1000);
  const ctx:SceneContext={scene,camera,renderer:null as never,width:1,height:1,reducedMotion:true};
  const campus=kind==='campus'?stage as CampusScene:null;
  const cancel=()=>{cancelAnimationFrame(frame);frame=0;last=0;};
  function dispose(){
    if(disposed)return;disposed=true;cancel();observer?.disconnect();
    document.removeEventListener('visibilitychange',visibilityChange);signal.removeEventListener('abort',dispose);reduced.removeEventListener('change',motionChange);
    stage.dispose();renderer?.dispose();renderer?.forceContextLoss();canvas.remove();
  }
  function tick(now:number){
    frame=0;if(disposed||!visible||document.hidden)return;
    if(last&&now-last<1000/30){frame=requestAnimationFrame(tick);return;}
    const dt=last?Math.min((now-last)/1000,.05):1/30;last=now;
    const moving=playing&&!reduced.matches;
    if(moving)time+=dt;
    ctx.reducedMotion=!moving;
    try{
      stage.update(time,dt,position,ctx);
      renderer!.render(scene,camera);
    }catch{
      dispose();onError();return;
    }
    if(moving||now<settleUntil)frame=requestAnimationFrame(tick);
    else last=0;
  }
  function wake(){if(disposed||!visible||document.hidden)return;settleUntil=performance.now()+(reduced.matches?0:400);if(!frame)frame=requestAnimationFrame(tick);}
  function resize(){
    if(!renderer||disposed)return;
    const rect=host.getBoundingClientRect();if(!rect.width||!rect.height)return;
    ctx.width=rect.width;ctx.height=rect.height;
    // A bounded canvas rather than the homepage's full-screen postprocessing.
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,coarse?1:1.25,Math.sqrt(1_000_000/(rect.width*rect.height))));
    renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();stage.frame(ctx);wake();
  }
  function visibilityChange(){if(document.hidden)cancel();else wake();}
  function motionChange(){if(reduced.matches)playing=false;wake();}
  try{
    renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'low-power'});ctx.renderer=renderer;
    renderer.setClearColor(kind==='power'?'#5f491d':'#123027',1);
    host.replaceChildren(canvas);stage.build(ctx,settings);stage.setWorldMix(0);campus?.setInteractive(false);
    canvas.style.touchAction='pan-y';
    // Built-in campus handlers consume gestures only after explicit opt-in.
    canvas.addEventListener('pointermove',event=>{if(drag&&(event.buttons||event.pointerType==='touch'))wake();});
    canvas.addEventListener('wheel',()=>{if(drag)wake();},{passive:true});
    canvas.addEventListener('pointerdown',()=>{if(drag)wake();});
    canvas.addEventListener('keydown',event=>{
      if(!campus)return;
      const keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'];
      if(!keys.includes(event.key))return;
      event.preventDefault();
      if(event.key==='ArrowLeft')campus.orbit(-65,0);
      else if(event.key==='ArrowRight')campus.orbit(65,0);
      else if(event.key==='ArrowUp')campus.orbit(0,35);
      else if(event.key==='ArrowDown')campus.orbit(0,-35);
      else campus.zoom(event.key==='-'?-1:1);
      wake();
    });
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();if(!disposed){dispose();onError();}},{once:true});
    observer=new ResizeObserver(resize);observer.observe(host);resize();
    document.addEventListener('visibilitychange',visibilityChange);reduced.addEventListener('change',motionChange);signal.addEventListener('abort',dispose,{once:true});
    return {
      setVisible(value:boolean){visible=value;if(visible)wake();else cancel();},
      setPosition(value:number){position=Math.max(0,Math.min(1,value));wake();},
      orbit(x:number,y:number){campus?.orbit(x,y);wake();},
      zoom(delta:number){campus?.zoom(delta);wake();},
      focus(id:string){campus?.focusHotspot(id);wake();},
      reset(){position=.28;campus?.resetView();wake();},
      setInteractive(value:boolean){drag=value;campus?.setInteractive(value);canvas.style.touchAction=value?'none':'pan-y';},
      setPlaying(value:boolean){playing=value&&!reduced.matches;wake();},
      dispose,
    };
  }catch(error){dispose();throw error;}
}
