import {spawnSync} from 'node:child_process';
const brand=spawnSync(process.execPath,['tools/stage-brand-kit.mjs'],{stdio:'inherit'});
if(brand.status!==0) process.exit(brand.status??1);
const news=spawnSync(process.execPath,['tools/fetch-news.mjs'],{stdio:'inherit'});
if(news.status!==0) console.warn('News refresh unavailable; keeping the committed snapshot.');
