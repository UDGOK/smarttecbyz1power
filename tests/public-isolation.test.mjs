import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const investorClient=readFileSync('src/smarttec-investor/client/app.mjs','utf8');

test('shared-chunk evaluation on public pages never starts an investor session request',async()=>{
  for(const path of ['/','/site','/power','/compute','/colocation','/model-planner','/about','/contact','/news','/brand']){
    const dom=new JSDOM('<main id="main"><h1>Public content</h1></main><dialog id="site-menu"></dialog>',{url:'https://www.smarttec.dev'+path,runScripts:'outside-only'});
    const requests=[];
    dom.window.fetch=async url=>{requests.push(String(url));return {ok:false,status:503,json:async()=>({error:'Private access is not configured.'})};};
    dom.window.eval(investorClient);
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(requests,[],`${path}: public navigation must not bootstrap the protected room`);
    assert.equal(dom.window.document.querySelector('h1').textContent,'Public content');
    dom.window.close();
  }
});
