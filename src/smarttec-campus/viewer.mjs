import manifest from './scene.json';
import {abortable,fetchBytes,waitUntilReady} from './resources.mjs';
const root=document.querySelector('.campus-experience');
const $=s=>root.querySelector(s);
const ASSET_BASE='/assets/campus/2026-09';
const entries=[
 ['01-campus-aerial','Campus overview','SITE / THREE TRACTS','A connected campus, from frontage to solar.','The long parcel retains the north-frontage US 70 orientation and three-tract arrangement of the earlier survey-based plan. Address registration and ground elevations are unverified.'],
 ['02-inverter-arrival','Inverter manufacturing','MANUFACTURING / TRACT 1','A hall built around your drawings.','Nominal 200 × 150 ft footprint, 32 ft eaves, 2:12 roof pitch and eight structural bays. Door locations follow the preliminary elevations. Finishes, access apron and production equipment are proposed.'],
 ['03-compute-cooling','A / B / C + cooling','OPERATIONS / TRACT 2','Compute, storage and cooling.','A and C accommodate B300 equipment. B contains BESS and controls, with two indicative Daikin Applied chiller enclosures to its rear. Final equipment selection, fit-out and utility routing need design confirmation.'],
 ['04-operations-cutaway','Inside A, B and C','CUTAWAY / PROPOSED FIT-OUT','See the systems behind the shell.','Four B300 nodes are illustrated in A and four in C. BESS, switchgear and a controls workstation sit inside B. This distribution is a spatial proposal; equipment counts do not establish power, cooling capacity or redundancy.'],
 ['05-manufacturing-cutaway','Inside manufacturing','CUTAWAY / EIGHT-BAY HALL','From delivery to assembly.','The preliminary frame arrangement is paired with illustrative assembly benches, inverter cabinets and dispatch areas. Production layout and structural member sizes are conceptual.'],
 ['06-solar-approach','Future solar field','HYBRID ENERGY / TRACT 3','Room for the next energy chapter.','South-facing fixed-tilt rows occupy rear Tract 3, with perimeter and central service access. This is illustrative packing, not a final array design or a statement of generation capacity.'],
 ['07-north-up-plan','North-up master plan','PLAN / SURVEY-BASED CONCEPT','The whole site, legible at a glance.','US 70 is at the top. Manufacturing sits on Tract 1, the existing building group on Tract 2 and proposed solar on Tract 3. The second historic factory mark remains a future reservation.'],
 ['08-campus-dusk','Blue-hour operations','ATMOSPHERE / DESIGN STUDY','A quiet, purposeful campus.','A lighting study of the proposed operations retrofit. Building and equipment envelopes are illustrative. This is a Blender render, not a photograph or a commissioned facility.'],
 ['09-systems-overview','Systems overview','SYSTEMS / OPERATIONS CUTAWAY','Follow cooling, power and fiber.','An integrated routing study for the direct-liquid B300 proposal. Select a system to trace its path in 3D. Colored routes and moving dots explain connections; they do not establish capacity, loads or installation details.'],
 ['10-rack-liquid-cooling','Rack liquid cooling','COOLING / BUILDING A','From overhead headers to cold plates.','Facility water exchanges heat with a separate server-coolant circuit at the CDU. Overhead supply and return branches feed rack manifolds and direct-to-chip B300 cooling. Room cooling remains necessary for residual heat and humidity.'],
 ['11-bess-power','BESS + power','ELECTRICAL / BUILDING B','Grid first. A separate future storage branch.','Main distribution feeds the IT UPS path. Future BESS connects through its PCS at the common bus, separate from the UPS; future PV is shown as another generation branch. Activation, capacity and islanding are not established.'],
 ['12-fiber-handoff','Dobson fiber handoff','NETWORK / BUILDING B','A confirmed handoff, a proposed campus route.','The owner confirms the Dobson handoff in B. The model follows a proposed route from the demarcation through site network equipment to A and C. The external approach, service details and route diversity remain unverified.'],
 ['13-hero-arrival','Campus arrival','ARRIVAL / MATERIALS STUDY','A campus with presence.','A photographic Blender study of the proposed campus, with material textures, planted edges and daylight. Explore the same geometry in 3D, or enable tracing to follow a system.'],
 ['14-datahall-interior','Data hall interior','INTERIOR / BUILDING A','A closer look inside compute.','Rack fronts, cooling connections and service space at a human scale. The direct-liquid B300 fit-out is a spatial proposal; final equipment and installation details remain open.'],
 ['15-cooling-plant-detail','Cooling plant detail','EXTERIOR / HEAT REJECTION','Materials meet infrastructure.','A detailed study of the proposed Daikin plant, insulated pipework and service connections. The owner’s closed-loop 208V requirement remains subject to exact equipment selection.'],
 ['16-manufacturing-interior','Manufacturing interior','INTERIOR / MANUFACTURING','Light, structure and production.','A view into the preliminary manufacturing hall, with structural rhythm, material finishes and illustrative assembly areas. Production layout and final construction details remain to be developed.']
];
let current='13-hero-arrival',mode='image',model=null,renderer,scene,camera,controls,THREE,animation=0,cutaway=false,transition=null;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let knownReducedMotion=reduced.matches;
let selectedSystem='all',motionPaused=reduced.matches,modelLoading=null,systemsAvailable=false,flowClock=0,lastFrame=0,requestMode='image';
let tracing=false,appearance='photoreal',quality='balanced',composer=null,aoPass=null,outputPass=null,environmentTarget=null,environmentSource=null,environmentReady=false,qualityLoading=null;
let stageVisible=true,resizeObserver=null,ready=false,generation=0,loadAttempt=null,modelBytes=null,contextLostHandler=null,interacting=false,controlsMoving=false;
const savedMaterials=new Map(),materialTextures=new Set(),authoredLights=[];
const circuitColors={'fws-supply':'#288ebd','fws-return':'#f29055','tcs-supply':'#22dcca','tcs-return':'#ed6295',power:'#f1bd52',dc:'#b898f3',fiber:'#b58aff',future:'#7b9690'};
const systemViews={all:'09-systems-overview',cooling:'10-rack-liquid-cooling',power:'11-bess-power',fiber:'12-fiber-handoff'};
const systemNames={all:'All systems',cooling:'Cooling',power:'Power',fiber:'Fiber'};
const flowObjects=[];
const validSystems=new Set(['cooling','power','fiber']);
const stage=$('#stage'),image=$('#render'),canvasHost=$('#canvas'),labels=$('#labels');
function status(t){$('#status').textContent=t;}
for(let i=0;i<entries.length;i++){const e=entries[i];const b=$(`[data-view="${e[0]}"]`);b.setAttribute('aria-pressed',String(current===e[0]));b.onclick=()=>select(e[0]);}
function select(key){
 current=key;const i=entries.findIndex(e=>e[0]===key),e=entries[i],v=manifest.views[key]||{};
 if(Number(key.slice(0,2))>=13){tracing=false;selectedSystem='all';updateTraceControls();}
 root.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===key)));
 $('#view-kicker').textContent=e[2];$('#view-title').textContent=e[3];$('#view-description').textContent=e[4];$('#view-counter').textContent=`${String(i+1).padStart(2,'0')} / ${entries.length}`;
 image.srcset=`${ASSET_BASE}/renders/${key}-1600.webp 1600w, ${ASSET_BASE}/renders/${key}-2400.webp ${v.plan?1700:2400}w`;image.src=`${ASSET_BASE}/renders/${key}-1600.webp`;image.alt=e[3]+' '+e[4];$('#full-image').href=`${ASSET_BASE}/renders/${key}-2400.webp`;stage.dataset.plan=String(!!v.plan);
 cutaway=!!v.cutaway;
 if(mode==='model'&&model){applyLayers();setCamera(true);}
 else status('Rendered in Blender. Choose Explore in 3D for interactive materials and lighting.');
 updateOverlayNote();invalidate();
}
function fromBlender(a){return new THREE.Vector3(a[0],a[2],-a[1]);}
function setCamera(animate=false){
 const v=manifest.views[current]||manifest.views['03-compute-cooling'],target=fromBlender(v.target),eye=fromBlender(v.eye);
 camera.fov=2*Math.atan(36/(2*(v.lens||45))/1.6)*180/Math.PI;camera.updateProjectionMatrix();
 if(v.plan)eye.set(0,1100,.01);
 if(animate&&!reduced.matches)transition={start:performance.now(),eye:camera.position.clone(),target:controls.target.clone(),toEye:eye,toTarget:target};
 else{transition=null;camera.position.copy(eye);controls.target.copy(target);controls.update();}
 controls.maxDistance=v.plan||current==='01-campus-aerial'?1800:700;controls.minDistance=Number(current.slice(0,2))>=14?.45:3;
 scene.fog.near=current==='01-campus-aerial'?850:450;scene.fog.far=2100;
 updateLighting();updateLabels();invalidate();
}
function applyLayers(){
 const manufacturing=current.includes('manufactur')||current==='02-inverter-arrival';
 const focus=!!manifest.views[current]?.systemsFocus&&cutaway;
 model.traverse(o=>{if(o.userData.conceptAnnotation){o.visible=false;return;}if(!o.isMesh)return;const assembly=o.userData.assembly||'';const system=geometrySystem(o);const readableName=o.name.replaceAll('_',' ');const focusObstruction=focus&&((assembly.startsWith('20 ')&&/roof rafters|structural columns/i.test(readableName))||/^Data hall luminaires/.test(readableName));o.visible=!focusObstruction&&!(cutaway&&o.userData.hideWhenCutaway)&&!(cutaway&&o.userData.cutawayShell&&(manufacturing?assembly.startsWith('10 '):assembly.startsWith('20 ')))&&(!tracing||!system||selectedSystem==='all'||system===selectedSystem);});
 for(const flow of flowObjects)flow.group.visible=(tracing||appearance==='system')&&(!tracing||selectedSystem==='all'||flow.system===selectedSystem);
 updateLighting();updateMaterialAppearance();
 $('#cutaway').setAttribute('aria-pressed',String(cutaway));$('#cutaway').textContent=cutaway?'Restore shell':'Remove shell';
 updateOverlayNote();status('Drag to orbit · scroll or pinch to zoom · right-drag to pan. '+(tracing?'Flow directions are conceptual.':'Select a system to trace its connections.'));invalidate();
}
const hotspots=[];
function makeLabels(){
 for(const letter of ['A','B','C']){const b=manifest.buildings[letter],d=document.createElement('div');d.className='tag';d.textContent=letter+' / '+(letter==='B'?'Energy + network':'Direct liquid B300');labels.append(d);hotspots.push({element:d,point:fromBlender([b.x,b.y,6.8]),system:null});}
}
function updateLabels(){
 if(!camera)return;const show=tracing;
 const w=stage.clientWidth,h=stage.clientHeight;
 const occupied=[];
 for(const t of hotspots){const p=t.point.clone().project(camera),x=(p.x*.5+.5)*w,y=(-p.y*.5+.5)*h;const matches=t.system?t.system===selectedSystem:selectedSystem==='all';const overlaps=occupied.some(q=>Math.abs(q.x-x)<120&&Math.abs(q.y-y)<28);t.element.hidden=!show||!matches||p.z>1||p.z< -1||Math.abs(p.x)>.92||Math.abs(p.y)>.87||overlaps;if(!t.element.hidden)occupied.push({x,y});t.element.style.left=x+'px';t.element.style.top=y+'px';}
}
function imageMode(){requestMode='image';mode='image';image.hidden=false;canvasHost.hidden=true;labels.hidden=true;$('#loading').hidden=true;$('#image-mode').setAttribute('aria-pressed','true');$('#model-mode').setAttribute('aria-pressed','false');$('#cutaway').hidden=true;$('#reset').hidden=true;cancelAnimationFrame(animation);animation=0;lastFrame=0;transition=null;updateOverlayNote();status('Rendered in Blender. Appearance and tracing controls apply to the interactive 3D view.');}
async function modelMode(){
 requestMode='model';
 if(modelLoading)return modelLoading;
 if(ready&&model){mode='model';image.hidden=true;canvasHost.hidden=false;labels.hidden=false;$('#cutaway').hidden=false;$('#reset').hidden=false;$('#image-mode').setAttribute('aria-pressed','false');$('#model-mode').setAttribute('aria-pressed','true');applyLayers();setCamera(false);resize();return;}
 $('#loading').textContent='Loading Blender geometry and system routes…';$('#loading').hidden=false;$('#model-mode').disabled=true;status('Preparing the interactive model. Rendered views remain available.');
 const attempt={id:++generation,controller:new AbortController()};loadAttempt=attempt;
 modelLoading=loadModel(attempt);updateOverlayNote();return modelLoading;
}
function checkAttempt(attempt){if(attempt.id!==generation||attempt.controller.signal.aborted)throw attempt.controller.signal.reason||new Error('Superseded viewer load');}
function disposeObject(object){
 const geometries=new Set(),materials=new Set(),textures=new Set();
 object?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const material of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
 for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();for(const texture of textures)texture.dispose();
}
function disposeViewer(){
 generation++;loadAttempt?.controller.abort(new Error('Viewer restarted'));loadAttempt=null;modelLoading=null;ready=false;
 cancelAnimationFrame(animation);animation=0;lastFrame=0;transition=null;resizeObserver?.disconnect();resizeObserver=null;controls?.dispose();
 if(renderer&&contextLostHandler)renderer.domElement.removeEventListener('webglcontextlost',contextLostHandler);contextLostHandler=null;
 aoPass?.dispose();outputPass?.dispose();composer?.dispose();composer=null;aoPass=null;outputPass=null;qualityLoading=null;
 environmentTarget?.dispose();environmentSource?.dispose();environmentTarget=null;environmentSource=null;environmentReady=false;
 disposeObject(scene);scene?.userData.sun?.shadow?.dispose();renderer?.dispose();renderer?.forceContextLoss();
 model=null;renderer=null;scene=null;camera=null;controls=null;interacting=false;controlsMoving=false;savedMaterials.clear();materialTextures.clear();authoredLights.length=0;flowObjects.length=0;hotspots.length=0;labels.replaceChildren();canvasHost.replaceChildren();systemsAvailable=false;
}
function recoverViewer(message){
 imageMode();disposeViewer();quality='balanced';$('#quality').value=quality;$('#quality-note').textContent='Balanced · efficient detail';
 $('#loading').hidden=true;$('#model-mode').disabled=false;$('#model-mode').textContent='Restart 3D';updateOverlayNote();status(message+' Select Restart 3D to continue here; the rendered views remain available.');
}
async function loadModel(attempt){
 const signal=attempt.controller.signal,timer=setTimeout(()=>attempt.controller.abort(new Error('3D loading timed out.')),60000);
 try{
  const imports=await abortable(Promise.all([import('three'),import('three/addons/loaders/GLTFLoader.js'),import('three/addons/controls/OrbitControls.js'),import('./meshopt_decoder.mjs')]),signal);checkAttempt(attempt);
  THREE=imports[0];const [{},{GLTFLoader},{OrbitControls},{MeshoptDecoder}]=imports;
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=1;renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','Interactive campus. Drag to orbit, scroll to zoom, right-drag to pan.');canvasHost.replaceChildren(renderer.domElement);
  contextLostHandler=e=>{e.preventDefault();recoverViewer('The browser interrupted 3D graphics.');};renderer.domElement.addEventListener('webglcontextlost',contextLostHandler);
  scene=new THREE.Scene();scene.background=new THREE.Color('#cad5dc');scene.fog=new THREE.Fog('#cad5dc',450,2100);
  camera=new THREE.PerspectiveCamera(44,1,.08,2500);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=!reduced.matches;controls.dampingFactor=.09;controls.maxPolarAngle=Math.PI*.495;controls.listenToKeyEvents(renderer.domElement);controls.addEventListener('start',()=>{interacting=true;transition=null;invalidate();});controls.addEventListener('end',()=>{interacting=false;invalidate();});controls.addEventListener('change',invalidate);
  scene.userData.sky=new THREE.HemisphereLight(0xd7e7fb,0x777460,.65);scene.add(scene.userData.sky);const light=new THREE.DirectionalLight(0xffe7cd,2.5);scene.userData.sun=light;light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.normalBias=.025;light.shadow.bias=-.00015;light.shadow.radius=3;scene.add(light,light.target);
  scene.userData.localLights=Array.from({length:4},()=>{const local=new THREE.PointLight(0xffffff,0,35,2);scene.add(local);return local;});
  const [data]=await Promise.all([loadModelBytes(attempt),loadEnvironment(attempt)]);checkAttempt(attempt);
  $('#loading').textContent='Preparing model details and lighting…';
  const parsed=await abortable(new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data,''),signal,late=>disposeObject(late.scene));checkAttempt(attempt);
  model=parsed.scene;model.updateMatrixWorld(true);
  model.traverse(o=>{
   if(o.userData.conceptAnnotation)o.visible=false;
   if(o.isLight){o.userData.authoredIntensity=o.intensity;o.castShadow=false;o.visible=false;if(o.isPointLight)authoredLights.push(o);return;}
   if(!o.isMesh)return;o.castShadow=!/Cell bus|Terrain|Meadow|Grass blade/i.test(o.name);o.receiveShadow=true;
   const prepare=material=>{
    if(!(material.transmission>0))return material;
    // Avoid a second full-campus transmission pass. Equipment screens stay opaque.
    const glass=material.clone(),display=/monitoring display|cabinet display/i.test(o.name.replaceAll('_',' '));
    glass.transmission=0;glass.opacity=display?1:.28;glass.transparent=!display;glass.depthWrite=display;material.dispose();return glass;
   };
   o.material=Array.isArray(o.material)?o.material.map(prepare):prepare(o.material);
   const materials=Array.isArray(o.material)?o.material:[o.material];
   for(const material of materials){
    if(!savedMaterials.has(material))savedMaterials.set(material,{color:material.color?.clone(),emissive:material.emissive?.clone(),emissiveIntensity:material.emissiveIntensity,metalness:material.metalness,roughness:material.roughness});
    for(const value of Object.values(material))if(value?.isTexture)materialTextures.add(value);
   }
  });scene.add(model);setTextureQuality();
  makeLabels();await makeFlows(attempt);checkAttempt(attempt);resizeObserver=new ResizeObserver(resize);resizeObserver.observe(stage);
  await abortable(applyQuality(true),signal);checkAttempt(attempt);applyLayers();setCamera(false);
  // Three 0.180's compileAsync polling cannot be cancelled before disposal.
  // Compile the same programs, then stop our readiness polling on abort.
  const materials=renderer.compile(scene,camera),programs=[...materials].map(material=>renderer.properties.get(material).currentProgram).filter(Boolean);
  await waitUntilReady(()=>programs.every(program=>program.isReady()),signal);checkAttempt(attempt);
  ready=true;modelLoading=null;$('#model-mode').textContent='Explore in 3D';
  if(requestMode==='model')await modelMode();
 }catch(error){if(attempt.id===generation){modelBytes=null;const preference=quality;recoverViewer('3D could not finish loading.');quality=preference;$('#quality').value=quality;$('#quality-note').textContent=quality==='high'?'High · sharper shadows and contact shading':'Balanced · efficient detail';console.warn('[Campus viewer]',error instanceof Error?error.message:'3D unavailable');}}
 finally{clearTimeout(timer);if(attempt.id===generation){$('#loading').hidden=true;$('#model-mode').disabled=false;modelLoading=null;loadAttempt=null;updateOverlayNote();}}
}
function geometrySystem(object){
 for(let o=object;o&&o!==model;o=o.parent){const key=(o.userData.assembly||'')+' '+o.name;for(const [prefix,system] of [['32','cooling'],['33','power'],['34','fiber']])if(new RegExp(`(?:^|\\s)${prefix}\\s*[·. -]+\\s*${system}`,'i').test(key))return system;}
 return null;
}
async function loadModelBytes(attempt){
 if(modelBytes)return modelBytes;
 const compressed=typeof DecompressionStream==='function';
 const data=await fetchBytes(`${ASSET_BASE}/campus.glb${compressed?'.gz':''}`,attempt.controller.signal),bytes=new Uint8Array(data);checkAttempt(attempt);
 // A host may already have decoded Content-Encoding. Only unzip gzip bytes.
 const decoded=compressed&&bytes[0]===31&&bytes[1]===139?await abortable(new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(),attempt.controller.signal):data;checkAttempt(attempt);
 // Keep immutable CPU bytes so recovering a lost GPU does not download 17 MB again.
 modelBytes=decoded;return decoded;
}
async function loadEnvironment(attempt){
 const signal=attempt.controller.signal;
 const pmrem=new THREE.PMREMGenerator(renderer);pmrem.compileEquirectangularShader();
 try{
  const [{HDRLoader},data]=await Promise.all([abortable(import('three/addons/loaders/HDRLoader.js'),signal),fetchBytes(`${ASSET_BASE}/environment-1k.hdr`,signal,10000)]);checkAttempt(attempt);
  const hdr=new HDRLoader().parse(data);environmentSource=new THREE.DataTexture(hdr.data,hdr.width,hdr.height,THREE.RGBAFormat,hdr.type);environmentSource.colorSpace=THREE.LinearSRGBColorSpace;environmentSource.minFilter=THREE.LinearFilter;environmentSource.magFilter=THREE.LinearFilter;environmentSource.flipY=true;environmentSource.needsUpdate=true;environmentSource.mapping=THREE.EquirectangularReflectionMapping;
  environmentTarget=pmrem.fromEquirectangular(environmentSource);scene.environment=environmentTarget.texture;environmentReady=true;
 }catch(error){
  checkAttempt(attempt);
  console.warn('HDR lighting is unavailable; using the local studio-light fallback.',error.message);
  const {RoomEnvironment}=await abortable(import('three/addons/environments/RoomEnvironment.js'),signal);checkAttempt(attempt);const room=new RoomEnvironment();environmentTarget=pmrem.fromScene(room,.06);scene.environment=environmentTarget.texture;room.dispose();
 }finally{pmrem.dispose();}
}
function updateLighting(){
 if(!scene||!camera)return;
 const v=manifest.views[current]||manifest.views['03-compute-cooling'],inside=!!v.interior||current==='14-datahall-interior'||current==='16-manufacturing-interior',dusk=current==='08-campus-dusk';
 const skyColor=dusk?'#546b82':'#cad5dc';
 scene.background=environmentReady&&!dusk?environmentTarget.texture:new THREE.Color(skyColor);scene.backgroundBlurriness=.055;scene.backgroundIntensity=.9;scene.environmentIntensity=environmentReady?(inside?.3:dusk?.3:.95):.8;
 scene.fog.color.set(skyColor);scene.fog.near=inside?90:current==='01-campus-aerial'?850:450;scene.fog.far=inside?350:2100;
 const sun=scene.userData.sun,target=fromBlender(v.target);sun.target.position.copy(target);sun.position.copy(target).add(new THREE.Vector3(-75,110,65));sun.color.set(dusk?0xa7c8ef:0xffe7cd);sun.intensity=inside?.65:dusk?.28:2;
 const eye=fromBlender(v.eye),chosen=[];
 const sources=authoredLights.map(light=>({light,position:light.getWorldPosition(new THREE.Vector3())}));
 for(const point of [eye,target])for(const source of sources.slice().sort((a,b)=>a.position.distanceToSquared(point)-b.position.distanceToSquared(point)).filter(source=>!chosen.includes(source)).slice(0,2))chosen.push(source);
 // Four stable light slots prevent expensive shader variants while changing views.
 for(let i=0;i<scene.userData.localLights.length;i++){const light=scene.userData.localLights[i],source=chosen[i];light.intensity=source&&(inside||dusk)?source.light.userData.authoredIntensity*.02*(cutaway?.18:1):0;if(source){light.position.copy(source.position);light.color.copy(source.light.color);}light.distance=current==='16-manufacturing-interior'?60:35;}
 scene.userData.sky.intensity=inside?.16:environmentReady?.15:.65;
 const span=v.plan||current==='01-campus-aerial'?270:inside?(current==='16-manufacturing-interior'?65:24):Number(current.slice(0,2))>=10?48:110;
 Object.assign(sun.shadow.camera,{left:-span,right:span,top:span,bottom:-span,near:1,far:450});sun.shadow.camera.updateProjectionMatrix();
 camera.near=inside?.04:.08;camera.far=inside?350:2500;camera.updateProjectionMatrix();renderer.toneMappingExposure=inside?1:dusk?1.18:1.05;
 if(aoPass){aoPass.kernelRadius=inside?.32:.55;syncAOProjection();}
 renderer.shadowMap.needsUpdate=true;
}
function updateMaterialAppearance(){
 for(const [material,saved] of savedMaterials){
  const key=material.name.replace(/^System\s*/i,'').toLowerCase(),color=circuitColors[key];
  if(!color||!saved.color)continue;
  material.color.copy(saved.color);if(saved.emissive)material.emissive.copy(saved.emissive);material.emissiveIntensity=saved.emissiveIntensity;material.metalness=saved.metalness;material.roughness=saved.roughness;
  if(appearance==='system'){material.color.set(color);if(material.emissive){material.emissive.set(color);material.emissiveIntensity=.055;}material.metalness=.12;material.roughness=.48;}
 }
}
function setTextureQuality(){
 const anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),quality==='high'?16:4);
 for(const texture of materialTextures)if(texture.anisotropy!==anisotropy){texture.anisotropy=anisotropy;texture.needsUpdate=true;}
}
async function applyQuality(initial=false){
 $('#quality-note').textContent=quality==='high'?'High · sharper shadows and contact shading':'Balanced · efficient detail';
 if(!renderer||(!ready&&!initial))return;
 const ownedRenderer=renderer,ownedScene=scene,ownedCamera=camera,id=generation;setTextureQuality();
 const sun=scene.userData.sun,mapSize=quality==='high'?2048:1024;
 if(sun.shadow.mapSize.x!==mapSize){sun.shadow.map?.dispose();sun.shadow.map=null;sun.shadow.mapSize.set(mapSize,mapSize);renderer.shadowMap.needsUpdate=true;}
 if(quality==='high'&&!composer){
  if(!qualityLoading)qualityLoading=(async()=>{
   try{
    const [{EffectComposer},{RenderPass},{SSAOPass},{OutputPass}]=await Promise.all([import('three/addons/postprocessing/EffectComposer.js'),import('three/addons/postprocessing/RenderPass.js'),import('three/addons/postprocessing/SSAOPass.js'),import('three/addons/postprocessing/OutputPass.js')]);
    if(id!==generation||quality!=='high')return;
    const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:Math.min(ownedRenderer.capabilities.maxSamples,2)});composer=new EffectComposer(ownedRenderer,target);composer.addPass(new RenderPass(ownedScene,ownedCamera));
    aoPass=new SSAOPass(ownedScene,ownedCamera,1,1,16);aoPass.kernelRadius=.45;composer.addPass(aoPass);outputPass=new OutputPass();composer.addPass(outputPass);syncAOProjection();
   }catch(error){if(id===generation){
    aoPass?.dispose();outputPass?.dispose();composer?.dispose();aoPass=null;outputPass=null;composer=null;
    quality='balanced';$('#quality').value=quality;await applyQuality();
    console.warn('Optional contact shading is unavailable.',error.message);$('#quality-note').textContent='Balanced · contact shading unavailable';
   }}
   finally{if(id===generation)qualityLoading=null;}
  })();
  await qualityLoading;
 }
 if(id===generation){resize();invalidate();}
}
function syncAOProjection(){
 if(!aoPass)return;const uniforms=aoPass.ssaoMaterial.uniforms;
 uniforms.cameraNear.value=camera.near;uniforms.cameraFar.value=camera.far;uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);uniforms.cameraInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);
 aoPass.minDistance=.006/(camera.far-camera.near);aoPass.maxDistance=.7/(camera.far-camera.near);
}
function runningMotion(){return tracing&&!motionPaused&&!reduced.matches&&flowObjects.some(flow=>flow.active&&flow.group.visible);}
function syncMotionPreference(force=false){
 const next=reduced.matches;if(!force&&next===knownReducedMotion)return;knownReducedMotion=next;
 if(next){motionPaused=true;transition=null;}if(controls)controls.enableDamping=!next;updateOverlayNote();
}
function invalidate(){if(ready&&renderer&&mode==='model'&&stageVisible&&!document.hidden&&!animation)animation=requestAnimationFrame(draw);}
function draw(now){
 animation=0;if(!ready||mode!=='model'||!stageVisible||document.hidden)return;
 // Trace animation needs at most 30 fps; orbiting and camera moves remain responsive.
 if(runningMotion()&&!transition&&!interacting&&!controlsMoving&&lastFrame&&now-lastFrame<1000/30-1){invalidate();return;}
 try{
 syncMotionPreference();
 const dt=lastFrame?Math.min((now-lastFrame)/1000,.05):0;lastFrame=now;
 if(transition){const p=Math.min(1,(now-transition.start)/900),t=p*p*(3-2*p);camera.position.lerpVectors(transition.eye,transition.toEye,t);controls.target.lerpVectors(transition.target,transition.toTarget,t);if(p===1)transition=null;}
 if(runningMotion()){flowClock+=dt;updateParticles();}
 const moving=controls.update();controlsMoving=moving;updateLabels();
 if(quality==='high'&&composer)composer.render(dt);else renderer.render(scene,camera);
 if(transition||moving||runningMotion())invalidate();
 }catch(error){console.warn('[Campus viewer] Rendering interrupted:',error.message);recoverViewer('3D rendering was interrupted.');}
}
function updateTraceControls(){
 root.querySelectorAll('[data-system]').forEach(button=>button.setAttribute('aria-pressed',String(tracing&&button.dataset.system===selectedSystem)));
 $('#stop-tracing').hidden=!tracing;
}
function updateOverlayNote(){
 const loading=!!modelLoading&&requestMode==='model';
 const title=systemNames[selectedSystem];
 $('#overlay-note').textContent=loading?'Loading 3D · materials, lighting and geometry…':mode==='image'?'Rendered in Blender · material, quality and trace controls affect 3D only.':tracing?(systemsAvailable?`3D · ${title} traced · ${motionPaused||reduced.matches?'motion paused':'directional flow on'} · future BESS / PV branches remain inactive.`:`3D · ${title} selected · route overlay unavailable.`):appearance==='system'?'3D · system colors and static routes · select a system to animate its connections.':`3D · photoreal materials · ${environmentReady?'HDR daylight and reflections':'local studio lighting'} · select a system to trace its connections.`;
 const motion=$('#motion');motion.disabled=mode!=='model'||!systemsAvailable||reduced.matches||!tracing;motion.setAttribute('aria-pressed',String(motionPaused||reduced.matches));motion.textContent=reduced.matches?'Motion off · reduced motion':motionPaused?'Resume motion':'Pause motion';
 $('.flow-legend').hidden=mode!=='model'||(!tracing&&appearance!=='system');updateTraceControls();
}
function sampleRoute(flow,fraction,result){
 const distance=fraction*flow.length;let index=1;
 while(index<flow.distances.length-1&&flow.distances[index]<distance)index++;
 const previous=flow.distances[index-1],span=flow.distances[index]-previous;
 return result.lerpVectors(flow.points[index-1],flow.points[index],span?(distance-previous)/span:0);
}
async function makeFlows(attempt){
 try{
  const bytes=await fetchBytes(`${ASSET_BASE}/systems.json`,attempt.controller.signal,10000);checkAttempt(attempt);const data=JSON.parse(new TextDecoder().decode(bytes));
  for(const route of data.routes||[]){
   if(!validSystems.has(route.system)||!Array.isArray(route.points))continue;
   const points=route.points.filter(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)).map(fromBlender);
   if(points.length<2)continue;
   const distances=[0];for(let i=1;i<points.length;i++)distances.push(distances[i-1]+points[i].distanceTo(points[i-1]));const length=distances.at(-1);if(length<.001)continue;
   const color=/^#[0-9a-f]{6}$/i.test(route.color||'')?route.color:({cooling:'#46caff',power:'#ffbe63',fiber:'#d998ff'})[route.system];
   const active=route.active===true,future=route.future===true,detail=/-plate|CDU-(primary|secondary)-HX/i.test(route.id||''),group=new THREE.Group();group.name='Flow overlay: '+(route.id||route.label||route.system);group.userData.system=route.system;
   const geometry=new THREE.BufferGeometry().setFromPoints(points);
   const material=future?new THREE.LineDashedMaterial({color,transparent:true,opacity:.32,depthWrite:false,dashSize:.7,gapSize:.55}):new THREE.LineBasicMaterial({color,transparent:true,opacity:detail?.13:.42,depthWrite:false});
   const line=new THREE.Line(geometry,material);line.computeLineDistances();group.add(line);
   const count=Math.min(14,Math.max(3,Math.ceil(length/8))),particleGeometry=new THREE.BufferGeometry();particleGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(count*3),3));
   const particles=new THREE.Points(particleGeometry,new THREE.PointsMaterial({color,size:.32,sizeAttenuation:true,transparent:true,opacity:.98,depthWrite:false}));particles.visible=active&&!future&&!detail;group.add(particles);scene.add(group);
   flowObjects.push({group,points,distances,length,particles,count,system:route.system,active:active&&!future&&!detail,bidirectional:route.bidirectional===true});
  }
  for(const node of data.nodes||[]){
   if(!validSystems.has(node.system)||!Array.isArray(node.position)||node.position.length!==3||!node.position.every(Number.isFinite))continue;
   if(/\.(gpu|cpu)\d/i.test(node.id||''))continue;
   const d=document.createElement('div');d.className='tag system-tag '+node.system;d.textContent=node.label||node.id;labels.append(d);hotspots.push({element:d,point:fromBlender(node.position),system:node.system});
  }
  systemsAvailable=flowObjects.length>0;updateParticles();
 }catch(error){checkAttempt(attempt);console.warn('The system overlay is unavailable:',error.message);systemsAvailable=false;}
}
function updateParticles(){
 if(!THREE)return;const point=new THREE.Vector3();
 for(const flow of flowObjects){if(!flow.active||!flow.group.visible)continue;const attribute=flow.particles.geometry.attributes.position;
  for(let i=0;i<flow.count;i++){const reverse=flow.bidirectional&&i%2===1;let fraction=(i/flow.count+flowClock*.038)%1;if(reverse)fraction=1-fraction;sampleRoute(flow,fraction,point);attribute.setXYZ(i,point.x,point.y,point.z);}attribute.needsUpdate=true;
 }
}
async function selectSystem(system){
 if(!(system in systemNames))return;if(!tracing)motionPaused=reduced.matches;tracing=true;selectedSystem=system;
 root.querySelectorAll('[data-system]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.system===system)));
 root.querySelectorAll('[data-flow]').forEach(card=>{card.dataset.selected=String(system==='all'||card.dataset.flow===system);});
 select(systemViews[system]);updateOverlayNote();await modelMode();
}
function resize(){if(!renderer||!camera)return;const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;const ratio=Math.min(devicePixelRatio,quality==='high'?1.5:1.25,Math.sqrt((quality==='high'?2000000:1200000)/(w*h)));if(Math.abs(renderer.getPixelRatio()-ratio)>.001)renderer.setPixelRatio(ratio);renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();if(composer){composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(w,h);}syncAOProjection();updateLabels();invalidate();}
$('#model-mode').onclick=modelMode;$('#image-mode').onclick=imageMode;$('#cutaway').onclick=()=>{cutaway=!cutaway;applyLayers();};$('#reset').onclick=()=>setCamera(false);
root.querySelectorAll('[data-system]').forEach(button=>button.addEventListener('click',()=>selectSystem(button.dataset.system)));
$('#motion').onclick=()=>{motionPaused=!motionPaused;updateOverlayNote();invalidate();};
$('#stop-tracing').onclick=()=>{tracing=false;selectedSystem='all';updateTraceControls();if(model)applyLayers();updateLabels();updateOverlayNote();invalidate();};
root.querySelectorAll('[data-appearance]').forEach(button=>button.addEventListener('click',async()=>{appearance=button.dataset.appearance;root.querySelectorAll('[data-appearance]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.appearance===appearance)));if(model&&mode==='model')applyLayers();else await modelMode();}));
$('#quality').addEventListener('change',async event=>{quality=event.target.value==='high'?'high':'balanced';try{await applyQuality();}catch(error){recoverViewer('The graphics quality change could not finish.');}});
reduced.addEventListener('change',()=>{syncMotionPreference(true);invalidate();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(animation);animation=0;lastFrame=0;}else invalidate();});
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await stage.requestFullscreen();}catch{status('Fullscreen is unavailable here. Open the full-resolution image in another tab to enlarge it.');}};
document.addEventListener('fullscreenchange',resize);image.addEventListener('error',()=>status('This render is unavailable. Select another view or reload this page.'));
const visibilityObserver=new IntersectionObserver(entries=>{stageVisible=entries.some(e=>e.isIntersecting);if(stageVisible)invalidate();else{cancelAnimationFrame(animation);animation=0;lastFrame=0;}},{threshold:0});visibilityObserver.observe(stage);
window.addEventListener('pagehide',event=>{cancelAnimationFrame(animation);animation=0;lastFrame=0;if(event.persisted)return;disposeViewer();modelBytes=null;visibilityObserver.disconnect();});
window.addEventListener('pageshow',event=>{if(event.persisted){syncMotionPreference(true);resize();invalidate();}});
const requestedView=new URL(location.href).searchParams.get('view');select(entries.some(e=>e[0]===requestedView)?requestedView:current);updateOverlayNote();
