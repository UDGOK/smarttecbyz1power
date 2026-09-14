import {model} from '../financial-model.mjs';
import {config,RedisStore,authenticate,createSession,revoke,sameOrigin,csrfValid,loginLimit,actionLimit,verifyPassword,cookieHeader,json,readJson,privateHeaders} from './auth.mjs';
import {architectureAsset} from '../../smarttec-architecture/server/architecture-assets.mjs';
import {thermalAsset} from '../../smarttec-architecture/server/thermal-assets.mjs';
import {investorDeckBase64} from './investor-deck.mjs';
import {pitchMediaResponse} from './pitch-media-response.mjs';
import deckMetadata from '../data/investor-deck.json' with {type:'json'};
import {answerQuestion,faqList} from './faq.mjs';
export async function handle(request,action,dependencies={}){
 let cfg,store,session;
 try{cfg=dependencies.cfg||config();store=dependencies.store||new RedisStore(cfg);}catch{return json({error:'Private access is not configured.'},503);}
 try{
  if(action==='login'){
   if(request.method!=='POST')return json({error:'Method not allowed'},405,{Allow:'POST'});
   if(!sameOrigin(request,cfg))return json({error:'Origin rejected'},403);
   if(!await loginLimit(request,store,cfg))return json({error:'Too many attempts. Try again in 15 minutes.'},429,{'Retry-After':'900'});
   let body;try{body=await readJson(request,2048);}catch{return json({error:'Invalid request'},400);}
   if(!await verifyPassword(body.password,cfg.hash))return json({error:'Password not accepted.'},401);
   const created=await createSession(store,cfg);return json({ok:true,redirect:'/investors'},200,{'Set-Cookie':cookieHeader(cfg,created.cookie)});
  }
  session=await authenticate(request,store,cfg);
  if(!session)return json({error:'Sign in required.'},401);
  const pitchMedia= pitchMediaResponse(request,action);
  if(pitchMedia)return pitchMedia;
  if(request.method==='POST'){
   if(!sameOrigin(request,cfg)||!csrfValid(request,session))return json({error:'Request verification failed.'},403);
   if(!await actionLimit(store,session))return json({error:'Too many requests. Try again shortly.'},429);
  }
  const architecture=thermalAsset(action,request.method)||architectureAsset(action,request.method);
  if(architecture)return new Response(architecture.bytes,{headers:{...privateHeaders,'Content-Type':architecture.mime}});
  if(action==='logout'&&request.method==='POST'){await revoke(store,session);return json({ok:true},200,{'Set-Cookie':cookieHeader(cfg,'',0)});}
  if(action==='bootstrap'&&request.method==='GET')return json({csrf:session.csrf,model,faqs:faqList()});
   if(['underwriting-scenario','calculate','compare','price-floor','export'].includes(action))return json({error:'This historical calculator has been retired. Use the reviewed workbook selector scenarios in the investor room.',modelVersion:model.version,url:'/investors#returns'},410);
  if(action==='model'&&['GET','HEAD'].includes(request.method)){
    const headers={...privateHeaders,'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="SmartTec_Model_v6.1_1_Verified_Scenarios.json"'};
   return new Response(request.method==='HEAD'?null:JSON.stringify(model,null,2),{headers});
  }
  if(action==='presentation'&&['GET','HEAD'].includes(request.method)){
   const bytes=Buffer.from(investorDeckBase64,'base64');
   const inline=new URL(request.url).searchParams.get('view')==='inline';
   const headers={...privateHeaders,'Content-Type':'application/pdf','Content-Length':String(bytes.length),'Content-Disposition':`${inline?'inline':'attachment'}; filename="${deckMetadata.filename}"`};
   if(inline){headers['X-Investor-Session-Expires']=String(session.expires);headers['X-Frame-Options']='SAMEORIGIN';headers['Content-Security-Policy']=headers['Content-Security-Policy'].replace("frame-ancestors 'none'","frame-ancestors 'self'");}
   return new Response(request.method==='HEAD'?null:bytes,{headers});
  }
  if(action==='faq'&&request.method==='POST'){const b=await readJson(request,4096);return json(answerQuestion(b.question));}
  return json({error:'Route or method not supported.'},405);
 }catch(e){if(e.message?.includes('Session')||e.message?.includes('fetch')||e.name==='TimeoutError')return json({error:'Private access is temporarily unavailable.'},503);return json({error:e.message==='Trusted client address unavailable'?'Request cannot be verified.':String(e.message).slice(0,220)},400);}
}
