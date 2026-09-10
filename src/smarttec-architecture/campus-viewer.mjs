import {chapters,imageDisclosure} from './chapters.mjs';

export function mountCampus(){
 const $=s=>document.querySelector(s),host=$('#sta-canvas');if(!host||host.dataset.mounted)return;
 host.dataset.mounted='true';
 const poster=$('#sta-poster'),stage=$('#sta-stage'),status=$('#sta-status');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let current='manufacturing',mode='image',generation=0,stopRenderer=null,visible=true,ended=false,failed=false;
 function cleanup(){generation++;stopRenderer?.();stopRenderer=null;host.replaceChildren();}
 function badge(text){$('#sta-mode').textContent=text;}
 function imageMode(preserveFailure=false){
  cleanup();mode='image';host.hidden=true;poster.style.visibility='visible';stage.dataset.mode='image';$('#sta-reset').hidden=true;
  $('#sta-launch').disabled=false;$('#sta-launch').setAttribute('aria-pressed','false');$('#sta-image').setAttribute('aria-pressed','true');
  $('#sta-image-disclosure').textContent=imageDisclosure(current);
  badge(preserveFailure?'3D UNAVAILABLE · IMAGE VIEW':current==='overview'?'MODEL PREVIEW':'CONCEPT IMAGE');
  status.textContent=preserveFailure?'3D could not load. Image view remains available. Retry 3D, or sign in again if your session has expired.':current==='overview'?chapters[current].modelNote:'AI architectural concept, not a site photo. The interactive model is a separate simplified spatial study.';
 }
 function select(key){
  if(!chapters[key])return;current=key;const c=chapters[key];
  document.querySelectorAll('[data-sta-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.staView===key)));
  for(const [id,text] of Object.entries({'sta-title':c.title,'sta-description':c.text,'sta-development-status':c.status,'sta-fact':c.fact}))$('#'+id).textContent=text;
  poster.src='/api/investor/'+c.image;poster.alt=c.alt;
  if(mode==='model')launch();else imageMode(failed);
 }
 async function launch(){
  cleanup();const token=generation;mode='model';failed=false;host.hidden=false;poster.style.visibility='visible';$('#sta-launch').disabled=true;
  badge('LOADING 3D MODEL');status.textContent='Loading the selected spatial study…';
  let renderer,model,controls,observer,pmrem,environment,frame,disposed=false;
  const controller=new AbortController();
  function freeModel(m){m?.traverse(o=>{o.geometry?.dispose();if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(a=>a.dispose());});}
  const dispose=()=>{if(disposed)return;disposed=true;controller.abort();cancelAnimationFrame(frame);observer?.disconnect();controls?.dispose();freeModel(model);environment?.dispose();pmrem?.dispose();renderer?.dispose();renderer?.forceContextLoss();};
  stopRenderer=dispose;
  try{
   const [THREE,{GLTFLoader},{OrbitControls},{RoomEnvironment}]=await Promise.all([import('three'),import('three/addons/loaders/GLTFLoader.js'),import('three/addons/controls/OrbitControls.js'),import('three/addons/environments/RoomEnvironment.js')]);
   if(disposed||ended||token!==generation)return;
   renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
   renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','Interactive concept model. Drag to orbit; scroll to zoom. Use Reset view for the starting camera.');host.replaceChildren(renderer.domElement);
   const scene=new THREE.Scene();scene.background=new THREE.Color('#142f26');const c=chapters[current];const camera=new THREE.PerspectiveCamera(43,1,.03,4500);camera.position.fromArray(c.camera);
   controls=new OrbitControls(camera,renderer.domElement);controls.target.fromArray(c.target);controls.minDistance=c.distance[0];controls.maxDistance=c.distance[1];controls.maxPolarAngle=Math.PI*.485;controls.enableDamping=!reduced.matches;controls.listenToKeyEvents(renderer.domElement);
   scene.add(new THREE.HemisphereLight(0xc7e4e7,0x163824,2.3));const sun=new THREE.DirectionalLight(0xffe4bd,3.4);const span=current==='overview'?800:current==='compute'?6:90;
   sun.position.set(c.target[0]-span/2,span,c.target[2]-span/2);sun.target.position.fromArray(c.target);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-span,right:span,top:span,bottom:-span,near:.1,far:span*4});sun.shadow.normalBias=current==='compute'?.006:.06;scene.add(sun,sun.target);
   pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();environment=pmrem.fromScene(room,.04);room.dispose();scene.environment=environment.texture;
   const response=await fetch('/api/investor/'+c.model,{credentials:'same-origin',signal:controller.signal});if(!response.ok)throw new Error(response.status===401?'Session expired':'Model unavailable');
   model=(await new GLTFLoader().parseAsync(await response.arrayBuffer(),'')).scene;
   if(disposed||ended||token!==generation){freeModel(model);return;}
   model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(model);
   const resize=()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};
   observer=new ResizeObserver(resize);observer.observe(host);resize();
   renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();if(!disposed){failed=true;imageMode(true);}},{once:true});
   poster.style.visibility='hidden';stage.dataset.mode='model';$('#sta-reset').hidden=false;$('#sta-image').setAttribute('aria-pressed','false');$('#sta-launch').setAttribute('aria-pressed','true');
   badge('INTERACTIVE 3D · CONCEPT');$('#sta-image-disclosure').textContent='SPATIAL STUDY · NOT AN AS-BUILT RECORD';status.textContent=c.modelNote+' Drag to orbit; scroll or pinch to zoom. Reset restores the starting view.';
   $('#sta-reset').onclick=()=>{camera.position.fromArray(c.camera);controls.target.fromArray(c.target);controls.update();};
   function draw(){if(disposed)return;frame=requestAnimationFrame(draw);if(!visible||document.hidden)return;controls.enableDamping=!reduced.matches;controls.update();renderer.render(scene,camera);}draw();
  }catch(error){if(disposed||token!==generation||ended)return;console.warn('[SmartTec concept viewer]',error instanceof Error?error.message:'3D unavailable');failed=true;imageMode(true);}
  finally{if(token===generation)$('#sta-launch').disabled=false;}
 }
 const visibility=new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting);});visibility.observe(stage);
 $('#sta-launch').onclick=launch;$('#sta-image').onclick=()=>{failed=false;imageMode();};
 document.querySelectorAll('[data-sta-view]').forEach(b=>b.onclick=()=>select(b.dataset.staView));
 poster.addEventListener('error',()=>{status.textContent='The protected image did not load. Sign in again if your session has expired.';badge('IMAGE UNAVAILABLE');});
 window.addEventListener('pagehide',()=>{ended=true;visibility.disconnect();cleanup();});
 // A back/forward-cache restore reuses this DOM and its listeners. Resume in
 // image mode so an interrupted load cannot leave stale controls or GPU work.
 window.addEventListener('pageshow',()=>{if(!ended)return;ended=false;visibility.observe(stage);imageMode(failed);});
 imageMode();
}
