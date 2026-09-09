import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
export function mountCampus(){
 const host=document.querySelector('#sta-canvas');if(!host)return;
 const status=document.querySelector('#sta-status'),poster=document.querySelector('#sta-poster');
 const views={manufacturing:{camera:[310,220,-115],target:[65,0,145],text:'Two proposed 200 × 150 ft factories. Appearance, access lanes and landscape are conceptual.'},compute:{camera:[270,100,275],target:[168,4,370],text:'Owner-marked data-center structures 1, 2 and 3; illustrative cooling enclosures. A/B/C correspondence remains unconfirmed.'},energy:{camera:[470,330,260],target:[110,0,590],text:'Proposed solar zone and illustrative BESS enclosures. The model does not establish installed capacity.'},overview:{camera:[700,770,-320],target:[100,0,360],text:'Full conceptual campus. US 70 is the north frontage. No verified satellite registration is implied.'}};
 let renderer,scene,camera,controls,model,observer,frame,pmrem,environment,loading=false,ready=false,tween=null;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 function select(name){const v=views[name];if(!v)return;document.querySelectorAll('[data-sta-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.staView===name)));status.textContent=v.text;if(!ready){poster.src=name==='manufacturing'?'/api/investor/architecture-manufacturing':'/api/investor/architecture-overview';return;}if(reduced){camera.position.fromArray(v.camera);controls.target.fromArray(v.target);controls.update();}else tween={start:performance.now(),a:camera.position.clone(),b:new THREE.Vector3(...v.camera),c:controls.target.clone(),d:new THREE.Vector3(...v.target)};}
 function dispose(){cancelAnimationFrame(frame);observer?.disconnect();controls?.dispose();if(model)model.traverse(o=>{o.geometry?.dispose();if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());});environment?.dispose();pmrem?.dispose();renderer?.dispose();host.replaceChildren();ready=false;}
 async function launch(){if(loading||ready)return;loading=true;status.textContent='Loading architectural model…';try{
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
 host.replaceChildren(renderer.domElement);scene=new THREE.Scene();scene.background=new THREE.Color('#dce8e3');camera=new THREE.PerspectiveCamera(48,1,.5,4000);camera.position.fromArray(views.manufacturing.camera);
 controls=new OrbitControls(camera,renderer.domElement);controls.target.fromArray(views.manufacturing.target);controls.enableDamping=!reduced;controls.maxPolarAngle=Math.PI*.48;controls.minDistance=20;controls.maxDistance=1800;
 scene.add(new THREE.HemisphereLight(0xd9e9ff,0x6d7456,2));const sun=new THREE.DirectionalLight(0xfff0d2,3);sun.position.set(-200,400,-200);sun.target.position.set(100,0,350);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-600,right:600,top:600,bottom:-600,near:1,far:1800});sun.shadow.bias=-.0002;scene.add(sun,sun.target);
 pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();environment=pmrem.fromScene(room,.04);room.dispose();scene.environment=environment.texture;
 const response=await fetch('/api/investor/architecture-model',{credentials:'same-origin'});if(!response.ok)throw new Error(response.status===401?'Sign in again to load the model.':`Model request failed (${response.status}).`);
 model=(await new GLTFLoader().parseAsync(await response.arrayBuffer(),'')).scene;model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(model);
 observer=new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();});observer.observe(host);
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();dispose();poster.style.visibility='visible';status.textContent='3D graphics stopped. Rendered preview is available; choose Launch / retry 3D.';});
 ready=true;poster.style.visibility='hidden';select('manufacturing');
 function animate(now){frame=requestAnimationFrame(animate);if(tween){const t=Math.min(1,(now-tween.start)/1000),q=t*t*(3-2*t);camera.position.lerpVectors(tween.a,tween.b,q);controls.target.lerpVectors(tween.c,tween.d,q);if(t===1)tween=null;}controls.update();renderer.render(scene,camera);}frame=requestAnimationFrame(animate);
 }catch(error){console.error('[SmartTec architectural viewer]',error instanceof Error?error.message:'Initialization failed');dispose();poster.style.visibility='visible';status.textContent='Interactive 3D could not start. The rendered model preview remains available. Your designer can check graphics support and the protected model endpoint.';}finally{loading=false;}}
 document.querySelector('#sta-launch').onclick=launch;document.querySelectorAll('[data-sta-view]').forEach(b=>b.onclick=()=>select(b.dataset.staView));
 const visible=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){visible.disconnect();launch();}},{rootMargin:'100px'});visible.observe(host);window.addEventListener('pagehide',()=>{visible.disconnect();dispose();},{once:true});
}
