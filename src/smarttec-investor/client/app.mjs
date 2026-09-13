// The workbook snapshot is server-rendered. This enhances navigation only.
let boot;
const $=selector=>document.querySelector(selector);
const make=(tag,text)=>{const element=document.createElement(tag);element.textContent=text;return element;};
function status(text){const target=$('#inv-app-status');if(target)target.textContent=text;}
async function api(action,body){
 const response=await fetch('/api/investor/'+action,{credentials:'same-origin',method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':boot?.csrf||''},...(body===undefined?{}:{body:JSON.stringify(body)})});
 if(response.status===401){location.assign('/investors/login');throw new Error('Your session expired. Please sign in again.');}
 if(!response.ok){let message='The request could not be completed. Please try again.';try{message=(await response.json()).error||message;}catch{}throw new Error(message);}
 return response;
}
async function answer(event){
 event.preventDefault();const out=$('#inv-answer');out.replaceChildren(make('p','Searching the reviewed project records…'));
 try{const result=await(await api('faq',{question:$('#inv-question').value})).json();out.replaceChildren(make('p',result.answer));for(const fact of result.matches){const article=make('article','');article.className='inv-answer-item';article.append(make('h3',fact.question),make('p',fact.answer),make('small',fact.status+' · Reviewed '+fact.reviewedAt));for(const source of fact.sources){const label=make('p',source.title);label.className='inv-note';article.append(label);}out.append(article);}}catch(error){out.replaceChildren(make('p',error.message));}
}
function initMap(data){
 if(!$('#inv-campus-map'))return;let started=false;
 const start=()=>{if(started)return;started=true;import('./campus-map.mjs').then(module=>module.initCampusMap(data.mapData,data.mapConfig)).catch(()=>{$('#inv-map-status').textContent='Interactive map unavailable in this browser. Use the supplied survey below.';});};
 const reference=$('#sta-reference');if(!reference||reference.open)start();else reference.addEventListener('toggle',()=>{if(reference.open)start();});
}
function initSurvey(){
 let zoom=1;const image=$('#inv-survey-image'),box=$('#inv-survey');if(!image||!box)return;
 document.querySelectorAll('[data-survey]').forEach(button=>button.addEventListener('click',()=>{zoom=button.dataset.survey==='all'?1:Math.max(1,Math.min(4,zoom+(button.dataset.survey==='in'?.5:-.5)));image.style.width=zoom*100+'%';}));
 document.querySelectorAll('[data-tract]').forEach(button=>button.addEventListener('click',()=>{zoom=2;image.style.width='200%';const position={1:.09,2:.36,3:.55}[button.dataset.tract];requestAnimationFrame(()=>{box.scrollTop=image.clientHeight*position;box.scrollLeft=image.clientWidth*.07;});}));
}
async function init(){
 initSurvey();
 try{boot=await(await api('bootstrap')).json();
  $('#inv-question-form')?.addEventListener('submit',answer);
  const submit=$('#inv-question-form button');if(submit)submit.disabled=false;
  $('#inv-logout')?.addEventListener('click',async()=>{try{await api('logout',{});location.assign('/investors/login');}catch(error){status(error.message);}});
  initMap(boot);status('Model v'+boot.model.version+' · Reviewed scenarios and project records ready.');
 }catch(error){status(error.message);}
}
if(document.querySelector('#inv-main'))init();
