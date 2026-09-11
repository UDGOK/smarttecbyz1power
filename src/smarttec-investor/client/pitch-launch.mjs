export function initPitchLauncher(doc=document,win=window){
  const dialog=doc.getElementById('investor-pitch-dialog');if(!dialog||dialog.dataset.mounted)return;dialog.dataset.mounted='true';
  const shell=dialog.querySelector('.pitch-frame-shell'),frame=dialog.querySelector('iframe'),closeButton=doc.getElementById('investor-pitch-close'),loading=doc.getElementById('investor-pitch-loading');let opener=null,loadingTimer=0,launchRevision=0;
  const tell=type=>{try{frame.contentWindow?.postMessage({type},win.location.origin);}catch{}};
  function close(){if(dialog.open)dialog.close();}
  function clean(){
    const revision=launchRevision,previousOpener=opener;
    const restoreFocus=()=>{if(!dialog.open&&revision===launchRevision)previousOpener?.focus();};
    tell('smarttec:pitch-stop');frame.removeAttribute('src');win.clearTimeout(loadingTimer);doc.documentElement.classList.remove('pitch-is-open');win.dispatchEvent(new win.CustomEvent('smarttec:menu-change',{detail:{open:false}}));
    // The browser may move focus while leaving fullscreen; restore it after that transition.
    if(doc.fullscreenElement===shell&&doc.exitFullscreen){try{Promise.resolve(doc.exitFullscreen()).then(restoreFocus,restoreFocus);return;}catch{}}
    restoreFocus();
  }
  doc.querySelectorAll('[data-pitch-launch]').forEach(link=>link.addEventListener('click',event=>{
    if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||!dialog.showModal)return;
    event.preventDefault();launchRevision++;opener=link;loading.hidden=false;loading.textContent='Preparing the SmartTec presentation…';dialog.showModal();doc.documentElement.classList.add('pitch-is-open');win.dispatchEvent(new win.CustomEvent('smarttec:menu-change',{detail:{open:true}}));
    // Fullscreen is requested synchronously from the link's user gesture on a div, never the dialog.
    try{shell.requestFullscreen?.({navigationUI:'hide'}).then(()=>{if(!dialog.open&&doc.fullscreenElement===shell)doc.exitFullscreen?.().catch(()=>{});}).catch(()=>{});}catch{}
    frame.src='/investors/pitch';closeButton.focus();
    loadingTimer=win.setTimeout(()=>{if(dialog.open&&!loading.hidden)loading.textContent='Still loading. You can close this view and reopen it, or use the standalone presentation link.';},15000);
  }));
  closeButton.addEventListener('click',close);dialog.addEventListener('close',clean);
  win.addEventListener('message',event=>{if(event.origin!==win.location.origin||event.source!==frame.contentWindow||!dialog.open)return;if(event.data?.type==='smarttec:pitch-close')close();if(event.data?.type==='smarttec:pitch-ready'){loading.hidden=true;win.clearTimeout(loadingTimer);frame.focus();}});
  doc.addEventListener('fullscreenchange',()=>{if(dialog.open)tell('smarttec:pitch-fullscreen');});
  win.addEventListener('pagehide',()=>{if(dialog.open)close();});
  return{close};
}
if(typeof document!=='undefined')initPitchLauncher();
