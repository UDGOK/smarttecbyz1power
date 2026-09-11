import {createPitchScore} from './pitch-score.mjs';

// Audio consent is independent of slide autoplay and reduced-motion preferences.
export function mountPitchAudio(doc,win,{onPanelChange=()=>{},createScore=createPitchScore}={}){
  const button=doc.getElementById('pitch-sound');
  const panel=doc.getElementById('pitch-audio-panel'),options=doc.getElementById('pitch-audio-options');
  const slider=doc.getElementById('pitch-volume'),value=doc.getElementById('pitch-volume-value');
  const label=doc.querySelector('[data-sound-label]'),message=doc.getElementById('pitch-audio-message');
  let context=null,score=null,enabled=false,starting=false,disposed=false,revision=0,suspendTimer=0,chapter='opening',volume=.55,lastAudible=.55;
  const blocked=new Set(),listeners=[];
  try{const saved=win.sessionStorage.getItem('smarttec:pitch-volume');if(saved!==null&&Number.isFinite(Number(saved)))volume=Math.max(0,Math.min(1,Number(saved)));}catch{}
  if(volume>0)lastAudible=volume;
  function listen(target,event,fn){if(!target)return;target.addEventListener(event,fn);listeners.push(()=>target.removeEventListener(event,fn));}
  const wanted=()=>enabled&&blocked.size===0&&!disposed;
  function render(){
    const running=wanted()&&context?.state==='running',audible=running&&volume>0;
    button?.setAttribute('aria-pressed',String(audible));
    if(label)label.textContent=!enabled?'Sound off':starting?'Starting…':volume===0?'Sound muted':running?'Sound on':blocked.size?'Sound paused':'Start sound';
    if(options){options.hidden=!enabled;options.textContent=`Volume ${Math.round(volume*100)}%`;}
    if(slider)slider.value=String(Math.round(volume*100));
    if(value)value.textContent=`${Math.round(volume*100)}%`;
  }
  function say(text=''){if(message)message.textContent=text;}
  function ensure(){
    if(context&&context.state!=='closed')return;
    const Audio=win.AudioContext||win.webkitAudioContext;
    if(!Audio)throw new Error('This browser does not support the soundtrack.');
    context=new Audio();score=createScore(context,{volume,chapter});
    listen(context,'statechange',()=>{
      if(disposed)return;
      if(wanted()&&context.state!=='running'&&context.state!=='closed')say('Audio is paused by the browser. Select Sound to resume.');
      render();
    });
  }
  async function sync(){
    const ticket=++revision;win.clearTimeout(suspendTimer);
    if(!context){render();return;}
    if(!wanted()){
      starting=false;
      score.setActive(false);
      const suspend=()=>{if(!disposed&&ticket===revision&&!wanted())context.suspend().catch(()=>{});};
      if(blocked.has('hidden'))suspend();else suspendTimer=win.setTimeout(suspend,300);
      render();return;
    }
    try{
      starting=true;render();
      // This call stays in the Sound button's gesture when audio is first enabled.
      const resumed=context.resume();
      await resumed;
      if(disposed||ticket!==revision||!wanted())return;
      if(context.state!=='running')throw new Error('Audio is paused by the browser.');
      score.setVolume(volume);score.setChapter(chapter);score.setActive(true);score.schedule(context.currentTime+.35);
      starting=false;say();render();
    }catch{
      if(disposed||ticket!==revision)return;
      starting=false;score?.setActive(false);say('Audio could not start. Select Sound to try again.');render();
    }
  }
  async function toggle(){
    if(disposed)return;
    if(enabled&&starting)enabled=false;
    else if(!enabled||context?.state!=='running'||volume===0){
      enabled=true;if(volume===0)volume=lastAudible;
      try{ensure();}catch{enabled=false;say('Sound is unavailable in this browser.');render();return;}
    }else enabled=false;
    render();await sync();
  }
  function setVolume(raw){
    const next=Number(raw);if(!Number.isFinite(next))return;
    volume=Math.max(0,Math.min(1,next));if(volume>0)lastAudible=volume;
    score?.setVolume(volume);try{win.sessionStorage.setItem('smarttec:pitch-volume',String(volume));}catch{}
    render();
  }
  function setBlocked(reason,active){
    if(blocked.has(reason)===active)return;
    if(active)blocked.add(reason);else blocked.delete(reason);
    void sync();
  }
  function setChapter(id){chapter=id;score?.setChapter(id);}
  function tick(){if(wanted()&&context?.state==='running')score?.schedule(context.currentTime+.35);}
  function closePanel(){if(panel?.open)panel.close();}
  listen(button,'click',toggle);
  listen(options,'click',()=>{panel?.showModal();options.setAttribute('aria-expanded','true');onPanelChange(true);});
  listen(doc.getElementById('pitch-audio-close'),'click',closePanel);
  listen(panel,'close',()=>{options?.setAttribute('aria-expanded','false');onPanelChange(false);(options?.hidden?button:options)?.focus();});
  listen(slider,'input',event=>setVolume(Number(event.target.value)/100));
  listen(doc.getElementById('pitch-audio-mute'),'click',()=>{enabled=false;void sync();closePanel();});
  render();
  function dispose(){
    if(disposed)return;disposed=true;revision++;win.clearTimeout(suspendTimer);
    listeners.splice(0).forEach(off=>off());closePanel();options?.setAttribute('aria-expanded','false');onPanelChange(false);
    score?.dispose();context?.close().catch(()=>{});
  }
  return{toggle,setBlocked,setChapter,tick,dispose,get panelOpen(){return Boolean(panel?.open);},get context(){return context;}};
}
