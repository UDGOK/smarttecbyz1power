import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {loadTS} from './helpers/load-ts.mjs';

const data=loadTS('src/data/brand-library.ts');
const {visuals,files,marks,variants,categories}=data;
function fixture(t){
  const dom=new JSDOM(`<main class="brand-studio">
    <div data-library-tools hidden></div><input id="brand-search"><select id="brand-format"><option>all</option>${['SVG','PNG','GIF','MP4','WEBM'].map(f=>`<option>${f}</option>`)}</select>
    ${categories.map(c=>`<button data-brand-category="${c.id}"></button>`).join('')}
    <button data-library-reset></button><p data-library-count></p><div data-library-empty hidden></div>
    ${visuals.map((v,i)=>`<article data-brand-asset data-category="${v.category}" data-format="${v.format}" data-search="${(v.title+' '+v.path+' '+v.category).toLowerCase()}"><a href="${v.url}" data-open-preview="${i}">Preview</a></article>`).join('')}
    <label data-file-search-label hidden></label><input id="brand-file-search"><p data-file-count></p>
    ${files.map(f=>`<div data-file-row data-search="${f.path.toLowerCase()}"></div>`).join('')}
    <div data-logo-studio>${marks.map((m,i)=>`<input type="radio" name="brand-mark" value="${m.id}" ${i?'':'checked'}>`).join('')}${variants.map((v,i)=>`<input type="radio" name="brand-variant" value="${v.id}" ${i?'':'checked'}>`).join('')}</div>
    <img data-logo-image><div data-logo-surface></div><p data-logo-label></p><p data-logo-ground></p><p data-logo-note></p><div data-logo-downloads></div>
    <button data-copy-colour="#1C4839"><b data-colour-hex>#1C4839</b></button><p data-copy-status></p>
    <video id="brand-hero-video"></video><button data-hero-play hidden></button>
    </main><dialog id="brand-viewer"><button data-viewer-close>Close</button><div data-viewer-stage></div><h2 id="brand-viewer-title"></h2><p data-viewer-note></p><p data-viewer-file></p><a data-viewer-download></a><div data-viewer-related></div><p data-viewer-position></p><button data-viewer-prev></button><button data-viewer-next></button><select data-viewer-background>${['auto','dark','light','checker'].map(v=>`<option>${v}</option>`)}</select></dialog>`,{url:'https://www.smarttec.dev/brand'});
  t.after(()=>dom.window.close());
  const {window}=dom,doc=window.document,$=s=>doc.querySelector(s);
  window.HTMLMediaElement.prototype.pause=function(){this.dataset.paused='true'};
  window.HTMLMediaElement.prototype.load=function(){};
  const dialog=$('#brand-viewer');
  dialog.showModal=()=>{dialog.open=true};
  dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new window.Event('close'))};
  const copied=[];
  loadTS('src/lib/brand-library.ts',{document:doc,window,navigator:{clipboard:{writeText:async value=>{copied.push(value)}}}}).initBrandLibrary();
  const change=(selector,value,event='input')=>{const el=$(selector);el.value=value;el.dispatchEvent(new window.Event(event,{bubbles:true}));};
  const shown=()=>[...doc.querySelectorAll('[data-brand-asset]')].filter(e=>!e.hidden);
  const open=index=>$(`[data-open-preview="${index}"]`).click();
  return {window,doc,$,dialog,change,shown,open,copied};
}

test('every original visual is represented, with existing media and related stitch downloads',()=>{
  const manifest=JSON.parse(readFileSync('src/data/brand-kit.json','utf8'));
  assert.equal(files.length,146);
  assert.equal(visuals.length,90);
  assert.deepEqual(visuals.map(v=>v.path).sort(),manifest.files.filter(f=>/\.(png|jpe?g|svg|gif|ico|mp4|webm)$/i.test(f.path)).map(f=>f.path).sort());
  for(const v of visuals){
    assert.ok(existsSync('SmartTec-Brand-Kit/'+v.path),v.path);
    if(v.kind!=='image')assert.ok(existsSync('SmartTec-Brand-Kit/'+v.poster.replace('/brand-kit/','')),v.poster);
    if(v.path.includes('stitch-preview')){assert.equal(v.related.length,1);assert.ok(existsSync('SmartTec-Brand-Kit/'+v.related[0].path));}
  }
});
test('category, search and format intersect; empty state and reset recover the entire library',t=>{
  const {$,change,shown}=fixture(t);
  $('[data-brand-category="social"]').click();assert.equal(shown().length,7);
  change('#brand-search','story');assert.equal(shown().length,2);
  change('#brand-format','PNG','change');assert.equal(shown().length,1);
  change('#brand-search','missing design');assert.equal(shown().length,0);assert.equal($('[data-library-empty]').hidden,false);
  $('[data-library-reset]').click();assert.equal(shown().length,90);assert.equal($('[data-library-empty]').hidden,true);
  assert.equal($('[data-brand-category="all"]').getAttribute('aria-pressed'),'true');
});
test('all twelve logo combinations provide the matching original SVG, PNG and EPS',t=>{
  const {$,window,doc}=fixture(t);
  for(const mark of marks)for(const variant of variants){
    for(const [name,value] of [['brand-mark',mark.id],['brand-variant',variant.id]]){
      const input=$(`input[name="${name}"][value="${value}"]`);input.checked=true;input.dispatchEvent(new window.Event('change',{bubbles:true}));
    }
    assert.equal($('[data-logo-surface]').dataset.logoSurface,variant.surface);
    assert.ok($('[data-logo-image]').src.endsWith(`smarttec-${mark.id}-${variant.id}.svg`));
    const links=[...doc.querySelectorAll('[data-logo-downloads] a')];assert.equal(links.length,3);
    for(const link of links){assert.ok(link.href.includes(`smarttec-${mark.id}-${variant.id}`));assert.ok(existsSync('SmartTec-Brand-Kit/'+new URL(link.href).pathname.replace('/brand-kit/','')));}
  }
});
test('viewer navigates filtered results, honours background, stops media and restores focus',t=>{
  const {$,change,open,dialog,window,doc}=fixture(t);
  $('[data-brand-category="social"]').click();change('#brand-search','story');
  const index=visuals.findIndex(v=>v.path.endsWith('smarttec-story-1080x1920.png'));
  open(index);assert.equal(dialog.open,true);assert.equal(doc.activeElement,$('[data-viewer-close]'));
  assert.equal($('[data-viewer-position]').textContent,'1 / 2');
  change('[data-viewer-background]','checker','change');assert.equal($('[data-viewer-stage]').dataset.surface,'checker');
  dialog.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  const video=$('[data-viewer-stage] video');assert.ok(video);assert.equal(video.autoplay,false);assert.equal(video.controls,true);
  $('[data-viewer-close]').click();assert.equal(video.dataset.paused,'true');assert.equal(video.hasAttribute('src'),false);assert.equal($('[data-viewer-stage]').children.length,0);
  assert.equal(doc.activeElement,$(`[data-open-preview="${index}"]`));assert.equal(doc.documentElement.classList.contains('brand-viewer-open'),false);
});
test('GIF playback is explicit and PES drafts remain paired with their stitch image',t=>{
  const {$,open}=fixture(t);
  const gif=visuals.findIndex(v=>v.kind==='gif');open(gif);
  assert.ok($('[data-viewer-stage] img').src.endsWith(visuals[gif].poster));
  $('.brand-gif-toggle').click();assert.ok($('[data-viewer-stage] img').src.endsWith(visuals[gif].url));
  $('.brand-gif-toggle').click();assert.equal($('.brand-gif-toggle').getAttribute('aria-pressed'),'false');
  $('[data-viewer-close]').click();
  const stitch=visuals.findIndex(v=>v.related.length);open(stitch);
  assert.ok($('[data-viewer-related] a').href.endsWith(visuals[stitch].related[0].url));
  assert.match($('[data-viewer-note]').textContent,/test sew-out/);
});
test('original-file search includes nonvisual formats and colours report successful copying',async t=>{
  const {$,doc,change,copied}=fixture(t);
  change('#brand-file-search','.pes');
  assert.equal([...doc.querySelectorAll('[data-file-row]')].filter(e=>!e.hidden).length,files.filter(f=>f.format==='PES').length);
  change('#brand-file-search','does-not-exist');assert.match($('[data-file-count]').textContent,/No matching files/);
  $('[data-copy-colour]').click();await Promise.resolve();
  assert.deepEqual(copied,['#1C4839']);assert.match($('[data-copy-status]').textContent,/copied/);
});
