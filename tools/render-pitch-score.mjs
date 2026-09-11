import {createServer} from 'node:http';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const target=resolve(root,'tmp/pitch-audio');
await mkdir(target,{recursive:true});
const source=await readFile(resolve(root,'src/smarttec-investor/client/pitch-score.mjs'));
const server=createServer((request,response)=>{
  response.writeHead(200,{'content-type':request.url==='/score.mjs'?'text/javascript':'text/html'});
  response.end(request.url==='/score.mjs'?source:'<!doctype html><title>SmartTec score rendering</title>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
function wav(channels, sampleRate){
  const length=channels[0].length, count=channels.length, output=Buffer.alloc(44+length*count*2);
  output.write('RIFF');output.writeUInt32LE(output.length-8,4);output.write('WAVEfmt ',8);
  output.writeUInt32LE(16,16);output.writeUInt16LE(1,20);output.writeUInt16LE(count,22);
  output.writeUInt32LE(sampleRate,24);output.writeUInt32LE(sampleRate*count*2,28);
  output.writeUInt16LE(count*2,32);output.writeUInt16LE(16,34);output.write('data',36);
  output.writeUInt32LE(length*count*2,40);
  for(let i=0;i<length;i++)for(let c=0;c<count;c++)output.writeInt16LE(Math.round(Math.max(-1,Math.min(1,channels[c][i]))*32767),44+(i*count+c)*2);
  return output;
}
try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:'+server.address().port);
  const ids=await page.evaluate(async()=> (await import('/score.mjs')).pitchScoreChapterIds);
  const results=[];
  async function render({chapter='opening',duration=20,scenario='chapter',save=false}={}){
    const result=await page.evaluate(async({chapter,duration,scenario,save})=>{
      const {createPitchScore,pitchScoreChapterIds}=await import('/score.mjs');
      const sampleRate=48000,context=new OfflineAudioContext(2,Math.ceil(sampleRate*duration),sampleRate);
      let nodeCount=0;
      for(const name of ['createGain','createOscillator','createBiquadFilter','createStereoPanner','createDynamicsCompressor','createWaveShaper','createDelay','createBufferSource']){
        const original=context[name].bind(context);
        context[name]=(...args)=>{nodeCount++;return original(...args);};
      }
      const score=createPitchScore(context,{chapter});
      const initialNodes=nodeCount;
      score.setActive(true,0);
      if(scenario==='rapid'){
        for(let i=0;i<130;i++){const t=i*.08;score.setChapter(pitchScoreChapterIds[i%pitchScoreChapterIds.length],t);score.schedule(t+.08);}
        score.schedule(duration);
      }else if(scenario==='controls'){
        score.schedule(5);score.setActive(false,5);score.schedule(8);score.setActive(true,8);score.schedule(12);
        score.setVolume(0,12);score.schedule(15);score.setVolume(1,15);score.schedule(duration);
      }else if(scenario==='medley'){
        pitchScoreChapterIds.forEach((id,i)=>{score.setChapter(id,i*6);score.schedule((i+1)*6);});
      }else score.schedule(duration);
      const scheduledNodes=nodeCount;
      const buffer=await context.startRendering();
      const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
      function stats(start=0,end=duration){
        const first=Math.floor(start*sampleRate),last=Math.min(channels[0].length,Math.floor(end*sampleRate));
        let squares=0,peak=0,jump=0,total=0;
        for(const channel of channels)for(let i=first;i<last;i++){const v=channel[i];squares+=v*v;peak=Math.max(peak,Math.abs(v));if(i>first)jump=Math.max(jump,Math.abs(v-channel[i-1]));total++;}
        return {rms:Math.sqrt(squares/total),peak,maxSampleStep:jump};
      }
      const summary={chapter,scenario,duration,initialNodes,scheduledNodes,...stats(2),
        windows:scenario==='controls'?{pause:stats(6,7.8),mute:stats(13,14.8),maximum:stats(16,19.8)}:undefined};
      const serial=save?channels.map(channel=>Array.from(channel)):undefined;
      score.dispose();score.dispose();score.schedule(duration+1);
      return{summary,channels:serial,sampleRate};
    },{chapter,duration,scenario,save});
    assert.equal(result.summary.scheduledNodes,result.summary.initialNodes,'Navigation must not allocate nodes');
    assert.ok(result.summary.peak<.6,'Audio peaks must remain below 0.6');
    assert.ok(Number.isFinite(result.summary.rms)&&result.summary.rms>0,'Score should be audible');
    if(scenario==='chapter')assert.ok(result.summary.rms>=.035&&result.summary.rms<=.10,'Default chapter RMS should be .035–.10');
    if(scenario==='controls'){
      assert.ok(result.summary.windows.pause.peak<1e-7,'Inactive score must be silent');
      assert.ok(result.summary.windows.mute.peak<1e-7,'Zero volume must be silent');
    }
    if(save)await writeFile(resolve(target,scenario==='chapter'?chapter+'.wav':scenario+'.wav'),wav(result.channels,result.sampleRate));
    results.push(result.summary);console.log(JSON.stringify(result.summary));
  }
  for(const chapter of ids)await render({chapter,save:chapter==='opening'});
  await render({scenario:'rapid'});
  await render({scenario:'controls',save:true});
  await render({scenario:'medley',duration:ids.length*6,save:true});
  await writeFile(resolve(target,'measurements.json'),JSON.stringify({sampleRate:48000,channel:'chrome',measurements:results},null,2)+'\n');
  console.log('Score renders and measurements saved to tmp/pitch-audio/. These checks do not claim subjective listening.');
}finally{
  await browser?.close();await new Promise(resolve=>server.close(resolve));
}

