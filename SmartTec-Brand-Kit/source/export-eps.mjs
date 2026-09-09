import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),sharp=require('sharp');
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const g=JSON.parse(fs.readFileSync(path.join(ROOT,'source/logo-geometry.json'),'utf8'));
const sets={lockup:{w:g.width,h:g.height},wordmark:{w:g.width,h:g.mainBottom},symbol:{w:g.iconWidth,h:g.mainBottom}};
function postscriptPath(d){
  const tokens=d.match(/[MLCZ]|[-+]?(?:\d*\.?\d+)(?:[eE][-+]?\d+)?/g)||[];
  const lines=['newpath'];
  for(let i=0;i<tokens.length;){const command=tokens[i++],count={M:2,L:2,C:6,Z:0}[command];if(count===undefined)throw new Error(`Unsupported SVG command: ${command}`);const args=tokens.slice(i,i+count);if(args.length!==count||args.some(v=>!Number.isFinite(Number(v))))throw new Error('Invalid coordinates');i+=count;lines.push((args.length?args.join(' ')+' ':'')+{M:'moveto',L:'lineto',C:'curveto',Z:'closepath'}[command]);}
  return lines.join('\n');
}
const ps={white:postscriptPath(g.paths.white),green:postscriptPath(g.paths.green)};
const rgb=hex=>[1,3,5].map(i=>Number((parseInt(hex.slice(i,i+2),16)/255).toFixed(6))).join(' ');
function eps(set,colors,title){const {w,h}=sets[set];return `%!PS-Adobe-3.0 EPSF-3.0
%%Title: ${title}
%%Creator: SmartTec Brand Kit
%%CreationDate: 2026-09-08
%%BoundingBox: 0 0 ${Math.ceil(w)} ${Math.ceil(h)}
%%HiResBoundingBox: 0 0 ${w} ${h}
%%LanguageLevel: 2
%%DocumentData: Clean7Bit
%%Pages: 1
%%EndComments
save
0 ${h} translate
1 -1 scale
0 0 ${w} ${h} rectclip
${rgb(colors.white)} setrgbcolor
${ps.white}
eofill
${rgb(colors.green)} setrgbcolor
${ps.green}
eofill
restore
showpage
%%EOF
`;}
fs.mkdirSync(path.join(ROOT,'logos/eps'),{recursive:true});
fs.mkdirSync(path.join(ROOT,'embroidery-artwork'),{recursive:true});
let epsCount=0;
for(const set of Object.keys(sets))for(const [variant,colors] of Object.entries(g.palette)){
  fs.writeFileSync(path.join(ROOT,`logos/eps/smarttec-${set}-${variant}.eps`),eps(set,colors,`SmartTec ${set} ${variant}`));epsCount++;
}
const embroideryVariants=[['2color-dark-fabric','offwhite-green'],['2color-light-fabric','forest-green'],['1color','black']];
for(const set of ['wordmark','symbol'])for(const [name,variant]of embroideryVariants){
  const base=`smarttec-embroidery-${set}-${name}`;
  const source=fs.readFileSync(path.join(ROOT,`logos/svg/smarttec-${set}-${variant}.svg`),'utf8');
  fs.writeFileSync(path.join(ROOT,`embroidery-artwork/${base}.svg`),source);
  fs.writeFileSync(path.join(ROOT,`embroidery-artwork/${base}.eps`),eps(set,g.palette[variant],`SmartTec embroidery source artwork ${set} ${name} - not stitch data`));epsCount++;
  await sharp(Buffer.from(source)).resize({width:set==='symbol'?512:1200}).png().toFile(path.join(ROOT,`embroidery-artwork/${base}-preview.png`));
}
console.log(`Exported ${epsCount} true vector EPS files plus six embroidery SVGs and six transparent previews.`);
