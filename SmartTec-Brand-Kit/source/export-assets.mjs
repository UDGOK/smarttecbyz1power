import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const sharp=require('sharp');
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const image=await loadImage(path.join(ROOT,'source/approved-concept.png'));
const original=createCanvas(image.width,image.height),oc=original.getContext('2d');oc.drawImage(image,0,0);
const pixels=oc.getImageData(0,0,image.width,image.height).data;
// Export the same keyed letterforms used by the approved particle preview.
const roi={x:150,y:270,w:1236,h:300};
const logo=createCanvas(roi.w,roi.h),lc=logo.getContext('2d'),rgba=lc.createImageData(roi.w,roi.h);
let minX=roi.w,minY=roi.h,maxX=0,maxY=0;
for(let y=0;y<roi.h;y++)for(let x=0;x<roi.w;x++){
  const src=((y+roi.y)*image.width+x+roi.x)*4,k=(y*roi.w+x)*4;
  const green=pixels[src+1]-pixels[src]>60&&pixels[src+1]-pixels[src+2]>45;
  let a=green?(pixels[src+1]-82)/150:(pixels[src]-32)/205;
  a=a<.07?0:Math.min(1,Math.max(0,a));
  rgba.data[k]=green?123:238;rgba.data[k+1]=green?232:241;rgba.data[k+2]=green?138:239;rgba.data[k+3]=Math.round(a*255);
  if(a>.5){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
}
lc.putImageData(rgba,0,0);
const pad=6,bounds={x:minX-pad,y:minY-pad,w:maxX-minX+1+pad*2,h:maxY-minY+1+pad*2};
const crop=createCanvas(bounds.w,bounds.h),cc=crop.getContext('2d');cc.drawImage(logo,bounds.x,bounds.y,bounds.w,bounds.h,0,0,bounds.w,bounds.h);
const body=cc.getImageData(0,0,crop.width,crop.height).data;
const binary={white:new Uint8Array(crop.width*crop.height),green:new Uint8Array(crop.width*crop.height)};
for(let i=0;i<body.length;i+=4)if(body[i+3]>127)binary[body[i+1]-body[i]>60?'green':'white'][i/4]=1;
function simplify(points,tol=.9){
  function lineDist(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy;if(!l)return Math.hypot(p[0]-a[0],p[1]-a[1]);const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
  function rdp(p){if(p.length<3)return p;let max=0,at=0;for(let i=1;i<p.length-1;i++){const d=lineDist(p[i],p[0],p.at(-1));if(d>max){max=d;at=i;}}return max>tol?[...rdp(p.slice(0,at+1)).slice(0,-1),...rdp(p.slice(at))]:[p[0],p.at(-1)];}
  let split=1,dist=0;for(let i=1;i<points.length;i++){const d=Math.hypot(points[i][0]-points[0][0],points[i][1]-points[0][1]);if(d>dist){dist=d;split=i;}}
  return [...rdp(points.slice(0,split+1)).slice(0,-1),...rdp([...points.slice(split),points[0]]).slice(0,-1)];
}
function trace(mask,w,h){
  const edges=new Map(),at=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&mask[y*w+x];
  const key=(x,y)=>y*(w+1)+x;
  function add(x,y,nx,ny,d){const k=key(x,y);if(!edges.has(k))edges.set(k,[]);edges.get(k).push({end:key(nx,ny),d});}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(at(x,y)){
    if(!at(x,y-1))add(x,y,x+1,y,0);if(!at(x+1,y))add(x+1,y,x+1,y+1,1);
    if(!at(x,y+1))add(x+1,y+1,x,y+1,2);if(!at(x-1,y))add(x,y+1,x,y,3);
  }
  const contours=[];
  while(edges.size){const start=edges.keys().next().value;let cur=start,dir=0;const points=[];
    for(let guard=0;guard<200000;guard++){points.push([cur%(w+1),Math.floor(cur/(w+1))]);const nexts=edges.get(cur);if(!nexts?.length)break;let ni=0;if(nexts.length>1){const rank=[1,0,3,2];for(const turn of rank){const found=nexts.findIndex(e=>(e.d-dir+4)%4===turn);if(found>=0){ni=found;break;}}}const e=nexts.splice(ni,1)[0];if(!nexts.length)edges.delete(cur);cur=e.end;dir=e.d;if(cur===start)break;}
    let area=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a[0]*b[1]-a[1]*b[0];}
    if(Math.abs(area)>4)contours.push(simplify(points));
  }
  return contours.map(points=>{
    const n=points.length,fmt=v=>Number(v.toFixed(2));
    const tangents=points.map((p,i)=>{const a=points[(i+n-1)%n],b=points[(i+1)%n],ux=p[0]-a[0],uy=p[1]-a[1],vx=b[0]-p[0],vy=b[1]-p[1],la=Math.hypot(ux,uy),lb=Math.hypot(vx,vy);if(!la||!lb||(ux*vx+uy*vy)/(la*lb)<.55)return[0,0];return[(b[0]-a[0])/6,(b[1]-a[1])/6];});
    let d='M'+points[0].join(' ');
    for(let i=0;i<n;i++){const j=(i+1)%n,a=points[i],b=points[j],limit=Math.hypot(b[0]-a[0],b[1]-a[1])/3;const fit=t=>{const len=Math.hypot(...t),scale=len>limit?limit/len:1;return[t[0]*scale,t[1]*scale];},ta=fit(tangents[i]),tb=fit(tangents[j]);if(!Math.hypot(...ta)&&!Math.hypot(...tb))d+='L'+b.join(' ');else d+='C'+[a[0]+ta[0],a[1]+ta[1],b[0]-tb[0],b[1]-tb[1],...b].map(fmt).join(' ');}
    return d+'Z';
  }).join('');
}
const paths={white:trace(binary.white,crop.width,crop.height),green:trace(binary.green,crop.width,crop.height)};
const mainBottom=215; // The main lettering is above the endorsement in the cropped master.
const iconWidth=204;
const variants={
  'offwhite-green':{white:'#eef1ef',green:'#7be88a'},
  'forest-green':{white:'#1c4839',green:'#7be88a'},
  black:{white:'#141414',green:'#141414'},
  white:{white:'#ffffff',green:'#ffffff'},
};
const sets={lockup:{w:crop.width,h:crop.height},wordmark:{w:crop.width,h:mainBottom},symbol:{w:iconWidth,h:mainBottom}};
function svg(set,colors,background=null){const w=sets[set].w,h=sets[set].h;return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="SmartTec by Z1Power"><title>SmartTec by Z1Power</title><defs><clipPath id="bounds"><rect width="${w}" height="${h}"/></clipPath></defs>${background?`<rect width="${w}" height="${h}" fill="${background}"/>`:''}<g clip-path="url(#bounds)" fill-rule="evenodd"><path fill="${colors.white}" d="${paths.white}"/><path fill="${colors.green}" d="${paths.green}"/></g></svg>`;}
for(const [set]of Object.entries(sets))for(const [variant,colors]of Object.entries(variants)){
  const content=svg(set,colors);fs.writeFileSync(path.join(ROOT,`logos/svg/smarttec-${set}-${variant}.svg`),content);
  const sizes=set==='symbol'?[256,1024]:[1200,2400];
  for(const width of sizes)await sharp(Buffer.from(content)).resize({width}).png().toFile(path.join(ROOT,`logos/png/smarttec-${set}-${variant}-${width}.png`));
}
const keyedMaster=path.join(ROOT,'source/approved-logo-keyed.png');fs.writeFileSync(keyedMaster,crop.toBuffer('image/png'));
fs.copyFileSync(path.join(ROOT,'logos/png/smarttec-lockup-offwhite-green-1200.png'),path.join(ROOT,'website/smarttec-logo.png'));
const iconSvg=svg('symbol',variants['offwhite-green']);
const inner=iconSvg.match(/<g clip-path="url\(#bounds\)"[\s\S]*<\/g>/)[0].replace('clip-path="url(#bounds)"','');
const favicon=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><title>SmartTec</title><defs><clipPath id="symbol"><rect width="${iconWidth}" height="${mainBottom}"/></clipPath></defs><rect width="256" height="256" rx="48" fill="#1c4839"/><g transform="translate(33 27) scale(.91)" clip-path="url(#symbol)">${inner}</g></svg>`;
fs.writeFileSync(path.join(ROOT,'icons/favicon.svg'),favicon);
for(const width of [32,64,180,512])await sharp(Buffer.from(favicon)).resize(width,width).png().toFile(path.join(ROOT,`icons/smarttec-icon-${width}.png`));
const icon32=fs.readFileSync(path.join(ROOT,'icons/smarttec-icon-32.png'));
const head=Buffer.alloc(22);head.writeUInt16LE(0,0);head.writeUInt16LE(1,2);head.writeUInt16LE(1,4);head[6]=32;head[7]=32;head.writeUInt16LE(1,10);head.writeUInt16LE(32,12);head.writeUInt32LE(icon32.length,14);head.writeUInt32LE(22,18);fs.writeFileSync(path.join(ROOT,'icons/favicon.ico'),Buffer.concat([head,icon32]));
fs.writeFileSync(path.join(ROOT,'source/logo-geometry.json'),JSON.stringify({width:crop.width,height:crop.height,mainBottom,iconWidth,paths,palette:variants},null,2));
console.log(`Exported 12 SVGs, 24 transparent PNGs, and 6 app icons. Master ${crop.width}×${crop.height}.`);
