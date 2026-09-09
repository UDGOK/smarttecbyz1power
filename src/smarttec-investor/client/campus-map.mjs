import * as ml from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import {geojson,bounds,validateRegistration} from '../map-geometry.mjs';
export function initCampusMap(data,config={}) {
 ml.setWorkerUrl(workerUrl);
 const $=s=>document.querySelector(s), status=$('#inv-map-status');
 let registration=structuredClone(data.registration), collection=geojson(data), satellite=false, aligned=registration.status==='control-points-reviewed';
 const enabled=new Set(['tracts','existing','planned','energy','easements']);
 const map=new ml.Map({container:'inv-campus-map',style:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#101d23'}}]},center:registration.northWest,zoom:15,pitch:48,attributionControl:true});
 map.addControl(new ml.NavigationControl());map.addControl(new ml.ScaleControl({unit:'imperial'}));
 const note=()=>status.textContent=satellite?`Satellite imagery · ${aligned?'USER-ALIGNED CONCEPT OVERLAY — not survey verification':'overlay hidden until corner alignment is previewed'}. Imagery date varies; 3D shapes are illustrative.`:'3D CONCEPT PLAN · Approximate positions, illustrative heights. No satellite registration has been verified.';
 const filter=()=>{if(!map.getLayer('areas'))return;const f=['all',['in',['get','group'],['literal',[...enabled]]],['literal',!satellite||aligned]];for(const id of ['areas','outlines','buildings'])map.setFilter(id,f);};
 const fit=()=>map.fitBounds(bounds(collection),{padding:55,duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:800});
 function detail(feature){$('#inv-map-detail').textContent=`${feature.name} — ${feature.status}. ${feature.description}`;const f=collection.features.find(x=>x.id===feature.id);map.fitBounds(bounds({features:[f]}),{padding:80,maxZoom:18,duration:500});}
 for(const group of enabled){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=true;input.addEventListener('change',()=>{input.checked?enabled.add(group):enabled.delete(group);filter();});label.append(input,document.createTextNode(' '+group));$('#inv-map-layers').append(label);}
 for(const f of data.features.filter(f=>f.group!=='easements')){const b=document.createElement('button');b.textContent=f.name;b.addEventListener('click',()=>detail(f));$('#inv-map-features').append(b);}
 map.on('load',()=>{
 map.addSource('campus',{type:'geojson',data:collection});
 map.addLayer({id:'areas',type:'fill',source:'campus',paint:{'fill-color':['get','color'],'fill-opacity':.18}});
 map.addLayer({id:'outlines',type:'line',source:'campus',paint:{'line-color':['get','color'],'line-width':2}});
 map.addLayer({id:'buildings',type:'fill-extrusion',source:'campus',paint:{'fill-extrusion-color':['get','color'],'fill-extrusion-height':['get','height'],'fill-extrusion-opacity':.85}});
 map.on('click',e=>{const hits=map.queryRenderedFeatures(e.point,{layers:['buildings','areas']});const hit=hits.find(f=>f.properties.group!=='tracts')||hits[0];if(hit)detail(data.features.find(f=>f.id===hit.properties.id));});
 filter();fit();note();
 });
 map.on('error',()=>{status.textContent='Map resource failed to load. Check the imagery key, domain restrictions and network; the survey remains available below.';});
 $('#inv-map-plan').onclick=()=>{satellite=false;if(map.getLayer('satellite'))map.setLayoutProperty('satellite','visibility','none');filter();note();};
 $('#inv-map-satellite').onclick=()=>{if(!config.satelliteKey){status.textContent='Satellite requires a MapTiler key. Designer: set INVESTOR_MAPTILER_KEY and restrict it to your domain. The interactive concept plan works without it.';return;}if(!map.isStyleLoaded()){status.textContent='Wait for the map to load, then retry.';return;}if(!map.getSource('satellite')){map.addSource('satellite',{type:'raster',url:`https://api.maptiler.com/tiles/satellite-v4/tiles.json?key=${encodeURIComponent(config.satelliteKey)}`,tileSize:256});map.addLayer({id:'satellite',type:'raster',source:'satellite'},'areas');}else map.setLayoutProperty('satellite','visibility','visible');satellite=true;filter();note();};
 $('#inv-map-tilt').onclick=()=>map.easeTo({pitch:map.getPitch()>10?0:55,duration:400});$('#inv-map-reset').onclick=fit;
 const form=$('#inv-map-align');for(const k of ['northWest','northEast','southWest'])form.elements[k].value=registration[k].join(', ');
 form.onsubmit=e=>{e.preventDefault();try{const next={...registration,status:'user-aligned-preview',basis:'User supplied control points; independent verification pending'};for(const k of ['northWest','northEast','southWest'])next[k]=form.elements[k].value.split(',').map(x=>Number(x.trim()));validateRegistration(next);registration=next;collection=geojson(data,registration);map.getSource('campus').setData(collection);aligned=true;filter();fit();note();}catch(err){status.textContent=err.message;}};
 $('#inv-map-download').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({registration,warning:'Concept alignment only; replace campus-map.json registration after review.'},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='SmartTec_map_registration.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
}
