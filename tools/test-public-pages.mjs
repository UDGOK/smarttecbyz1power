// Inspect generated pages after a Node or Vercel build. No browser/GPU required.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,join,basename} from 'node:path';

const root=resolve(process.argv[2]||'dist/client');
const routes=[
  ['site','campus','today',false],['power','power','service',false],
  ['colocation','machine','two-ways',false],['compute','machine','fleet',false],
  ['model-planner','machine','planner',true],['news','power','brief',true],
  ['about','campus','what',false],['contact','campus','form-heading',true],
];
let checks=0,entry;
for(const[route,kind,anchor,compact]of routes){
  const html=await readFile(join(root,route,'index.html'),'utf8');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size,ids.length,`${route}: duplicate IDs`);checks++;
  assert.equal((html.match(/<h1\b/g)||[]).length,1,`${route}: heading hierarchy`);checks++;
  assert.ok(ids.includes(anchor),`${route}: primary link target missing`);checks++;
  assert.equal((html.match(/<figure[^>]*\bdata-page-scene\b/g)||[]).length,1);checks++;
  assert.ok(html.includes(`data-scene-kind="${kind}"`));checks++;
  assert.ok(html.includes(`data-scene-compact="${compact}"`));checks++;
  assert.ok(html.includes('smarttec-lockup-offwhite-green.svg'));checks++;
  assert.ok(html.includes('/investor-assets/fonts.css'));checks++;
  assert.ok(html.includes('class="page-trail"'));checks++;
  assert.ok(!html.includes('/api/investor/'),`${route}: private API reference`);checks++;
  assert.ok(!html.includes('id="gate"'),`${route}: unexpected entry gate`);checks++;
  const sceneScript=[...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map(match=>match[1]).find(src=>src.includes('PageScene.'));
  assert.ok(sceneScript,`${route}: missing scene controller`);checks++;
  if(entry)assert.equal(entry,sceneScript);else entry=sceneScript;
  if(compact){assert.match(html,/<details class="page-scene-fold">/);checks++;}
  if(route==='contact'){assert.match(html,/<form\b/);checks++;}
}

// Follow only static imports from the public controller. Three and scene code
// must remain behind the dynamic loading path, including on compact routes.
const visited=new Set();
async function inspect(file){
  if(visited.has(file))return;visited.add(file);
  assert.ok(!/^(three|stage-|renderer\.)/.test(basename(file)),`3D on initial static import path: ${file}`);
  const source=await readFile(file,'utf8');
  for(const match of source.matchAll(/\bimport\s*(?:[^;]*?\bfrom\s*)?["']([^"']+)["']/g)){
    if(match[1].startsWith('.'))await inspect(resolve(file,'..',match[1]));
  }
}
await inspect(join(root,entry));checks++;
const assets=await readdir(join(root,'_astro'));
assert.ok(assets.some(name=>name.startsWith('renderer.')));checks++;
const fonts=await readFile(join(root,'investor-assets/fonts.css'),'utf8');
assert.ok(fonts.includes('GoogleSansCode-Regular.ttf'));checks++;
console.log(`PASS: ${checks} generated public-page checks across ${routes.length} routes. Browser appearance and WebGL behavior still require preview review.`);
