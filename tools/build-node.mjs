import {spawnSync} from 'node:child_process';
const result=spawnSync(process.execPath,['node_modules/astro/bin/astro.mjs','build'],{
  stdio:'inherit',env:{...process.env,SMARTTEC_BUILD_TARGET:'node'},
});
if(result.error) console.error(result.error.message);
process.exit(result.status??1);
