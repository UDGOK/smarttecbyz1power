// Optional real-browser checks, called by the compiled HTTP fixture with its local session.
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import sharp from 'sharp';
import deck from '../src/smarttec-investor/data/investor-deck.json' with {type:'json'};

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function testInvestorPdfUI({origin,cookie}){
  const browser=await chromium.launch({headless:true,channel:process.env.INVESTOR_QA_BROWSER||undefined});
  const output='tmp/pdf-reader',errors=[];let checks=0;
  const split=cookie.indexOf('='),auth={name:cookie.slice(0,split),value:cookie.slice(split+1),url:origin};
  const inlineURL=origin+'/api/investor/presentation?view=inline';
  const watch=page=>{
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error'&&/Content Security Policy|Refused to (?:frame|load|execute)/i.test(message.text()))errors.push(message.text());});
  };
  async function pdfPixels(page){
    const bytes=await page.locator('#pdf-frame').screenshot();
    const {data,info}=await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});
    let green=0,bright=0;
    for(let i=0;i<data.length;i+=info.channels){
      const [r,g,b]=[data[i],data[i+1],data[i+2]];
      if(g>r+12&&g>b+4&&g<220)green++;
      if(r>180&&g>180&&b>180)bright++;
    }
    const total=info.width*info.height;
    return {green:green/total,bright:bright/total,width:info.width,height:info.height};
  }
  async function renderedPDF(page){
    await page.locator('#pdf-frame').waitFor({state:'visible'});
    await page.waitForFunction(()=>document.querySelector('#pdf-frame').src.includes('/api/investor/presentation?view=inline'));
    let pixels;
    // A visible iframe can still be a blank native viewer or a CSP error document.
    // The actual first PDF page contains substantial forest artwork and off-white type.
    for(let attempt=0;attempt<32;attempt++){
      pixels=await pdfPixels(page);
      if(pixels.green>.06&&pixels.bright>.001)return pixels;
      await page.waitForTimeout(250);
    }
    await page.screenshot({path:output+'/failed-native-pdf.png'});
    assert.fail('Native PDF did not visibly render the branded cover: '+JSON.stringify(pixels));
  }
  async function fit(page,width,height){
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${width}: reader must not overflow horizontally`);
    for(const selector of ['.pdf-toolbar','.pdf-download','#pdf-fullscreen','.pdf-footer','#pdf-frame']){
      const box=await page.locator(selector).boundingBox();
      assert.ok(box&&box.x>=-1&&box.y>=-1&&box.x+box.width<=width+1&&box.y+box.height<=height+1,`${width}: ${selector} stays inside the viewport: ${JSON.stringify(box)}`);
    }
    assert.ok((await page.locator('#pdf-frame').boundingBox()).height>height*.5,'PDF receives most of the available height');
  }
  try{
    await mkdir(output,{recursive:true});
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true});
    await context.addCookies([auth]);
    const entry=await context.newPage();watch(entry);
    await entry.goto(origin+'/investors');
    const link=entry.locator('#investor-presentation a[href="/investors/presentation"]');
    assert.match(await link.textContent(),/Open investor presentation/);
    assert.equal(await link.getAttribute('target'),'_blank');
    assert.match(await link.getAttribute('rel'),/noopener/);
    const pdfResponses=[];
    context.on('response',response=>{if(response.url()===inlineURL&&response.request().method()==='GET')pdfResponses.push(response);});
    const newPage=context.waitForEvent('page');await link.click();const reader=await newPage;watch(reader);
    await reader.waitForURL(origin+'/investors/presentation');
    assert.equal(await reader.evaluate(()=>window.opener===null),true,'PDF tab must not retain an opener');
    assert.equal(new URL(entry.url()).pathname,'/investors','Original investor tab remains in place');checks++;
    const desktopPixels=await renderedPDF(reader);
    assert.ok(pdfResponses.length>0,'The iframe must request the actual authenticated PDF');
    const response=pdfResponses[0];assert.equal(response.status(),200);
    assert.equal(response.headers()['content-type'],'application/pdf');assert.match(response.headers()['content-disposition'],/^inline;/);
    await fit(reader,1440,1000);await reader.screenshot({path:output+'/reader-1440.png'});checks++;

    const nativeFullscreen=reader.locator('#pdf-fullscreen');
    assert.equal(await nativeFullscreen.isVisible(),true,'Desktop Chrome exposes native fullscreen');
    await nativeFullscreen.click();await reader.waitForFunction(()=>document.fullscreenElement===document.querySelector('#pdf-reader'));
    assert.equal(await nativeFullscreen.getAttribute('aria-pressed'),'true');
    await reader.screenshot({path:output+'/fullscreen-1440.png'});
    await nativeFullscreen.click();await reader.waitForFunction(()=>document.fullscreenElement===null);
    assert.equal(await nativeFullscreen.getAttribute('aria-pressed'),'false');checks++;
    await reader.evaluate(()=>{document.querySelector('#pdf-reader').requestFullscreen=()=>Promise.reject(new DOMException('Test denial','NotAllowedError'));});
    await nativeFullscreen.click();await reader.waitForFunction(()=>document.querySelector('#pdf-status').textContent.includes('Full screen is unavailable'));
    assert.equal(await reader.evaluate(()=>document.fullscreenElement),null);
    assert.equal(await reader.locator('.pdf-download').isVisible(),true);checks++;

    const downloaded=reader.waitForEvent('download');await reader.locator('.pdf-download').click();const download=await downloaded;
    assert.equal(download.suggestedFilename(),deck.filename);assert.equal(await download.failure(),null);
    const bytes=await readFile(await download.path());assert.equal(bytes.length,deck.bytes);assert.equal(sha(bytes),deck.sha256);checks++;

    await reader.reload();await renderedPDF(reader);
    await reader.setViewportSize({width:390,height:844});await reader.waitForTimeout(300);
    const mobilePixels=await renderedPDF(reader);await fit(reader,390,844);
    await reader.screenshot({path:output+'/reader-390.png'});checks++;
    const originalFrameSrc=await reader.locator('#pdf-frame').getAttribute('src');
    const rechecked=reader.waitForResponse(response=>response.url()===inlineURL&&response.request().method()==='HEAD');
    await reader.evaluate(()=>window.dispatchEvent(new Event('focus')));assert.equal((await rechecked).status(),200);
    assert.equal(await reader.locator('#pdf-frame').getAttribute('src'),originalFrameSrc,'Successful focus validation must not reload the PDF');checks++;
    await context.clearCookies();await reader.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await reader.waitForFunction(()=>document.querySelector('#pdf-loading').textContent.includes('session has ended'));
    assert.equal(await reader.locator('#pdf-frame').getAttribute('src'),null);assert.equal(await reader.locator('#pdf-frame').isVisible(),false);checks++;
    await reader.close();assert.equal(entry.isClosed(),false);checks++;
    await context.close();

    const recovery=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
    await recovery.addCookies([auth]);let deniedHead=false,earlyPDFGets=0,checkingDenied=true;
    recovery.on('request',request=>{if(checkingDenied&&request.url()===inlineURL&&request.method()==='GET')earlyPDFGets++;});
    await recovery.route(inlineURL,async route=>{
      if(route.request().method()==='HEAD'){
        // Expire browser credentials between authorized HTML and its preflight.
        deniedHead=true;await recovery.clearCookies();
        const requestHeaders=route.request().headers();delete requestHeaders.cookie;
        await route.continue({headers:requestHeaders});
      }else await route.continue();
    });
    const tab=await recovery.newPage();watch(tab);await tab.goto(origin+'/investors/presentation');
    await tab.waitForFunction(()=>document.querySelector('#pdf-loading').textContent.includes('session has ended'));
    assert.equal(deniedHead,true);assert.equal(earlyPDFGets,0);
    assert.equal(await tab.locator('#pdf-frame').isVisible(),false);assert.equal(await tab.locator('#pdf-frame').getAttribute('src'),null);
    const signIn=tab.locator('#pdf-loading a');assert.equal(await signIn.getAttribute('href'),'/investors/login#investor-presentation');
    await tab.screenshot({path:output+'/session-expired-390.png'});checks++;
    checkingDenied=false;await recovery.unroute(inlineURL);await signIn.click();await tab.waitForURL('**/investors/login#investor-presentation');
    await tab.locator('#password').fill('integration-password');await tab.locator('#inv-login button').click();
    await tab.waitForURL(url=>url.pathname==='/investors');
    await tab.goto(origin+'/investors/presentation');await renderedPDF(tab);checks++;

    await recovery.route(inlineURL,route=>route.request().method()==='HEAD'?route.fulfill({status:503,contentType:'application/json',body:'{"error":"fixture unavailable"}'}):route.continue());
    await tab.reload();await tab.waitForFunction(()=>document.querySelector('#pdf-loading').textContent.includes('could not be loaded'));
    assert.equal(await tab.locator('#pdf-frame').isVisible(),false);assert.equal(await tab.locator('#pdf-frame').getAttribute('src'),null);
    assert.equal(await tab.locator('.pdf-footer a').isVisible(),true);checks++;
    await recovery.unroute(inlineURL);await tab.getByRole('button',{name:'Try again',exact:true}).click();await renderedPDF(tab);checks++;
    await recovery.close();assert.deepEqual(errors,[],'PDF reader JavaScript and CSP errors');checks++;
    console.log(`PASS: native PDF cover rendered at desktop/mobile (${JSON.stringify({desktop:desktopPixels,mobile:mobilePixels})}); new tab, fullscreen, exact download and session recovery passed.`);
    return checks;
  }finally{await browser.close();}
}
