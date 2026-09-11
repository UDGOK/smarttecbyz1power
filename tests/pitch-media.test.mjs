import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {config,createSession,privateHeaders} from '../src/smarttec-investor/server/auth.mjs';
import {handle} from '../src/smarttec-investor/server/handlers.mjs';
import {pitchMedia} from '../src/smarttec-investor/server/pitch-media.mjs';
import {buildPitchMedia,pitchAssetSpecs} from '../tools/build-pitch-media.mjs';

class Store{
  data=new Map();
  async get(key){return this.data.get(key)||null;}
  async set(key,value){this.data.set(key,value);}
}
const cfg=config({INVESTOR_ORIGIN:'https://www.smarttec.dev',INVESTOR_PASSWORD_HASH:`scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`,INVESTOR_SESSION_SECRET:'pitch-test-session-secret-'.repeat(3),VERCEL:'1'});
const request=(action,{method='GET',cookie,range,ifRange}={})=>new Request(`${cfg.origin}/api/investor/${action}`,{method,headers:{...(cookie?{cookie}:{}),...(range!==undefined?{range}:{}),...(ifRange!==undefined?{'if-range':ifRange}:{})}});
async function signed(){const store=new Store();const {cookie}=await createSession(store,cfg);return {store,cookie:`__Host-smarttec-investor=${cookie}`};}
function secure(response){
  for(const header of ['Cache-Control','CDN-Cache-Control','Vercel-CDN-Cache-Control','X-Robots-Tag','X-Content-Type-Options'])assert.equal(response.headers.get(header),privateHeaders[header]);
}

test('all seven protected media assets are present, reproducible and below response limits',async()=>{
  assert.equal(Object.keys(pitchMedia).length,7,'Generate the final media before shipping; empty registries are forbidden');
  await buildPitchMedia({check:true});
  for(const spec of pitchAssetSpecs){
    const asset=pitchMedia[spec.action];assert.ok(asset,spec.action);
    const bytes=readFileSync(`src/smarttec-investor/media/pitch/${spec.filename}`);
    assert.deepEqual(Buffer.from(asset.base64,'base64'),bytes);
    assert.equal(asset.sha256,createHash('sha256').update(bytes).digest('hex'));
    assert.equal(asset.bytes,bytes.length);assert.ok(bytes.length>32&&bytes.length<=2_000_000);
    for(const path of [`public/${spec.filename}`,`public/pitch/${spec.filename}`,`public/media/pitch/${spec.filename}`])assert.equal(existsSync(path),false,`Private media must not be staged at ${path}`);
  }
});

test('anonymous media requests reveal no asset bytes or range metadata',async()=>{
  for(const {action} of pitchAssetSpecs)for(const method of ['GET','HEAD','POST','OPTIONS']){
    const response=await handle(request(action,{method,range:'bytes=0-31'}),action,{cfg,store:new Store()});
    assert.equal(response.status,401,`${action} ${method}`);secure(response);
    assert.equal(response.headers.get('content-range'),null);
    assert.equal(response.headers.get('accept-ranges'),null);
    assert.match(response.headers.get('content-type'),/application\/json/);
  }
});

test('authenticated GET and HEAD deliver correct protected media metadata and bytes',async()=>{
  const {store,cookie}=await signed();
  for(const {action,mime} of pitchAssetSpecs){
    const asset=pitchMedia[action];assert.ok(asset,action);
    const full=await handle(request(action,{cookie}),action,{cfg,store});
    assert.equal(full.status,200);secure(full);
    assert.equal(full.headers.get('content-type'),mime);
    assert.equal(full.headers.get('accept-ranges'),'bytes');
    assert.equal(full.headers.get('content-length'),String(asset.bytes));
    assert.equal(full.headers.get('cross-origin-resource-policy'),'same-origin');
    assert.equal(full.headers.get('access-control-allow-origin'),null);
    assert.deepEqual(Buffer.from(await full.arrayBuffer()),Buffer.from(asset.base64,'base64'));
    const head=await handle(request(action,{cookie,method:'HEAD',range:'bytes=0-31'}),action,{cfg,store});
    assert.equal(head.status,200);secure(head);
    assert.equal(head.headers.get('content-length'),String(asset.bytes));
    assert.equal(head.headers.get('content-range'),null);
    assert.equal((await head.arrayBuffer()).byteLength,0);
  }
});

test('video seeking supports bounded, open, suffix and clamped single byte ranges',async()=>{
  const {store,cookie}=await signed();
  for(const action of ['pitch-fiber-video','pitch-compute-video','pitch-campus-video']){
    const asset=pitchMedia[action];assert.ok(asset,action);
    const bytes=Buffer.from(asset.base64,'base64'),size=bytes.length;
    for(const [range,start,end] of [['bytes=0-31',0,31],[`bytes=${size-32}-`,size-32,size-1],['bytes=-32',size-32,size-1],[`bytes=${size-16}-${size+20}`,size-16,size-1],[`bytes=-${size+1}`,0,size-1]]){
      const response=await handle(request(action,{cookie,range}),action,{cfg,store});
      assert.equal(response.status,206,range);secure(response);
      assert.equal(response.headers.get('content-range'),`bytes ${start}-${end}/${size}`);
      assert.equal(response.headers.get('content-length'),String(end-start+1));
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes.subarray(start,end+1));
    }
  }
});

test('malformed, multipart, reversed, overflowing and unsatisfiable ranges return 416',async()=>{
  const {store,cookie}=await signed(),action='pitch-fiber-video';
  const size=pitchMedia[action]?.bytes;assert.ok(size);
  for(const range of ['bytes=','bytes=-','bytes=-0','bytes=8-2','bytes=0-1,4-5','bytes=1.5-9','bytes=0-9007199254740992','bytes=9007199254740992-',`bytes=${size}-`,`bytes=${size+1}-${size+2}`]){
    const response=await handle(request(action,{cookie,range}),action,{cfg,store});
    assert.equal(response.status,416,range);secure(response);
    assert.equal(response.headers.get('content-range'),`bytes */${size}`);
    assert.equal(response.headers.get('content-length'),'0');
    assert.equal((await response.arrayBuffer()).byteLength,0);
  }
});

test('If-Range prevents combining segments from different media versions',async()=>{
  const {store,cookie}=await signed(),action='pitch-fiber-video',asset=pitchMedia[action];assert.ok(asset);
  const matched=await handle(request(action,{cookie,range:'bytes=0-31',ifRange:`"${asset.sha256}"`}),action,{cfg,store});
  assert.equal(matched.status,206);
  for(const ifRange of ['"old-version"',`W/"${asset.sha256}"`,'Wed, 10 Sep 2025 00:00:00 GMT']){
    const response=await handle(request(action,{cookie,range:'bytes=0-31',ifRange}),action,{cfg,store});
    assert.equal(response.status,200);assert.equal(response.headers.get('content-range'),null);
    assert.equal((await response.arrayBuffer()).byteLength,asset.bytes);
  }
  const unknownUnit=await handle(request(action,{cookie,range:'items=0-1'}),action,{cfg,store});
  assert.equal(unknownUnit.status,200);assert.equal((await unknownUnit.arrayBuffer()).byteLength,asset.bytes);
});

test('media methods are read-only, unknown names do not resolve paths and expired sessions fail closed',async()=>{
  const {store,cookie}=await signed(),action='pitch-fiber-video';
  for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS']){
    const response=await handle(request(action,{cookie,method}),action,{cfg,store});
    assert.equal(response.status,405);assert.equal(response.headers.get('allow'),'GET, HEAD');secure(response);
  }
  for(const unknown of ['pitch-unknown-video','pitch-../../server/auth.mjs','pitch-__proto__'])assert.equal((await handle(request(unknown,{cookie}),unknown,{cfg,store})).status,404);
  for(const value of store.data.values())value.expires=0;
  assert.equal((await handle(request(action,{cookie,range:'bytes=0-31'}),action,{cfg,store})).status,401);
});

test('the private CSP permits same-origin media without granting remote playback access',()=>{
  const policy=privateHeaders['Content-Security-Policy'];
  const media=policy.split(';').map(part=>part.trim()).find(part=>part.startsWith('media-src '));
  assert.equal(media||policy.split(';')[0],media?"media-src 'self'":"default-src 'self'");
});
