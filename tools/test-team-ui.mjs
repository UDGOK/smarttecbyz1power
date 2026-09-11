import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import team from '../src/data/team.json' with {type:'json'};
const origin=process.argv[2]||'http://127.0.0.1:4333';
await mkdir('tmp/team-review',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const width of [1440,960,390,320]){
    await page.setViewportSize({width,height:950});await page.goto(origin+'/about#people');
    const section=page.locator('[data-team-section]');await section.waitFor();
    await page.locator('#people').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('[data-team-section]').classList.contains('is-motion-active'));
    for(const person of team){
      const card=page.locator(`[data-person="${person.id}"]`);await card.scrollIntoViewIfNeeded();
      assert.equal(await card.locator('h3').textContent(),person.name);
      assert.equal(await card.locator('.team-email').count(),person.email?1:0);
      if(person.email)assert.equal(await card.locator('.team-email').getAttribute('href'),'mailto:'+person.email);
      assert.equal(await card.locator('.team-linkedin').count(),person.linkedin?1:0);
      if(person.linkedin){assert.equal(await card.locator('.team-linkedin').getAttribute('href'),person.linkedin);assert.match(await card.locator('.team-linkedin').getAttribute('rel'),/noopener/);}
    }
    await page.waitForTimeout(900);
    const layout=await page.locator('.team-card').evaluateAll(cards=>cards.map(card=>{
      const rect=card.getBoundingClientRect(),contact=card.querySelector('.team-contact').getBoundingClientRect();
      return{x:rect.x,y:rect.y,width:rect.width,height:rect.height,contactY:contact.y,overflow:card.scrollWidth>card.clientWidth+1};
    }));
    assert.ok(layout.every(r=>!r.overflow&&r.x>=0&&r.x+r.width<=width+1),'Cards and contact text must fit');
    if(width>620)for(const row of layout){const peers=layout.filter(r=>Math.abs(r.y-row.y)<2);assert.ok(peers.every(r=>Math.abs(r.contactY-row.contactY)<2),'Email rows align across each grid row');}
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.locator('#people').scrollIntoViewIfNeeded();await page.waitForTimeout(250);
    if(width===1440)await section.screenshot({path:'tmp/team-review/team-1440.png'});
    if(width===390)await page.screenshot({path:'tmp/team-review/team-390.png'});
  }
  await page.setViewportSize({width:1440,height:1000});await page.locator('#people').scrollIntoViewIfNeeded();
  const toggle=page.locator('.team-motion');await toggle.click();assert.equal(await toggle.getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-team-section]').evaluate(el=>el.classList.contains('is-motion-active')),false);
  assert.equal(await page.locator('.team-monogram').first().evaluate(el=>getComputedStyle(el,'::before').animationPlayState),'paused');
  await toggle.click();assert.equal(await toggle.getAttribute('aria-pressed'),'false');
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await toggle.isVisible(),false);
  assert.equal(await page.locator('.team-monogram').first().evaluate(el=>getComputedStyle(el,'::before').animationName),'none');
  assert.equal(await page.locator('[data-team-section]').evaluate(el=>el.classList.contains('is-motion-active')),false);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(300);
  assert.equal(await page.locator('[data-team-section]').evaluate(el=>el.classList.contains('is-motion-active')),false,'Offscreen animation stops');
  await page.setViewportSize({width:390,height:950});await page.emulateMedia({reducedMotion:'reduce'});
  await page.addStyleTag({content:'html{font-size:200%!important}'});await page.locator('#people').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Enlarged text must not cause page overflow');
  const plain=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}}),nojs=await plain.newPage();await nojs.goto(origin+'/about#people');
  assert.equal(await nojs.locator('.team-email').count(),8);assert.equal(await nojs.locator('.team-motion').isVisible(),false);assert.equal(await nojs.locator('[data-person="shahab"] h3').isVisible(),true);
  await plain.close();assert.deepEqual(errors,[]);console.log('PASS: team names/contacts, aligned rows at1440/960/390/320, pause/reduced/offscreen motion, enlarged text and no-JS content.');
}finally{await browser.close();}
