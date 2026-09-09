/**
 * Snapshot the news brief into src/data/news.json.
 *
 * The page renders this at build time so it is never empty and never waits on
 * a network call to show something. The live endpoint replaces it in the
 * browser. Run: node tools/fetch-news.mjs
 */
import { writeFileSync } from 'node:fs';
import { collect } from '../src/lib/feeds.mjs';

const data = await collect(60);
if (!data.items.length) {
  console.error('no items collected — refusing to write an empty snapshot');
  process.exit(1);
}
writeFileSync('src/data/news.json', JSON.stringify(data) + '\n');
console.error(`wrote src/data/news.json — ${data.items.length} items from ${data.sources.length - data.unavailable.length}/${data.sources.length} publications`);
