import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Box3} from 'three';
import {chapters,imageDisclosure} from '../src/smarttec-architecture/chapters.mjs';
import {architectureAsset} from '../src/smarttec-architecture/server/architecture-assets.mjs';

test('each chapter has its own appropriate image and a valid self-contained model',async()=>{
 assert.equal(new Set(Object.values(chapters).map(c=>c.image)).size,4);
 for(const [key,c] of Object.entries(chapters)){
  assert.ok(c.alt.length>40);assert.ok(c.modelNote);assert.ok(imageDisclosure(key));
  const picture=architectureAsset(c.image,'GET');assert.equal(picture.mime,'image/png');assert.equal(picture.bytes.toString('ascii',1,4),'PNG');
  const {bytes}=architectureAsset(c.model,'GET');assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(8),bytes.length);
  const length=bytes.readUInt32LE(12),json=JSON.parse(bytes.toString('utf8',20,20+length));
  assert.ok(!json.images?.some(i=>i.uri));assert.ok(!json.buffers.some(b=>b.uri));
  const model=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const bounds=new Box3().setFromObject(model.scene);assert.ok(!bounds.isEmpty());assert.ok(Number.isFinite(bounds.max.x));
  let triangles=0;model.scene.traverse(o=>{if(o.isMesh){triangles+=o.geometry.index.count/3;o.geometry.dispose();o.material.dispose();}});assert.ok(triangles>100);
 }
});
test('asset registry refuses POST and unlisted actions',()=>{
 assert.equal(architectureAsset('module-rack','POST'),null);assert.equal(architectureAsset('../../.env','GET'),null);
});
test('visual components preserve transparent mode labels and lazy GPU work',async()=>{
 const code=await readFile('src/smarttec-architecture/campus-viewer.mjs','utf8');
 assert.ok(code.indexOf("import('three')")>code.indexOf('async function launch()'));
 assert.ok(code.includes('if(!visible||document.hidden)return'));
 assert.ok(code.includes('poster.alt=c.alt'));assert.ok(code.includes('3D UNAVAILABLE · IMAGE VIEW'));
 const markup=await readFile('src/smarttec-architecture/ArchitecturalCampus.astro','utf8');
 for(const phrase of ['not photographs or renders','id="sta-mode"','aria-pressed','prefers-reduced-motion'])assert.ok(markup.includes(phrase));
});
