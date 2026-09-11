// Check real generated HTML and downloads, without network access or credentials.
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {JSDOM} from 'jsdom';
const root=resolve(process.argv[2]||'dist/client');
const routes=['','site','power','colocation','compute','model-planner','news','about','contact','brand'];
let checks=0;const targets=new Set();
for(const route of routes){
 const html=await readFile(join(root,route,'index.html'),'utf8');
 const dom=new JSDOM(html),doc=dom.window.document;
 assert.doesNotMatch(doc.body.textContent,/\[PLACEHOLDER:|\[PHOTO NEEDED\]|visible placeholder|Every image on this site is a photograph/);checks++;
 assert.equal(doc.querySelector('#menu-toggle').getAttribute('aria-label'),'Menu');checks++;
 for(const anchor of doc.querySelectorAll('a[href]')){
   const url=new URL(anchor.getAttribute('href'),'https://www.smarttec.dev/'+route);
   if(url.origin!=='https://www.smarttec.dev'||url.pathname.startsWith('/investors'))continue;
   if(url.hash && (url.pathname==='/' + route || url.pathname==='/' + route+'/')){
     assert.ok(doc.getElementById(decodeURIComponent(url.hash.slice(1))),`${route}: missing ${url.hash}`);checks++;
   }
   targets.add(decodeURIComponent(url.pathname));
 }
 assert.doesNotMatch(doc.body.textContent,/two existing (?:four-GPU |RTX)|whole planned first phase|One planned here|Refreshed every 15 minutes/i);checks++;
 assert.equal(doc.querySelectorAll('.todo').length,0,`${route}: public placeholder styling remains`);checks++;
 if(route && route!=='brand') { assert.match(doc.querySelector('footer').textContent,/39\.39 acres/);assert.match(doc.querySelector('footer').textContent,/Sizing under review/);checks+=2; }
 if(route==='about'){
   for(const name of ['Syed Hussain','Yasir J.','Muhammad Siddiqui','Ryan','Javed Iqbal, PhD','Shahb Kazmi','Ali Askara','Ken','Daniel']){assert.ok(doc.querySelector('#people').parentElement.textContent.includes(name),`Missing supplied team member ${name}`);checks++;}
   assert.equal(doc.querySelectorAll('.team-card').length,9);checks++;
 }
 if(route==='site'){assert.match(doc.body.textContent,/SEC 33-6S-8E E2E2NW LESS \.61ACS \(958-895\) FOR HWY/);assert.match(doc.body.textContent,/5,035/);checks+=2;}
 if(route==='compute'){assert.match(doc.body.textContent,/B300/);assert.match(doc.body.textContent,/RTX.only/i);checks+=2;}
 if(route==='contact'||route===''){
   assert.equal(doc.querySelector('form[id^="reserve-"]').action,'https://formsubmit.co/yasir@futonix.com');checks++;
 }
 if(route===''){
   for(const img of doc.querySelectorAll('#loader img')){await stat(join(root,img.getAttribute('src')));checks++;}
   assert.ok(doc.querySelector('[data-journey-cue] [role="progressbar"][aria-label]'));checks++;
   assert.match(doc.querySelector('#loader').textContent,/Entering automatically/);checks++;
 }
 if(route==='brand'){
   const kit=JSON.parse(await readFile('src/data/brand-kit.json','utf8'));
   const expected=kit.files.filter(f=>/\.(png|jpe?g|svg|gif|ico|mp4|webm)$/i.test(f.path));
   const cards=[...doc.querySelectorAll('[data-brand-asset]')];
   assert.equal(cards.length,expected.length);checks++;
   assert.equal(doc.querySelectorAll('[data-file-row]').length,kit.files.length);checks++;
   assert.deepEqual(cards.map(c=>c.querySelector('[data-open-preview]').getAttribute('href')).sort(),expected.map(f=>'/brand-kit/'+f.path).sort());checks++;
   for(const img of doc.querySelectorAll('.brand-studio img')){
     assert.ok(img.alt.trim(),'Brand artwork needs an accessible label');
     await stat(join(root,img.getAttribute('src')));checks+=2;
   }
   assert.ok(doc.querySelector('#brand-viewer[aria-labelledby="brand-viewer-title"]'));checks++;
   assert.equal(doc.querySelectorAll('video[autoplay]').length,0);checks++;
 }
 dom.window.close();
}
for(const path of targets){
 const file=join(root,path);let info;
 try{info=await stat(file);}catch{assert.fail(`Broken internal link: ${path}`);}
 if(info.isDirectory())await stat(join(file,'index.html'));
 checks++;
}
const sitemap=await readFile(join(root,'sitemap-index.xml'),'utf8');
assert.match(sitemap,/http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9/);
assert.doesNotMatch(sitemap,/investors|brand/);
for(const route of routes.filter(r=>r!=='brand'))assert.ok(sitemap.includes(`https://www.smarttec.dev/${route}</loc>`));
checks+=11;
console.log(`PASS: ${checks} QA checks across ${routes.length} public pages and ${targets.size} distinct internal links/downloads.`);
