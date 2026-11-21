#!/usr/bin/env node
'use strict';
// Aynı boyutlu PNG karelerinden hareketli PNG (APNG) üretir. Bağımlılık yok.
// Kullanım: node tools/apng.js <kare-klasörü> <çıktı.png> [kare-süresi-ms=120] [son-kare-bekleme-ms=1500]
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function chunks(buf) {
  const out = [];
  let p = 8;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    out.push({ type, data: buf.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
  }
  return out;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

function fctl(seq, w, h, delayMs) {
  const b = Buffer.alloc(26);
  b.writeUInt32BE(seq, 0); b.writeUInt32BE(w, 4); b.writeUInt32BE(h, 8);
  b.writeUInt32BE(0, 12); b.writeUInt32BE(0, 16);       // x, y
  b.writeUInt16BE(Math.round(delayMs), 20); b.writeUInt16BE(1000, 22); // gecikme = ms/1000 sn
  b.writeUInt8(0, 24);  // dispose: yok
  b.writeUInt8(0, 25);  // blend: kaynak (her kare tam görüntü)
  return chunk('fcTL', b);
}

function main() {
  const [dir, out, frameMs = '120', holdMs = '1500'] = process.argv.slice(2);
  if (!dir || !out) { console.error('Kullanım: node tools/apng.js <klasör> <çıktı.png> [ms] [son-ms]'); process.exit(1); }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
  if (!files.length) throw new Error('kare yok');
  const frames = files.map((f) => chunks(fs.readFileSync(path.join(dir, f))));
  const ihdr = frames[0].find((c) => c.type === 'IHDR').data;
  const w = ihdr.readUInt32BE(0); const h = ihdr.readUInt32BE(4);
  const parts = [SIG, chunk('IHDR', ihdr)];
  const actl = Buffer.alloc(8); actl.writeUInt32BE(frames.length, 0); actl.writeUInt32BE(0, 4); // sonsuz döngü
  parts.push(chunk('acTL', actl));
  let seq = 0;
  frames.forEach((fr, i) => {
    const fh = fr.find((c) => c.type === 'IHDR').data;
    if (fh.readUInt32BE(0) !== w || fh.readUInt32BE(4) !== h || fh[9] !== ihdr[9]) throw new Error(`${files[i]}: boyut/renk türü farklı`);
    const delay = i === frames.length - 1 ? Number(holdMs) : Number(frameMs);
    parts.push(fctl(seq++, w, h, delay));
    for (const c of fr.filter((x) => x.type === 'IDAT')) {
      if (i === 0) parts.push(chunk('IDAT', c.data));
      else { const s = Buffer.alloc(4); s.writeUInt32BE(seq++); parts.push(chunk('fdAT', Buffer.concat([s, c.data]))); }
    }
  });
  parts.push(chunk('IEND', Buffer.alloc(0)));
  fs.writeFileSync(out, Buffer.concat(parts));
  console.log(`${out}: ${frames.length} kare, ${w}x${h}, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}

main();
