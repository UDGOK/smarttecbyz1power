import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {loadTS} from './helpers/load-ts.mjs';

const assets='public/assets/campus/2026-09';
const read=path=>readFile(path,'utf8');
const scene=JSON.parse(await read('src/smarttec-campus/scene.json'));
const keys=Object.keys(scene.views);
const privateReference=/\/api\/investor\/|(?:^|[\s"'(])[A-Z]:[\\/]|(?:^|[\\/])(?:Users|Downloads)[\\/]|\.(?:blend|xlsx?|pdf)\b/i;

async function files(dir){
 const entries=await readdir(dir,{withFileTypes:true});
 return (await Promise.all(entries.map(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]))).flat();
}
async function glb(){
 const path=(await files(assets)).find(path=>/[\\/]campus\.glb(?:\.gz)?$/.test(path));
 assert.ok(path,'published campus GLB exists');
 let bytes=await readFile(path);if(path.endsWith('.gz'))bytes=gunzipSync(bytes);
 assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(4),2);
 assert.equal(bytes.readUInt32LE(8),bytes.length,'GLB declared length matches complete asset');
 const chunks=[];
 for(let offset=12;offset<bytes.length;){
  assert.ok(offset+8<=bytes.length);const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);
  assert.ok(offset+8+length<=bytes.length,'GLB chunk is not truncated');
  chunks.push({type,bytes:bytes.subarray(offset+8,offset+8+length)});offset+=8+length;
 }
 assert.equal(chunks[0].type,0x4e4f534a);
 return {json:JSON.parse(chunks[0].bytes.toString('utf8')),bin:chunks.find(c=>c.type===0x004e4942)?.bytes};
}

test('all sixteen public camera views have valid small and large render assets',async()=>{
 assert.equal(keys.length,16);assert.equal(new Set(keys).size,16);
 for(const key of keys){
  assert.match(key,/^\d{2}-[a-z-]+$/);
  for(const name of ['eye','target'])assert.ok(scene.views[key][name]?.length===3&&scene.views[key][name].every(Number.isFinite),`${key}: finite ${name}`);
  for(const width of [1600,2400]){
   const bytes=await readFile(`${assets}/renders/${key}-${width}.webp`);
   assert.equal(bytes.toString('ascii',0,4),'RIFF',`${key}-${width}: WebP RIFF`);
   assert.equal(bytes.toString('ascii',8,12),'WEBP');
   assert.equal(bytes.readUInt32LE(4)+8,bytes.length,'render is not truncated');
  }
 }
 const hdr=await readFile(`${assets}/environment-1k.hdr`);
 assert.match(hdr.subarray(0,180).toString('ascii'),/^#\?(?:RADIANCE|RGBE)/);
 assert.ok((await stat(`${assets}/credits.txt`)).size>50,'public material and lighting credits provided');
});

test('public GLB is self-contained PBR geometry without private drawing payloads',async()=>{
 const {json,bin}=await glb();assert.ok(bin?.length>0);
 assert.equal(json.asset.version,'2.0');assert.ok(json.meshes?.length>20,'equipment and campus geometry exported');
 assert.ok(json.images?.length>=4,'material textures accompany the realistic scene');
 assert.ok(json.materials?.some(m=>m.pbrMetallicRoughness?.baseColorTexture),'textured PBR materials retained');
 assert.ok(json.materials?.some(m=>m.normalTexture),'surface normal maps retained');
 assert.ok(json.buffers?.length>0);assert.ok(json.buffers.every(buffer=>!buffer.uri),'no external buffer references');
 assert.ok(json.images.every(image=>!image.uri&&Number.isInteger(image.bufferView)),'images embedded in GLB');
 for(const image of json.images){
  assert.ok(['image/png','image/jpeg','image/webp'].includes(image.mimeType));
  const view=json.bufferViews[image.bufferView];assert.ok(view&&view.buffer===0);
  const offset=view.byteOffset||0;assert.ok(view.byteLength>0&&offset+view.byteLength<=bin.length,'embedded texture bounds');
  const bytes=bin.subarray(offset,offset+view.byteLength);
  if(image.mimeType==='image/png')assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  if(image.mimeType==='image/jpeg')assert.equal(bytes.subarray(0,2).toString('hex'),'ffd8');
  if(image.mimeType==='image/webp')assert.equal(bytes.toString('ascii',8,12),'WEBP');
 }
 assert.doesNotMatch(JSON.stringify(json),privateReference,'public GLB must not contain local paths or original documents');
 assert.ok(!json.nodes?.some(node=>/^95\s|source references/i.test(node.name||'')||/^95\s/.test(node.extras?.assembly||'')),'hidden source-reference collection excluded');
 for(const path of await files(assets)){
  assert.ok(['.glb','.gz','.hdr','.webp','.txt','.json','.mjs'].includes(extname(path)),`unexpected public source artifact: ${path}`);
  if(['.txt','.json'].includes(extname(path)))assert.doesNotMatch(await read(path),privateReference,`${path}: private source reference`);
 }
});

test('published system graph keeps the reviewed fleet and future energy phasing',async()=>{
 const systems=JSON.parse(await read(`${assets}/systems.json`));
 assert.equal(new Set(systems.rackIds).size,8);
 assert.equal(systems.rackIds.filter(id=>id.startsWith('A')).length,4);
 assert.equal(systems.rackIds.filter(id=>id.startsWith('C')).length,4);
 const ids=new Set(systems.nodes.map(node=>node.id));assert.equal(ids.size,systems.nodes.length);
 for(const node of systems.nodes)assert.ok(node.position?.length===3&&node.position.every(Number.isFinite));
 assert.ok(systems.routes.some(route=>route.system==='power'&&route.active&&!route.future),'grid/UPS path can be traced');
 assert.ok(systems.routes.some(route=>route.system==='fiber'&&route.active),'fiber path can be traced');
 const future=systems.routes.filter(route=>route.future);assert.ok(future.length>0);
 assert.ok(future.every(route=>route.active===false),'future PV/BESS must not animate as operating infrastructure');
 assert.equal(systems.heatExchangers.length,2,'one distinct CDU per proposed compute hall');
 for(const exchanger of systems.heatExchangers){
  assert.ok(exchanger.primaryPorts.every(port=>ids.has(port)));assert.ok(exchanger.secondaryPorts.every(port=>ids.has(port)));
  assert.equal(new Set([...exchanger.primaryPorts,...exchanger.secondaryPorts]).size,4,'facility and server coolant ports remain separate');
 }
});

test('public campus and shared entry points distinguish proposed DLC from the financial baseline',async()=>{
 const [page,preview,site,investors,record,sitemap]=await Promise.all([
  read('src/pages/site/campus.astro'),read('src/components/CampusPreview.astro'),read('src/pages/site.astro'),
  read('src/pages/investors/index.astro'),read('src/data/site.ts'),read('src/pages/sitemap-index.xml.ts')]);
 for(const content of [page,preview])assert.doesNotMatch(content,/\/api\/investor\/|smarttec-architecture\/server|survey-image|marked-survey/,'public component has no protected source assets');
 assert.match(page,/<SiteHeader\b/);assert.match(page,/<SiteFooter\b/);assert.match(page,/<noscript>/);
 assert.equal((page.match(/data-view="/g)||[]).length,16);
 for(const key of keys){assert.ok(page.includes(`data-view="${key}"`));assert.ok(page.includes(`/renders/${key}-2400.webp`),'no-JavaScript render link');}
 assert.match(page,/campusConcept\.budgetBasis/);
 const {campusConcept,MODEL_EDITION}=loadTS('src/data/site.ts');
 assert.equal(MODEL_EDITION,'v6.1.1 · upgraded source revision');
 assert.match(campusConcept.budgetBasis,/air-cooled.*one-building/);
 assert.match(campusConcept.budgetBasis,/direct[- ]liquid.*Buildings A and C/i);assert.match(campusConcept.budgetBasis,/repric/i);
 assert.match(page,/islanding[^<]*(?:not established|remain|claim)/i);
 assert.match(record,/href:\s*'\/site\/campus'/);assert.match(record,/budgetBasis:[^\n]*MODEL_EDITION[^\n]*air-cooled[^\n]*one-building[^\n]*repricing/);
 assert.match(preview,/campusConcept\.href/);assert.match(preview,/campusConcept\.budgetBasis/);
 assert.match(site,/<CampusPreview\b/);assert.match(investors,/<CampusPreview\b[^>]*id="campus"/);
 assert.doesNotMatch(investors,/site-map|private-reference|marked-survey|survey-image|\/api\/investor\/survey/,'retired survey panel is absent from investor room');
 assert.doesNotMatch(preview,/href="#site-map"|private survey|satellite reference/,'shared campus preview has no retired survey link');
 assert.match(sitemap,/'\/site\/campus'/,'public campus is discoverable in the sitemap');
});
