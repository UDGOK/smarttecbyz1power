// Clock and navigation have no browser dependencies; missed background time is never accrued.
export function wheelPixels(event,pageHeight){const unit=event.deltaMode===1?16:event.deltaMode===2?Math.max(1,pageHeight):1;return Number.isFinite(event.deltaY)?event.deltaY*unit:0;}
export class PitchPlayback {
  constructor(durations,{playing=true,index=0}={}){
    if(!Array.isArray(durations)||!durations.length||durations.some(n=>!Number.isFinite(n)||n<1))throw new Error('Chapter durations must be positive');
    this.durations=durations;this.index=Math.max(0,Math.min(index,durations.length-1));this.playing=playing;this.elapsed=0;this.locks=new Set();
  }
  get progress(){return Math.min(1,this.elapsed/this.durations[this.index]);}
  get advancing(){return this.playing&&this.locks.size===0;}
  lock(reason,locked){if(locked)this.locks.add(reason);else this.locks.delete(reason);}
  goTo(index){const next=Math.max(0,Math.min(Math.trunc(index),this.durations.length-1));if(!Number.isFinite(next))return false;const changed=this.index!==next;this.index=next;this.elapsed=0;return changed;}
  tick(seconds){if(!this.advancing||!Number.isFinite(seconds)||seconds<=0)return false;this.elapsed+=Math.min(seconds,.5);if(this.progress<1)return false;if(this.index===this.durations.length-1){this.elapsed=this.durations[this.index];this.playing=false;return false;}this.index++;this.elapsed=0;return true;}
  toggle(){if(!this.playing&&this.index===this.durations.length-1&&this.progress===1)this.goTo(0);this.playing=!this.playing;}
}
