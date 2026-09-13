import {writeFileSync, mkdirSync, readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// The same reviewed snapshot supplies the website and PDF. The private workbook
// stays a source artifact and is never copied into the public site or PDF bundle.
const path = new URL('../src/data/investor-model-v6-1.json', import.meta.url);
const raw = readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
const model = JSON.parse(raw);
if (!model.version || !model.source || !model.assumptions || !Array.isArray(model.scenarios)) {
  throw new Error('The investor PDF requires the reviewed canonical v6.1 snapshot.');
}
const hash = value => createHash('sha256').update(value).digest('hex');
const sharedFileHash = name => hash(readFileSync(new URL('../' + name, import.meta.url), 'utf8').replaceAll('\r\n', '\n'));
mkdirSync('tmp/pdfs', {recursive: true});
writeFileSync('tmp/pdfs/deck-financials.json', JSON.stringify({
  model,
  modelSourceSha256: hash(raw),
  teamSourceSha256: sharedFileHash('src/data/team.json'),
  credentialsSourceSha256: sharedFileHash('src/data/yasir-credentials.json'),
}, null, 2) + '\n');
