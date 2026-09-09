import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createEnergyRenderer,LOOP_SECONDS} from '../website/energy-renderer.mjs';
const require=createRequire(import.meta.url),{createCanvas,loadImage}=require('@napi-rs/canvas');
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ffmpeg=process.env.SMARTTEC_FFMPEG||'ffmpeg';
const logo=await loadImage(path.join(ROOT,'website/smarttec-logo.png'));
const output=(name)=>path.join(ROOT,name);
async function encode({name,width,height,formation=false,intensity='conference',transparent=false,caption=false,fps=24}){
  const canvas=createCanvas(width,height),renderer=createEnergyRenderer(canvas,logo,createCanvas,{intensity,transparent});renderer.resize(width,height);
  const codec=transparent?['-c:v','libvpx-vp9','-pix_fmt','yuva420p','-b:v','0','-crf','30','-deadline','good','-cpu-used','4','-row-mt','1','-auto-alt-ref','0']:['-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart'];
  const proc=spawn(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgba','-video_size',`${width}x${height}`,'-framerate',String(fps),'-i','pipe:0','-an',...codec,output(name)],{stdio:['pipe','ignore','pipe']});
  let errors='';proc.stderr.on('data',d=>errors+=d.toString());proc.stdin.on('error',()=>{});const finished=once(proc,'close');
  for(let frame=0;frame<LOOP_SECONDS*fps;frame++){
    renderer.render(frame/fps,{formation,caption});
    if(!proc.stdin.write(canvas.data()))await once(proc.stdin,'drain');
  }
  proc.stdin.end();const [code]=await finished;renderer.destroy();if(code!==0)throw new Error(`${name}: ${errors}`);
  console.log(`Rendered ${name}: ${width}×${height}, ${LOOP_SECONDS}s, ${fps}fps`);
}
function still(name,width,height,caption=false){const c=createCanvas(width,height),r=createEnergyRenderer(c,logo,createCanvas,{intensity:'conference'});r.resize(width,height);r.render(3,{caption,staticFrame:true});fs.writeFileSync(output(name),c.toBuffer(name.endsWith('.jpg')?'image/jpeg':'image/png',94));r.destroy();}
still('social/smarttec-og-1200x630.png',1200,630,true);
still('social/smarttec-og-1200x630.jpg',1200,630,true);
still('social/smarttec-square-1080.png',1080,1080,true);
still('social/smarttec-story-1080x1920.png',1080,1920,true);
still('animated/smarttec-energy-poster-1920x1080.jpg',1920,1080);
still('animated/smarttec-energy-poster-1200x630.png',1200,630);
console.log('Social cards and video posters exported.');
if(process.argv.includes('--stills-only'))process.exit(0);
await encode({name:'animated/smarttec-energy-loop-1920x1080.mp4',width:1920,height:1080});
await encode({name:'animated/smarttec-particle-reveal-1920x1080.mp4',width:1920,height:1080,formation:true});
await encode({name:'social/smarttec-social-loop-1080x1080.mp4',width:1080,height:1080,caption:true});
await encode({name:'social/smarttec-story-loop-1080x1920.mp4',width:1080,height:1920,caption:true});
await encode({name:'animated/smarttec-energy-transparent-1200x630.webm',width:1200,height:630,transparent:true});
async function gif(source,dest,filter){const proc=spawn(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',output(source),'-filter_complex',`${filter},split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3`,'-loop','0',output(dest)],{stdio:['ignore','ignore','pipe']});let errors='';proc.stderr.on('data',d=>errors+=d);const [code]=await once(proc,'close');if(code!==0)throw new Error(errors);console.log(`Rendered ${dest}`);}
await gif('animated/smarttec-energy-loop-1920x1080.mp4','animated/smarttec-energy-loop-960x540.gif','fps=12,scale=960:540:flags=lanczos');
await gif('social/smarttec-social-loop-1080x1080.mp4','social/smarttec-social-loop-640x640.gif','fps=12,scale=640:640:flags=lanczos');
console.log('All motion exports complete.');
