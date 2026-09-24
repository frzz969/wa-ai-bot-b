// scripts/test-brat.js — verifikasi renderBrat: buffer > 5KB & tidak putih polos.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { renderBrat } = require('../lib/brat');

async function darkPixels(png) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let dark = 0;
  for (let i = 0; i < data.length; i += ch) {
    // ambil channel RGB (abaikan alpha): gelap bila rata-rata < 128
    const n = Math.min(ch, 3);
    let sum = 0;
    for (let c = 0; c < n; c++) sum += data[i + c];
    if (sum / n < 128) dark++;
  }
  return dark;
}

(async () => {
  const samples = [
    ['halo', 'halo'],
    ['HALLOOOOO DUNIA', 'caps'],
    ['ini adalah kalimat yang cukup panjang untuk menguji wrap dan justify beberapa baris brat', 'panjang'],
  ];
  let fail = 0;
  const keepOne = path.join(__dirname, '..', 'tmp-brat-contoh.png');
  for (const [text, tag] of samples) {
    const buf = await renderBrat(text, 512);
    const dark = await darkPixels(buf);
    const okSize = buf.length > 5 * 1024;
    const okDark = dark > 100;
    console.log(`[${tag}] bytes=${buf.length} darkPixels=${dark} size>5KB:${okSize ? 'OK' : 'FAIL'} dark>100:${okDark ? 'OK' : 'FAIL'}`);
    if (!okSize || !okDark) fail++;
    // simpan 1 file contoh (sampel terakhir), hapus sisanya (tidak ditulis ke disk)
    if (tag === 'panjang') fs.writeFileSync(keepOne, buf);
  }
  console.log(fail === 0 ? `SEMUA OK. Contoh disimpan: ${keepOne}` : `${fail} SAMPEL GAGAL`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
