import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {investorDeckBase64} from '../src/smarttec-investor/server/investor-deck.mjs';
import metadata from '../src/smarttec-investor/data/investor-deck.json' with {type:'json'};
const sha=b=>createHash('sha256').update(b).digest('hex');
test('protected download matches the reviewed PDF and fits the function response limit',()=>{
 const bytes=Buffer.from(investorDeckBase64,'base64');
 assert.deepEqual(bytes,readFileSync('output/pdf/SmartTec-Investor-Presentation.pdf'));
 assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
 assert.ok(bytes.subarray(-30).toString().includes('%%EOF'));
 assert.equal(bytes.length,metadata.bytes);assert.equal(sha(bytes),metadata.sha256);
 assert.ok(bytes.length<4_000_000);assert.equal(metadata.pages,23);
 assert.equal(existsSync('public/SmartTec-Investor-Presentation.pdf'),false);
});
test('published PDF economics cannot silently drift from the current study or engine',()=>{
 for(const [path,expected] of [['src/smarttec-investor/data/owner-deployment-study.json',metadata.ownerStudySha256],['src/smarttec-investor/roi-engine.mjs',metadata.engineSha256]]){
  assert.equal(sha(readFileSync(path,'utf8').replaceAll('\r\n','\n')),expected,'Rebuild and review the investor PDF after economic changes');
 }
});
