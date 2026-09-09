import {randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash,createHmac} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
export const COOKIE='__Host-smarttec-investor';
export const TTL=3600;
const digest=x=>createHash('sha256').update(x).digest('hex');
export const randomToken=()=>randomBytes(32).toString('hex');
export async function hashPassword(password){const salt=randomBytes(16).toString('hex');return `scrypt$${salt}$${(await scrypt(password,salt,64)).toString('hex')}`;}
export async function verifyPassword(password,hash){if(typeof password!=='string'||Buffer.byteLength(password)>256||!/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(hash||''))return false;const [,salt,value]=hash.split('$');return timingSafeEqual(await scrypt(password,salt,64),Buffer.from(value,'hex'));}
// LOCAL CHANGE — carry this forward on any module upgrade.
// Vercel's Upstash integration injects the REST pair as KV_REST_API_URL and
// KV_REST_API_TOKEN. Reading those as a fallback keeps one copy of the
// credential, owned by the integration, rather than a second hand-copied one
// that goes stale the moment the token is rotated. UPSTASH_* still wins if set.
export function config(overrides){const e=overrides||{...import.meta.env,...process.env};const origin=e.INVESTOR_ORIGIN;const hash=e.INVESTOR_PASSWORD_HASH;const key=e.INVESTOR_SESSION_SECRET;const local=e.INVESTOR_LOCAL_HTTP==='1'&&!e.VERCEL&&/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin||'');if(!origin||new URL(origin).origin!==origin||(!origin.startsWith('https://')&&!local)||!/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(hash||'')||Buffer.byteLength(key||'')<32)throw new Error('Investor access configuration incomplete');return {origin,hash,key,local,mapKey:e.INVESTOR_MAPTILER_KEY||'',epoch:digest(hash+key),redisUrl:e.UPSTASH_REDIS_REST_URL||e.KV_REST_API_URL,redisToken:e.UPSTASH_REDIS_REST_TOKEN||e.KV_REST_API_TOKEN,vercel:e.VERCEL==='1'};}
export class RedisStore{
 constructor(cfg,fetcher=fetch){this.cfg=cfg;this.fetcher=fetcher;if(!cfg.redisUrl?.startsWith('https://')||!cfg.redisToken)throw new Error('Durable session store is not configured');}
 async command(...args){const r=await this.fetcher(this.cfg.redisUrl,{method:'POST',headers:{Authorization:`Bearer ${this.cfg.redisToken}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(5000),redirect:'error'});if(!r.ok)throw new Error('Session service unavailable');const x=await r.json();if(x.error)throw new Error('Session service unavailable');return x.result;}
 async get(k){const x=await this.command('GET',k);return x?JSON.parse(x):null;}
 async set(k,v,ttl){await this.command('SET',k,JSON.stringify(v),'EX',ttl);}
 async delete(k){await this.command('DEL',k);}
 async increment(k,seconds){return this.command('EVAL',"local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n",1,k,seconds);}
}
export function sign(id,key){return `${id}.${createHmac('sha256',key).update(id).digest('hex')}`;}
function signedId(cookie,key){if(!/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(cookie||''))return null;const [id,mac]=cookie.split('.');return timingSafeEqual(Buffer.from(mac,'hex'),Buffer.from(sign(id,key).split('.')[1],'hex'))?id:null;}
const sessionKey=id=>'st:investor:session:'+digest(id);
export function cookieName(cfg){return cfg.local?'smarttec-investor-local':COOKIE;}
export function readCookie(request,name){const a=request.headers.get('cookie')||'';return a.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);}
export function cookieHeader(cfg,value,maxAge=TTL){return `${cookieName(cfg)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${cfg.local?'':'; Secure'}`;}
export async function createSession(store,cfg,now=Date.now()){const id=randomToken();const session={csrf:randomToken(),expires:now+TTL*1000,epoch:cfg.epoch};await store.set(sessionKey(id),session,TTL);return {cookie:sign(id,cfg.key),session};}
export async function authenticate(request,store,cfg,now=Date.now()){const id=signedId(readCookie(request,cookieName(cfg)),cfg.key);if(!id)return null;const session=await store.get(sessionKey(id));if(!session||session.expires<=now||session.epoch!==cfg.epoch)return null;return {...session,id};}
export async function revoke(store,session){if(session)await store.delete(sessionKey(session.id));}
export function sameOrigin(request,cfg){return request.headers.get('origin')===cfg.origin&&(!request.headers.get('sec-fetch-site')||request.headers.get('sec-fetch-site')==='same-origin');}
export function csrfValid(request,session){const s=request.headers.get('x-csrf-token');return typeof s==='string'&&/^[0-9a-f]{64}$/.test(s)&&timingSafeEqual(Buffer.from(s),Buffer.from(session.csrf));}
export function clientKey(request,cfg){const ip=cfg.vercel?request.headers.get('x-vercel-forwarded-for'):cfg.local?'loopback':null;if(!ip||ip.length>160)throw new Error('Trusted client address unavailable');return digest(ip);}
export async function loginLimit(request,store,cfg){const key=clientKey(request,cfg);const n=await store.increment('st:investor:login:'+key,900);const global=await store.increment('st:investor:login:all',900);return n<=5&&global<=120;}
export async function actionLimit(store,session){return (await store.increment('st:investor:action:'+digest(session.id),60))<=60;}
export const privateHeaders={'Cache-Control':'private, no-store, max-age=0','CDN-Cache-Control':'no-store','Vercel-CDN-Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://api.maptiler.com; font-src 'self'; connect-src 'self' https://api.maptiler.com; worker-src 'self' blob:; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'"};
export function json(data,status=200,extra={}){return new Response(JSON.stringify(data),{status,headers:{...privateHeaders,'Content-Type':'application/json; charset=utf-8',...extra}});}
export async function readJson(request,limit=180000){if(!(request.headers.get('content-type')||'').startsWith('application/json'))throw new Error('JSON required');if(Number(request.headers.get('content-length'))>limit)throw new Error('Request too large');const reader=request.body?.getReader();if(!reader)throw new Error('JSON required');let bytes=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>limit){await reader.cancel();throw new Error('Request too large');}chunks.push(value);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
export async function pageAccess(request){try{const cfg=config(),store=new RedisStore(cfg),session=await authenticate(request,store,cfg);return {cfg,store,session,error:null};}catch{return {session:null,error:'Private access is temporarily unavailable.'};}}
