import {config,RedisStore,authenticate,createSession,revoke,sameOrigin,csrfValid,loginLimit,actionLimit,verifyPassword,cookieHeader,json,readJson,privateHeaders} from './auth.mjs';
import {architectureAsset} from '../../smarttec-architecture/server/architecture-assets.mjs';
import {calculateScenario,requiredRateForNPV} from '../roi-engine.mjs';
import {answerQuestion,faqList} from './faq.mjs';
import sample from '../data/illustrative-scenario.json' with {type:'json'};
import provenance from '../data/illustration-provenance.json' with {type:'json'};
import catalog from '../data/hardware_catalog.json' with {type:'json'};
import mapData from '../data/campus-map.json' with {type:'json'};
import {markedPdf} from './marked-assets.mjs';
import campus from '../data/campus.json' with {type:'json'};
import {surveyPdf,surveyImage} from './survey-assets.mjs';
function bounded(s){if(!s||!Array.isArray(s.rows)||s.rows.length>12||s.rows.some(r=>!Array.isArray(r.contracts)||r.contracts.length>12)||!Array.isArray(s.capexEvents)||s.capexEvents.length>60)throw new Error('Scenario exceeds supported bounds');return s;}
const csvCell=x=>'"'+String(x??'').replaceAll('"','""')+'"';
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
  if(request.method==='POST'){
   if(!sameOrigin(request,cfg)||!csrfValid(request,session))return json({error:'Request verification failed.'},403);
   if(!await actionLimit(store,session))return json({error:'Too many requests. Try again shortly.'},429);
  }
  const architecture=architectureAsset(action,request.method);
  if(architecture)return new Response(architecture.bytes,{headers:{...privateHeaders,'Content-Type':architecture.mime}});
  if(action==='logout'&&request.method==='POST'){await revoke(store,session);return json({ok:true},200,{'Set-Cookie':cookieHeader(cfg,'',0)});}
  if(action==='bootstrap'&&request.method==='GET')return json({csrf:session.csrf,sample,provenance,catalog,campus,mapData,mapConfig:{satelliteKey:cfg.mapKey||''},faqs:faqList()});
  if(action==='marked-survey'&&request.method==='GET')return new Response(Buffer.from(markedPdf,'base64'),{headers:{...privateHeaders,'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="SmartTec_Marked_Layout.pdf"'}});
  if(action==='survey'&&request.method==='GET')return new Response(Buffer.from(surveyPdf,'base64'),{headers:{...privateHeaders,'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="SmartTec_Boundary_Survey.pdf"'}});
  if(action==='survey-image'&&request.method==='GET')return new Response(Buffer.from(surveyImage,'base64'),{headers:{...privateHeaders,'Content-Type':'image/png'}});
  if(action==='faq'&&request.method==='POST'){const b=await readJson(request,4096);return json(answerQuestion(b.question));}
  if(action==='compare'&&request.method==='POST'){
   const b=await readJson(request);const base=bounded(b.scenario);calculateScenario(base);
   const matrix=[];for(const occupancyFactor of [.5,.75,1,1.1,1.25])for(const priceFactor of [.75,.9,1,1.1,1.25]){const s=structuredClone(base);s.rows.forEach(r=>r.contracts.forEach(c=>{c.paidOccupancy=Math.min(1,c.paidOccupancy*occupancyFactor);c.rate*=priceFactor;}));const r=calculateScenario(s);matrix.push({occupancyFactor,priceFactor,projectROI:r.project.totalROI,additionalEquity:r.equity.additionalContributions});}
   return json({matrix,basis:'Multipliers of entered paid occupancy and rate; occupancy capped at 100%. Other assumptions unchanged.'});
  }
  if(action==='price-floor'&&request.method==='POST'){
   const b=await readJson(request);const s=bounded(b.scenario);const row=s.rows[0];if(!row?.contracts?.length)return json({error:'First equipment row needs a revenue segment.'},400);
   return json({requiredRate:requiredRateForNPV(s,row.id,0),billing:row.contracts[0].billing,discountRate:s.annualDiscountRate,basis:'Changes the first revenue segment on the first row only; all other assumptions fixed. Project NPV target zero; not a market price or promised investor yield.'});
  }
  if(['calculate','export'].includes(action)&&request.method==='POST'){
   const b=await readJson(request);const scenario=bounded(b.scenario);const result=calculateScenario(scenario);
   if(action==='calculate')return json(result);
   const bundle={title:'SmartTec conditional investment scenario',generatedAt:new Date().toISOString(),scenario,result,disclosures:['Pre-tax scenario; no guaranteed return or engineering approval.','Property, manufacturing, solar and storage value/revenue excluded.','Price and occupancy inputs are assumptions unless separately evidenced.','Pro-rata investor results do not represent agreed legal terms.','All hardware is purchased at time zero; contract expiry and remaining debt matter.'],provenance:b.illustration===true?provenance:{status:'User-entered assumptions; not quote verified'}};
   if(b.format==='csv'){const keys=['month','billed','collectedNetFees','peakITkw','averageITkw','facilityKwh','energyCost','nonEnergyCost','operatingCash','capex','debtPayment','debtBalloon'];const lines=['SmartTec conditional monthly ledger; all assumptions in scenario JSON',keys.map(csvCell).join(','),...result.schedule.map(r=>keys.map(k=>csvCell(r[k])).join(','))];return new Response(lines.join('\r\n'),{headers:{...privateHeaders,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="SmartTec_monthly_ledger.csv"'}});}
   return json(bundle,200,{'Content-Disposition':'attachment; filename="SmartTec_investor_scenario.json"'});
  }
  return json({error:'Route or method not supported.'},405);
 }catch(e){if(e.message?.includes('Session')||e.message?.includes('fetch')||e.name==='TimeoutError')return json({error:'Private access is temporarily unavailable.'},503);return json({error:e.message==='Trusted client address unavailable'?'Request cannot be verified.':String(e.message).slice(0,220)},400);}
}
