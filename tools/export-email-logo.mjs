import {writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import sharp from 'sharp';
import {createEnergyRenderer,LOOP_SECONDS} from '../SmartTec-Brand-Kit/website/energy-renderer.mjs';
// Install the existing brand-export dependencies in SmartTec-Brand-Kit/source first.
// SMARTTEC_CANVAS_MODULE may point to an already installed canvas package.
const require=createRequire(new URL('../SmartTec-Brand-Kit/source/package.json',import.meta.url));
const {createCanvas,loadImage}=require(process.env.SMARTTEC_CANVAS_MODULE || '@napi-rs/canvas');
const width=576,height=324,fps=10,frames=[];
const logo=await loadImage('SmartTec-Brand-Kit/website/smarttec-logo.png');
const canvas=createCanvas(width,height);
const renderer=createEnergyRenderer(canvas,logo,createCanvas,{transparent:true,intensity:'conference'});
renderer.resize(width,height);
await mkdir('public/assets/brand',{recursive:true});
for(let i=0;i<LOOP_SECONDS*fps;i++){
 renderer.render(i/fps);
 const rgba=Buffer.from(canvas.getContext('2d').getImageData(0,0,width,height).data);
 frames.push(rgba);
 if(i===30)await writeFile('public/assets/brand/smarttec-email-transparent.png',canvas.toBuffer('image/png'));
}
const dest='public/assets/brand/smarttec-email-transparent.gif';
await sharp(Buffer.concat(frames),{raw:{width,height:height*frames.length,channels:4,pageHeight:height}}).gif({loop:0,delay:100,colours:128,dither:0,effort:7}).toFile(dest);
const meta=await sharp(dest,{animated:true}).metadata();
console.log(JSON.stringify({file:dest,width:meta.width,pageHeight:meta.pageHeight,frames:meta.pages,alpha:meta.hasAlpha,loop:meta.loop},null,2));
renderer.destroy();
