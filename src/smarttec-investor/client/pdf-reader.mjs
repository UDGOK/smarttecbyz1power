const shell=document.querySelector('#pdf-reader');
const frame=document.querySelector('#pdf-frame');
const loading=document.querySelector('#pdf-loading');
const status=document.querySelector('#pdf-status');
const fullscreen=document.querySelector('#pdf-fullscreen');

if(shell&&frame&&loading&&status&&fullscreen){
  loading.hidden=false;
  const syncFullscreen=()=>{
    const active=document.fullscreenElement===shell;
    fullscreen.textContent=active?'Exit full screen ⛶':'Full screen ⛶';
    fullscreen.setAttribute('aria-pressed',String(active));
  };
  if(document.fullscreenEnabled&&typeof shell.requestFullscreen==='function')fullscreen.hidden=false;
  fullscreen.addEventListener('click',async()=>{
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else await shell.requestFullscreen();
      status.textContent=document.fullscreenElement?'Press Esc or Exit full screen to return.':'Use the PDF controls to move between pages.';
    }catch{
      status.textContent='Full screen is unavailable here. The presentation remains open in this tab.';
    }
    syncFullscreen();
  });
  document.addEventListener('fullscreenchange',()=>{
    syncFullscreen();
    if(!document.fullscreenElement)status.textContent='Use the PDF controls to move between pages.';
  });

  // Revalidate access on return without resetting the reader's current PDF page.
  let pending=null;
  let expiryTimer;
  const clearPDF=()=>{frame.hidden=true;frame.removeAttribute('src');loading.hidden=false;};
  const loadPDF=async()=>{
    pending?.abort();
    const request=new AbortController();
    pending=request;
    try{
      const response=await fetch(frame.dataset.pdfUrl,{method:'HEAD',credentials:'same-origin',cache:'no-store',signal:request.signal});
      if(request.signal.aborted)return;
      if(response.status===401){
        clearPDF();
        loading.textContent='Your investor session has ended.';
        const login=document.createElement('a');
        login.href='/investors/login#investor-presentation';
        login.textContent='Sign in to reopen the presentation';
        login.style.color='#7be88a';
        loading.append(login);
        status.textContent='Sign in again to view or download the PDF.';
        return;
      }
      if(!response.ok||!response.headers.get('content-type')?.includes('application/pdf'))throw new Error('PDF unavailable');
      const expires=Number(response.headers.get('x-investor-session-expires'));
      if(Number.isFinite(expires)&&expires>Date.now()){
        frame.dataset.sessionExpires=String(expires);
        scheduleExpiry();
      }
      if(!frame.hasAttribute('src')){
        frame.src=frame.dataset.pdfUrl+'#view=FitH';
        status.textContent=document.fullscreenElement?'Press Esc or Exit full screen to return.':'Use the PDF controls to move between pages.';
      }
      frame.hidden=false;
      loading.hidden=true;
    }catch{
      if(request.signal.aborted)return;
      clearPDF();
      loading.textContent='The PDF could not be loaded.';
      const retry=document.createElement('button');
      retry.type='button';
      retry.textContent='Try again';
      retry.addEventListener('click',loadPDF,{once:true});
      loading.append(retry);
      status.textContent='Try again, or use the download and direct PDF links.';
    }finally{
      if(pending===request)pending=null;
    }
  };
  const scheduleExpiry=()=>{
    clearTimeout(expiryTimer);
    const remaining=Number(frame.dataset.sessionExpires)-Date.now();
    if(remaining>0)expiryTimer=setTimeout(loadPDF,remaining+100);
  };
  window.addEventListener('focus',loadPDF);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadPDF();});
  window.addEventListener('pagehide',()=>{pending?.abort();clearTimeout(expiryTimer);clearPDF();});
  window.addEventListener('pageshow',event=>{if(event.persisted){loadPDF();scheduleExpiry();}});
  loadPDF();
  scheduleExpiry();
}
