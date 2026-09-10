import kit from './brand-kit.json';

export const BRAND_ROOT = '/brand-kit';
export const formatSize = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
export const categories = [
  {id:'all',label:'All assets'}, {id:'logos',label:'Logos'}, {id:'social',label:'Social'},
  {id:'motion',label:'Motion'}, {id:'apparel',label:'Apparel'}, {id:'icons',label:'Icons'},
  {id:'source',label:'Source & web'},
];
export function categoryFor(path: string) {
  if(path.startsWith('animated/')) return 'motion';
  if(path.startsWith('embroidery-')) return 'apparel';
  return ['logos','social','icons'].find(category=>path.startsWith(category+'/')) || 'source';
}
export function titleFor(path: string) {
  return path.split('/').at(-1)!.replace(/\.[^.]+$/, '').replace(/^smarttec-/, '')
    .replace(/-SATIN-TEST-SEWOUT/i,' · satin stitch study').replace(/-TEST-SEWOUT/i,' · earlier stitch study')
    .replace(/-stitch-preview/i,'').replace(/-preview/i,'').replace(/3p25in/g,'3.25 in').replace(/2p5in/g,'2.5 in')
    .replace(/offwhite/g,'off-white').replace(/-/g,' ').replace(/\b1color\b/g,'one colour').replace(/\b2color\b/g,'two colour')
    .replace(/^og /i,'Link preview ').replace(/(\d+)x(\d+)/g,'$1 × $2')
    .replace(/^./,c=>c.toUpperCase());
}
export function surfaceFor(path: string) {
  return /offwhite|white\.|white-|dark-fabric/.test(path) ? 'dark' : /forest-green|black|light-fabric|1color/.test(path) ? 'light' : 'dark';
}
export function posterFor(path: string) {
  if(path.startsWith('social/')) return `${BRAND_ROOT}/social/${path.includes('story')?'smarttec-story-1080x1920.png':'smarttec-square-1080.png'}`;
  return `${BRAND_ROOT}/animated/smarttec-energy-poster-1920x1080.jpg`;
}
export const files = kit.files.map(file=>({
  ...file, url:`${BRAND_ROOT}/${file.path}`, title:titleFor(file.path), category:categoryFor(file.path),
  format:file.path.split('.').at(-1)!.toUpperCase(), size:formatSize(file.bytes),
}));
export const visuals = files.filter(file=>/\.(png|jpe?g|svg|gif|ico|mp4|webm)$/i.test(file.path))
  .sort((a,b)=>categories.findIndex(c=>c.id===a.category)-categories.findIndex(c=>c.id===b.category))
  .map(file=>({
  ...file, kind:/\.(mp4|webm)$/i.test(file.path)?'video':file.format==='GIF'?'gif':'image',
  surface:surfaceFor(file.path), poster:posterFor(file.path),
  note:file.path.startsWith('embroidery-pes/')?'Stitch visualization · a fabric test sew-out is required before production.':
    file.path.startsWith('embroidery-artwork/')?'Artwork for your embroidery shop to digitize and sample.':
    file.path.startsWith('logos/')?'Keep the original proportions. Use a background with clear contrast.':
    file.path.startsWith('source/')?'Original design reference, included with the source kit.':
    file.format==='WEBM'?'Transparent motion overlay. Alpha support depends on your browser and editor.':'Ready to preview and download in the supplied format.',
  related: file.path.includes('stitch-preview') ? files.filter(f=>f.path===file.path.replace(/-stitch-preview\.(png|svg)$/,'.pes')) : [],
}));
export const marks=[{id:'lockup',name:'Full logo',note:'The main identity, with the “by Z1Power” endorsement.'},{id:'wordmark',name:'Wordmark',note:'For compact headers and small applications.'},{id:'symbol',name:'Symbol',note:'For avatars, favicons and places where the name is already known.'}];
export const variants=[{id:'offwhite-green',name:'Off-white + green',surface:'dark',colour:'#EEF1EF'},{id:'forest-green',name:'Forest + green',surface:'light',colour:'#1C4839'},{id:'black',name:'Black',surface:'light',colour:'#141414'},{id:'white',name:'White',surface:'dark',colour:'#FFFFFF'}];
export const palette=[{name:'Forest',hex:'#1C4839',use:'Our foundation'},{name:'Signal green',hex:'#7BE88A',use:'Energy & emphasis'},{name:'Off-white',hex:'#EEF1EF',use:'Space & clarity'},{name:'Ink',hex:'#141414',use:'Single-colour print'}];
