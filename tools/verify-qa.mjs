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
 if(route==='contact'||route===''){
   assert.equal(doc.querySelector('form[id^="reserve-"]').action,'https://formsubmit.co/yasir@futonix.com');checks++;
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
