// lib/brat.js — brat-style text image generator meniru bratgenerator.com (white theme)
// Render LOKAL via SVG <path> + sharp. Deterministik: teks JUSTIFY full-width (bukan acak).
// Fix Termux/@img/sharp-wasm32: sharp-wasm32 TIDAK mendukung SVG <text>
// ("Native text rendering is unsupported"), jadi tiap baris teks dikonversi
// dulu menjadi <path> via text-to-svg (pure-JS, opentype.js) — sharp render
// path dengan sempurna baik native maupun wasm.
const path = require('path');
const sharp = require('sharp');
const TextToSVG = require('text-to-svg');

// FONT: Arial Narrow (file arialnarrow.ttf, disediakan owner).
// CATATAN LISENSI: Arial Narrow adalah font proprietary Microsoft —
// JANGAN jadikan repo ini publik selama file ini ada di dalamnya
// (redistribusi melanggar lisensi). Aman untuk pemakaian pribadi.
// Alternatif legal: Liberation Sans Narrow (OFL, metrik sama persis).
const FONT_FILE = path.join(__dirname, '..', 'assets', 'fonts', 'arialnarrow.ttf');

// Cache singleton TextToSVG (loadSync sekali saja).
let _ttsvg = null;
function getTTSVG() {
  if (!_ttsvg) _ttsvg = TextToSVG.loadSync(FONT_FILE);
  return _ttsvg;
}

// Pecah kata ke baris berbasis lebar terukur (mirip word-wrap browser):
// tambah kata selama lebar estimasi baris <= lebar area; kata yang sendirian
// melebihi lebar area tetap dipaksa sebaris (binary-search akan mengecilkan font).
function wrapLines(words, fs, maxW) {
  const lines = [];
  let cur = [];
  for (const w of words) {
    const trial = cur.length ? cur.concat(w) : [w];
    if (naturalWidth(trial) * fs <= maxW) {
      cur = trial;
    } else {
      if (cur.length) {
        lines.push(cur);
        cur = [w];
        // kata tunggal yang langsung overflow tetap ditampung; fs akan menyusut
        if (naturalWidth(cur) * fs <= maxW) continue;
        // jika masih overflow, biarkan jadi baris sendiri lalu lanjut
        // (jangan push ganda: simpan sebagai cur, push saat baris berikutnya/akhir)
      } else {
        lines.push([w]);
        cur = [];
      }
    }
  }
  if (cur.length) lines.push(cur);
  return lines.length ? lines : [words.slice()];
}

// Cek apakah font-size fs muat dalam box; kembalikan baris hasil wrap bila muat.
function tryFit(words, fs, maxW, maxH, lh) {
  const lines = wrapLines(words, fs, maxW);
  const widest = Math.max(...lines.map((ln) => naturalWidth(ln) * fs));
  const blockH = lines.length * fs * lh;
  const fits = widest <= maxW && blockH <= maxH;
  return { lines, widest, blockH, fits };
}

// Estimasi lebar natural satu baris (em), sadar kapital:
// huruf kecil/digit ~0.47, huruf KAPITAL ~0.64 (lebih lebar), spasi ~0.28.
// (Tanpa ini, teks kapital dihitung kekecilan → font kegedean → kepotong tepi.)
function naturalWidth(ln) {
  let w = 0;
  for (const word of ln) {
    for (const ch of word) {
      if (ch >= 'A' && ch <= 'Z') w += 0.70;
      else if (ch >= '0' && ch <= '9') w += 0.55;
      else w += 0.47;
    }
  }
  return w + 0.28 * (ln.length - 1);
}

// Render teks ala brat -> PNG buffer. size = lebar & tinggi canvas (default 1024).
async function renderBrat(text, size = 1024) {
  const s = Math.max(256, Number(size) || 1024);
  // Kapitalisasi dipertahankan apa adanya (ala bratgenerator.com):
  // "HALLOOOOO" tetap "HALLOOOOO", bukan dipaksa kecil.
  const words = String(text || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 30);
  if (words.length === 0) words.push('brat');

  const pad = s * (20 / 512); // padding ~20px pada kanvas 512 (referensi overlay)
  const x0 = pad;
  const W = s - pad * 2; // lebar area teks
  const maxH = s - pad * 2; // tinggi area teks
  const LH = 1.02; // line-height rapat khas brat

  // textFit: binary search font-size terbesar agar blok teks muat dalam box.
  // Syarat bawah: MIN_FS harus muat; binary search jalan selama MIN muat,
  // berapapun MAX (jika MAX tidak muat, hasil = fs terbesar yang masih muat,
  // BUKAN jatuh ke MIN_FS).
  const MIN_FS = 8;
  const MAX_FS = s / 3; // ~170 pada kanvas 512 (white theme max ~70-170)
  let fs = MIN_FS;
  let lines = wrapLines(words, MIN_FS, W);
  if (tryFit(words, MIN_FS, W, maxH, LH).fits) {
    // binary search: cari fs terbesar yang muat (presisi ~0.5px)
    let lo = MIN_FS;
    let hi = Math.max(MIN_FS, MAX_FS);
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (tryFit(words, mid, W, maxH, LH).fits) {
        lo = mid;
      } else {
        hi = mid;
      }
      if (hi - lo < 0.5) break;
    }
    fs = lo;
    lines = wrapLines(words, fs, W);
  }
  fs = Math.max(MIN_FS, fs);

  // Blok teks vertically centered.
  // Justify HANYA baris non-terakhir yang cukup penuh (>65% lebar, >1 kata):
  // <text> textLength/lengthAdjust tidak bisa dipakai (sharp-wasm32 tidak
  // render <text> sama sekali), jadi justify via pemosisian per-kata:
  // ukur advance tiap kata via font lalu sebar dengan gap merata agar
  // total tepat = W. Baris terakhir / pendek / 1 kata: render natural dari x0.
  // Baseline y per baris PERTAHANKAN rumus lama.
  const ttsvg = getTTSVG();
  const blockH = lines.length * fs * LH;
  let y = (s - blockH) / 2 + fs * 0.8; // baseline baris pertama
  const paths = lines.map((ln, idx) => {
    const isLast = idx === lines.length - 1;
    const natW = naturalWidth(ln) * fs;
    const fullEnough = natW >= W * 0.65;
    const stretchable = !isLast && ln.length > 1 && fullEnough;
    const baseline = y;
    y += fs * LH;
    if (stretchable) {
      const widths = ln.map((w) => ttsvg.getWidth(w, { fontSize: fs }));
      const sumW = widths.reduce((a, b) => a + b, 0);
      const gap = (W - sumW) / (ln.length - 1);
      let cx = x0;
      return ln
        .map((w, i) => {
          const d = ttsvg.getD(w, { x: cx, y: baseline, fontSize: fs });
          cx += widths[i] + gap;
          return `<path d="${d}" fill="#000000"/>`;
        })
        .join('');
    }
    const d = ttsvg.getD(ln.join(' '), { x: x0, y: baseline, fontSize: fs });
    return `<path d="${d}" fill="#000000"/>`;
  });

  // SVG tanpa <text> / @font-face sama sekali: hanya <rect> + <path>.
  const svg =
    `<svg width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${s}" height="${s}" fill="#00000000"/>` +
    paths.join('') +
    `</svg>`;

  // Source asli: blur tipis pada lapisan teks; background putih polos
  const textLayer = await sharp(Buffer.from(svg)).blur(0.6).toBuffer();
  return await sharp({
    create: { width: s, height: s, channels: 3, background: '#FFFFFF' },
  })
    .composite([{ input: textLayer, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

module.exports = { renderBrat };
