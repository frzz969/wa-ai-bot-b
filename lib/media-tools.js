// lib/media-tools.js — LANE MEDIA (lokal-first, tanpa API key / trial)
// Pola pakai mengikuti handlers/messages.js:
//   reply gambar  -> downloadBuffer(target, sock) -> fungsi di sini -> sock.sendMessage(jid, {...}, { quoted: m })
//   kirim sticker -> sock.sendMessage(jid, { sticker: webp }, { quoted: m })
//   kirim gambar  -> sock.sendMessage(jid, { image: buf, caption }, { quoted: m })
// Hanya butuh `sharp` (sudah ada di package.json). Tanpa canvas / ffmpeg.

const sharp = require('sharp');

function escapeXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------- toimg ---
// webp (stiker) -> jpg. Dipakai: reply stiker + .toimg => kirim sebagai image.
// Contoh:
//   const { downloadBuffer, wrapQuoted, getQuoted } = require('./media');
//   const q = getQuoted(m); const buf = await downloadBuffer(wrapQuoted(jid, q), sock);
//   const jpg = await toimg(buf);
//   await sock.sendMessage(jid, { image: jpg, caption: '🖼️ toimg' }, { quoted: m });
async function webpToJpg(buffer) {
  return await sharp(buffer).jpeg({ quality: 92 }).toBuffer();
}
const toimg = webpToJpg;

// ------------------------------------------------------------- stickerwm ---
// Sisakan EXIF packname/author ke stiker webp agar terbaca di WA.
// Contoh:
//   const { imageToSticker } = require('./sticker');
//   const webp = await imageToSticker(buf);
//   const signed = stickerwm(webp, 'SONEZZ', 'wa-ai-bot-b');
//   await sock.sendMessage(jid, { sticker: signed }, { quoted: m });
function addStickerExif(webpBuffer, packname, author) {
  const json = {
    'sticker-pack-id': 'lane-media',
    'sticker-pack-name': String(packname || 'SONEZZ'),
    'sticker-pack-publisher': String(author || 'wa-ai-bot-b'),
    emojis: [''],
  };
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  // Header EXIF little-endian + IFD palsu menunjuk ke blob JSON (pola umum wa-sticker).
  const exifAttr = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ]);
  const exif = Buffer.concat([exifAttr, jsonBuf]);
  exif.writeUIntLE(jsonBuf.length, 14, 4);

  const head = webpBuffer.subarray(0, 12); // RIFF....WEBP
  const body = webpBuffer.subarray(12);
  const chunkHead = Buffer.alloc(8);
  chunkHead.write('EXIF', 0);
  chunkHead.writeUInt32LE(exif.length, 4);
  let chunk = Buffer.concat([chunkHead, exif]);
  if (chunk.length % 2 === 1) chunk = Buffer.concat([chunk, Buffer.from([0])]);
  const out = Buffer.concat([head, chunk, body]);
  out.writeUInt32LE(out.length - 8, 4); // perbarui ukuran RIFF
  return out;
}

// Gambar apa pun -> stiker webp 512 + watermark pack/author.
// Contoh:
//   const signed = await stickerWithWM(buf, 'SONEZZ', 'bot');
//   await sock.sendMessage(jid, { sticker: signed }, { quoted: m });
async function stickerWithWM(buffer, packname, author) {
  const webp = await sharp(buffer)
    .resize(512, 512, { fit: 'cover', position: 'centre' })
    .webp({ quality: 90, effort: 6 })
    .toBuffer();
  return addStickerExif(webp, packname, author);
}
const stickerwm = stickerWithWM;

// ------------------------------------------------------- attp / ttp ---
// Render teks -> PNG via SVG + sharp (LOKAL, tanpa API key).
// attp: teks putih + outline di atas background gelap (gaya animated-text thumbnail).
// ttp:  teks hitam di atas background putih.
// Jika ingin fallback API gratis (tanpa key), isi env ATTP_API_URL / TTP_API_URL
// dengan endpoint yang menerima ?text=... lalu panggil attpRemote()/ttpRemote().
// Contoh lokal:
//   const png = await attp('halo bang');
//   await sock.sendMessage(jid, { sticker: await stickerWithWM(png, 'ATTP', 'bot') }, { quoted: m });
//   // atau kirim sebagai gambar:
//   await sock.sendMessage(jid, { image: await ttp('halo'), caption: 'ttp' }, { quoted: m });

function wrapWords(text, maxChars = 12) {
  const words = String(text || '...').split(/\s+/).filter(Boolean).slice(0, 20);
  if (!words.length) return ['...'];
  const lines = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? cur + ' ' + w : w;
    if (trial.length <= maxChars) {
      cur = trial;
    } else {
      if (cur) lines.push(cur);
      cur = w.length > maxChars ? w.slice(0, maxChars) : w;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 6);
}

async function renderTextPng(text, opts) {
  const o = Object.assign(
    { w: 512, h: 256, bg: '#111111', fg: '#ffffff', stroke: '#000000', fontSize: 64 },
    opts || {}
  );
  const lines = wrapWords(text);
  const lh = o.fontSize * 1.12;
  const startY = o.h / 2 - ((lines.length - 1) * lh) / 2;
  const tspans = lines
    .map((ln, i) => {
      const y = (startY + i * lh).toFixed(1);
      return `<text x="${o.w / 2}" y="${y}" text-anchor="middle" dominant-baseline="middle" ` +
        `font-family="Arial, Helvetica, sans-serif" font-size="${o.fontSize}" font-weight="bold" ` +
        `fill="${o.fg}" stroke="${o.stroke}" stroke-width="2">${escapeXml(ln)}</text>`;
    })
    .join('');
  const svg =
    `<svg width="${o.w}" height="${o.h}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${o.w}" height="${o.h}" fill="${o.bg}"/>${tspans}</svg>`;
  return await sharp(Buffer.from(svg)).png().toBuffer();
}

async function attp(text) {
  return await renderTextPng(text, { bg: '#7c3aed', fg: '#ffffff', stroke: '#2e1065', fontSize: 64 });
}

async function ttp(text) {
  return await renderTextPng(text, { bg: '#ffffff', fg: '#111111', stroke: '#ffffff', fontSize: 64 });
}

// Fallback API gratis (opsional, tanpa key): hanya dipakai bila env diset.
async function fetchRemotePng(envName, text) {
  const base = process.env[envName];
  if (!base) throw new Error(envName + ' belum diset');
  const url = base + encodeURIComponent(String(text || '...'));
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error('Remote ' + envName + ' HTTP ' + res.status);
  return Buffer.from(await res.arrayBuffer());
}
async function attpRemote(text) {
  return await fetchRemotePng('ATTP_API_URL', text);
}
async function ttpRemote(text) {
  return await fetchRemotePng('TTP_API_URL', text);
}

// -------------------------------------------------------------- triggered ---
// Efek "TRIGGERED" ala meme: tint merah + bingkai merah + label bawah.
// sharp tidak menulis GIF animasi multi-frame, jadi output = 1 frame GIF
// (valid dikirim sebagai image/sticker). Tanpa canvas/ffmpeg.
// Contoh:
//   const buf = await downloadBuffer(target, sock); // reply gambar / foto profil
//   const gif = await triggered(buf);
//   await sock.sendMessage(jid, { image: gif, caption: '⚡ TRIGGERED' }, { quoted: m });
async function triggered(buffer) {
  const S = 256;
  const base = await sharp(buffer).resize(S, S, { fit: 'cover', position: 'centre' }).toBuffer();
  const overlay =
    `<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${S}" height="${S}" fill="#ff0000" fill-opacity="0.35"/>` +
    `<rect x="4" y="4" width="${S - 8}" height="${S - 8}" fill="none" stroke="#ff0000" stroke-width="14"/>` +
    `<rect x="0" y="${S - 52}" width="${S}" height="52" fill="#ff0000"/>` +
    `<text x="${S / 2}" y="${S - 26}" text-anchor="middle" dominant-baseline="middle" ` +
    `font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="bold" fill="#ffffff">TRIGGERED</text>` +
    `</svg>`;
  return await sharp(base)
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .gif()
    .toBuffer();
}

// -------------------------------------------------------------- emojitopng ---
// Emoji -> PNG via aset lokal assets/emoji-iphone/* (mapping di lib/iqc.js).
// Catatan: hanya emoji yang terpetakan di iqc.js yang didukung.
// Contoh:
//   const png = await emojitopng('😭');
//   await sock.sendMessage(jid, { image: png, caption: 'emoji' }, { quoted: m });
async function emojiToPng(emoji, size) {
  const fs = require('fs');
  const path = require('path');
  const target = Math.max(128, Number(size) || 512);
  const e = String(emoji || '').trim().split(/\s+/)[0];
  if (!e) throw new Error('emojitopng: emoji kosong');
  const esc = e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const src = fs.readFileSync(path.join(__dirname, 'iqc.js'), 'utf8');
  const re = new RegExp("'" + esc + "'\\s*:\\s*'\\.\\./assets/emoji-iphone/([^']+)'");
  const m = src.match(re);
  if (!m) throw new Error('emojitopng: emoji "' + e + '" belum tersedia di lib/iqc.js');
  const file = path.join(__dirname, '..', 'assets', 'emoji-iphone', m[1]);
  if (!fs.existsSync(file)) throw new Error('emojitopng: aset tidak ditemukan: ' + m[1]);
  return await sharp(file)
    .resize(target, target, { fit: 'contain', kernel: sharp.kernel.lanczos3, withoutEnlargement: false })
    .png()
    .toBuffer();
}
const emojitopng = emojiToPng;

module.exports = {
  toimg,
  webpToJpg,
  stickerwm,
  stickerWithWM,
  addStickerExif,
  attp,
  ttp,
  attpRemote,
  ttpRemote,
  triggered,
  emojitopng,
  emojiToPng,
};
