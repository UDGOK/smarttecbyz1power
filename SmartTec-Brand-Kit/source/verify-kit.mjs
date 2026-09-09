import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createEnergyRenderer} from '../website/energy-renderer.mjs';
const require=createRequire(import.meta.url),{createCanvas,loadImage}=require('@napi-rs/canvas'),sharp=require('sharp');
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const files=walk(ROOT);
for(const file of files.filter(f=>f.endsWith('.html'))){const html=fs.readFileSync(file,'utf8');if(file.includes('approved-particle-preview'))continue;for(const m of html.matchAll(/(?:src|href)="([^"]+)"/g)){const link=m[1];if(/^(?:https?:|data:|#)/.test(link))continue;assert(fs.existsSync(path.resolve(path.dirname(file),link)),`${file}: missing ${link}`);}}
const svgs=files.filter(f=>f.includes('/logos/svg/')&&f.endsWith('.svg'));assert.equal(svgs.length,12);for(const file of svgs){const svg=fs.readFileSync(file,'utf8');assert(svg.includes('<path'));assert(!svg.includes('<image'));assert(!svg.includes('<text'));}
const pngs=files.filter(f=>f.includes('/logos/png/'));assert.equal(pngs.length,24);
for(const file of pngs){const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});let zero=0,opaque=0;for(let i=3;i<data.length;i+=4){if(data[i]===0)zero++;if(data[i]===255)opaque++;}assert(zero>info.width*info.height*.1&&opaque>info.width*info.height*.05,`Invalid alpha: ${file}`);}
const logo=await loadImage(path.join(ROOT,'website/smarttec-logo.png')),c=createCanvas(736,420),r=createEnergyRenderer(c,logo,createCanvas,{intensity:'conference'});
const hash=()=>createHash('sha256').update(c.data()).digest('hex');r.render(0);const h0=hash();r.render(12);assert.equal(hash(),h0,'Loop does not join exactly');r.render(1);assert.notEqual(hash(),h0,'No particle motion');r.render(0,{formation:true});assert.notEqual(hash(),h0,'Formation not visible');r.destroy();
const reference=await sharp(path.join(ROOT,'source/approved-logo-keyed.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const vector=await sharp(path.join(ROOT,'logos/svg/smarttec-lockup-offwhite-green.svg')).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(reference.info.width,vector.info.width);let intersection=0,union=0;for(let i=3;i<reference.data.length;i+=4){const a=reference.data[i]>127,b=vector.data[i]>127;intersection+=a&&b?1:0;union+=a||b?1:0;}const overlap=intersection/union;assert(overlap>.98,`Vector silhouette drift: ${overlap}`);
console.log(JSON.stringify({htmlLinks:'all present',editableSVGs:svgs.length,transparentPNGs:pngs.length,loopSeam:'pixel-identical at 0 and 12 seconds',motion:'different successive frames',vectorSilhouetteOverlap:overlap},null,2));
