import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {investorDeckBase64} from '../src/smarttec-investor/server/investor-deck.mjs';
import metadata from '../src/smarttec-investor/data/investor-deck.json' with {type:'json'};
const sha=b=>createHash('sha256').update(b).digest('hex');
test('protected download matches the reviewed PDF and fits the function response limit',()=>{
 const bytes=Buffer.from(investorDeckBase64,'base64');
 assert.deepEqual(bytes,readFileSync('output/pdf/'+metadata.filename));
 assert.deepEqual(bytes,readFileSync('output/pdf/SmartTec-Investor-Presentation.pdf'));
 assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
 assert.ok(bytes.subarray(-30).toString().includes('%%EOF'));
 assert.equal(bytes.length,metadata.bytes);assert.equal(sha(bytes),metadata.sha256);
 assert.ok(bytes.length<4_000_000);assert.equal(metadata.pages,26);
 assert.equal(existsSync('public/'+metadata.filename),false);
});
test('published PDF is bound to the canonical reviewed model and its generating code',()=>{
 const model=JSON.parse(readFileSync('src/data/investor-model-current.json','utf8'));
 assert.equal(metadata.currentReturnStatus,'conditional-scenarios');
 assert.equal(metadata.primaryReturnMetric,'headline-project-irr');
 assert.equal(model.assumptions.primaryReturnMetric,'headlineIrr');
 assert.deepEqual(model.scenarios.map(row=>row.id),['base','slower-ramp','price-pressure']);
 assert.equal((model.scenarios[0].returns.headlineIrr*100).toFixed(2),'9.78');
 assert.equal(metadata.modelVersion,model.version);
 assert.deepEqual(metadata.financialSource,model.source);
 for(const [path,expected] of [['src/data/investor-model-current.json',metadata.modelSourceSha256],['tools/build-investor-deck.py',metadata.builderSourceSha256],['tools/export-investor-deck-data.mjs',metadata.exporterSourceSha256]]){
  assert.equal(sha(readFileSync(path,'utf8').replaceAll('\r\n','\n')),expected,'Rebuild and review the investor PDF after economic changes');
 }
});

test('published team slide cannot drift from the shared names and contacts',()=>{
 assert.equal(metadata.credentialsSourceSha256,sha(readFileSync('src/data/yasir-credentials.json','utf8').replaceAll('\r\n','\n')),'Rebuild the team slide after verified credential changes');
 assert.equal(metadata.teamSourceSha256,sha(readFileSync('src/data/team.json','utf8').replaceAll('\r\n','\n')),'Rebuild and visually review the PDF team slide after roster changes');
});
