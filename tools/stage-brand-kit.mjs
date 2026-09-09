/**
 * Stage the brand kit for download, and describe it for the assets page.
 *
 * `SmartTec-Brand-Kit/` is the source of truth and stays where the designer
 * put it. This copies it under `public/brand-kit/` so the files are actually
 * servable, writes a manifest the page renders from, and builds a
 * store-only ZIP of the whole thing so a colleague can take everything in one
 * click.
 *
 * public/brand-kit/ is generated and gitignored — the repo keeps one copy of
 * these 20MB, not two.
 *
 * The ZIP is written by hand rather than shelling out to `zip`, which is not
 * guaranteed to exist in a build container. Stored, not deflated: almost
 * everything in here is PNG, MP4 or GIF and is already compressed, so
 * deflating buys nothing and costs a dependency.
 *
 * Run: node tools/stage-brand-kit.mjs
 */
import { readdirSync, statSync, mkdirSync, copyFileSync, rmSync, existsSync, readFileSync, writeFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { crc32 } from 'node:zlib';

const SRC = 'SmartTec-Brand-Kit';
const OUT = 'public/brand-kit';
const ZIP = join(OUT, 'smarttec-brand-kit.zip');
const MANIFEST = 'src/data/brand-kit.json';

if (!existsSync(SRC)) {
  console.error(`${SRC} not found — leaving the assets page on its committed manifest`);
  process.exit(0);
}

/** Everything except editor noise and the kit's own index pages. */
const SKIP = new Set(['.DS_Store', 'Thumbs.db']);
const walk = (dir, acc = []) => {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
};

const files = walk(SRC).sort();
rmSync(OUT, { recursive: true, force: true });

const entries = [];
for (const file of files) {
  const rel = relative(SRC, file);
  const dest = join(OUT, rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(file, dest);
  entries.push({ path: rel.split('\\').join('/'), bytes: statSync(file).size });
}

/* ---- ZIP (store only) ------------------------------------------------ */
const dosTime = (d) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2)) & 0xffff;
const dosDate = (d) => (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

const fd = openSync(ZIP, 'w');
let offset = 0;
const central = [];
const now = new Date();
const t = dosTime(now); const dt = dosDate(now);

for (const entry of entries) {
  const name = Buffer.from(entry.path, 'utf8');
  const data = readFileSync(join(SRC, entry.path));
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);            // version needed
  local.writeUInt16LE(0x0800, 6);        // UTF-8 names
  local.writeUInt16LE(0, 8);             // stored
  local.writeUInt16LE(t, 10);
  local.writeUInt16LE(dt, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  writeSync(fd, local); writeSync(fd, name); writeSync(fd, data);

  const head = Buffer.alloc(46);
  head.writeUInt32LE(0x02014b50, 0);
  head.writeUInt16LE(20, 4);
  head.writeUInt16LE(20, 6);
  head.writeUInt16LE(0x0800, 8);
  head.writeUInt16LE(0, 10);
  head.writeUInt16LE(t, 12);
  head.writeUInt16LE(dt, 14);
  head.writeUInt32LE(crc, 16);
  head.writeUInt32LE(data.length, 20);
  head.writeUInt32LE(data.length, 24);
  head.writeUInt16LE(name.length, 28);
  head.writeUInt32LE(offset, 42);
  central.push(Buffer.concat([head, name]));
  offset += local.length + name.length + data.length;
}

const dirBuf = Buffer.concat(central);
writeSync(fd, dirBuf);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(dirBuf.length, 12);
end.writeUInt32LE(offset, 16);
writeSync(fd, end);
closeSync(fd);

const total = entries.reduce((n, e) => n + e.bytes, 0);
writeFileSync(MANIFEST, JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  fileCount: entries.length,
  totalBytes: total,
  zipBytes: statSync(ZIP).size,
  files: entries,
}) + '\n');

console.error(`staged ${entries.length} files (${(total / 1048576).toFixed(1)} MB) to ${OUT}, zip ${(statSync(ZIP).size / 1048576).toFixed(1)} MB`);
