// plugins/fun/18-fake.js — Paket stiker + PP couple + fake-generator + ephoto (render LOKAL).
//
// Ter-load otomatis via lib/plugin-loader.js (file baru langsung kepanggil,
// TANPA ubah handlers/menu.js). Kontrak: async (ctx) => boolean,
// ctx = { sock, m, jid, sender, body, cmd, args, prefix }.
// Pola reply-media + konversi stiker mengikuti plugins/ai/03-sticker.js,
// render SVG + sharp mengikuti lib/media-tools.js (tanpa dependensi baru).
//
// Command yang JALAN di file ini:
//   .stickerpack [url ...]  (alias: .spack) — maks 5 gambar -> stiker satu per satu
//   .ppcouple               (alias: .ppcp)  — sepasang PP couple (render lokal)
//   .fakeig/.faketwit/.fakestory/.fakenotif/.fakedana/.fakegc — meme "parodi"
//   .ephoto <gaya>|<teks>   — 5 gaya teks lokal (neon/gold/glitch/lava/ocean)
// SENGAJA TIDAK diimplementasikan di sini:
//   .ttp/.attp -> SUDAH ADA di plugins/ai/03-sticker.js (mediaTools.ttp/attp)
//   scraper photooxy/textpro -> dilarang soal; diganti gaya lokal .ephoto
const sharp = require('sharp');
const S = require('../../handlers/state');
const {
  safeReply,
  interim,
  imageToSticker,
  downloadBuffer,
  getQuoted,
  wrapQuoted,
} = S;

const MAX_PACK = 5;
const FONT = 'Arial, Helvetica, DejaVu Sans, sans-serif';

// ---------------------------------------------------------------- util ---
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isURL(s) {
  try {
    const u = new URL(String(s || '').trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function wrapLines(text, maxChars = 12, maxLines = 6) {
  const words = String(text || '...').split(/\s+/).filter(Boolean).slice(0, 60);
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
  return lines.slice(0, maxLines);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function initials(name) {
  const w = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  if (w.length === 1) return w[0].slice(0, 2).toUpperCase();
  return (w[0][0] + w[1][0]).toUpperCase();
}

function nowHM() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}.${p(d.getMinutes())}`;
}

async function svgPng(svg) {
  return await sharp(Buffer.from(svg)).png().toBuffer();
}

async function fetchImageBuffer(url) {
  const res = await fetch(String(url), {
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) throw new Error('file terlalu kecil');
  return buf;
}

// Hati sederhana (path, tanpa font emoji) dalam kotak 100x100.
const HEART_D = 'M50 88 C20 62 8 44 8 30 C8 16 18 8 28 8 C38 8 46 14 50 24 C54 14 62 8 72 8 C82 8 92 16 92 30 C92 44 80 62 50 88 Z';
function heart(x, y, s, fill, stroke, sw) {
  const k = s / 100;
  return `<path d="${HEART_D}" transform="translate(${x} ${y}) scale(${k.toFixed(3)})" ` +
    `fill="${fill}" stroke="${stroke || 'none'}" stroke-width="${sw || 0}"/>`;
}

function checkPath(x, y, s, color, w) {
  return `<path d="M ${x} ${y + s * 0.55} L ${x + s * 0.4} ${y + s * 0.9} L ${x + s * 1.1} ${y}" ` +
    `fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// Watermark wajib "parodi" di tiap gambar fake.
function parodiMark(x, y, size) {
  return `<text x="${x}" y="${y}" text-anchor="end" font-family="${FONT}" ` +
    `font-size="${size || 20}" fill="#9aa0a6">parodi</text>`;
}

function avatarCircle(cx, cy, r, c1, c2, label, gid) {
  return `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>` +
    `</linearGradient></defs>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${gid})"/>` +
    `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" ` +
    `font-family="${FONT}" font-size="${Math.round(r * 0.95)}" font-weight="bold" fill="#ffffff">${esc(label)}</text>`;
}

const GRAD_PAIRS = [
  ['#7c3aed', '#ec4899'], ['#0ea5e9', '#6366f1'], ['#f59e0b', '#ef4444'],
  ['#10b981', '#0ea5e9'], ['#ec4899', '#f97316'], ['#8b5cf6', '#06b6d4'],
  ['#ef4444', '#7c2d12'], ['#14b8a6', '#84cc16'],
];

// ------------------------------------------------------- 1. stickerpack ---
async function cmdStickerpack(sock, m, jid, args, prefix) {
  const rawParts = String(args || '').split(/\s+/).filter(Boolean);
  const urls = rawParts.filter(isURL).slice(0, MAX_PACK);

  // Kumpulkan sumber gambar: media WA (kirim/reply) + URL, dibatasi 5.
  const jobs = []; // { label, run() -> Buffer }
  const currentImg = m.message?.imageMessage;
  const quoted = getQuoted(m);
  const quotedImg = quoted?.quotedMessage?.imageMessage;
  if (currentImg) jobs.push({ label: 'gambar terkirim', run: () => downloadBuffer(m, sock) });
  if (quotedImg && jobs.length < MAX_PACK) {
    jobs.push({ label: 'gambar reply', run: () => downloadBuffer(wrapQuoted(jid, quoted), sock) });
  }
  for (const u of urls) {
    if (jobs.length >= MAX_PACK) break;
    jobs.push({ label: u.slice(0, 60), run: () => fetchImageBuffer(u) });
  }

  if (!jobs.length) {
    await safeReply(
      sock, jid,
      `Cara pakai:\n` +
      `• kirim/reply gambar + ${prefix}stickerpack\n` +
      `• ${prefix}stickerpack <url1> <url2> ... (maks ${MAX_PACK})\n` +
      `Contoh: ${prefix}stickerpack https://contoh.com/a.jpg https://contoh.com/b.png`,
      m
    );
    return true;
  }

  await interim(sock, jid, m, `⏳ Bikin ${jobs.length} stiker...`);
  let ok = 0;
  const gagal = [];
  for (const job of jobs) {
    try {
      const buf = await job.run();
      const webp = await imageToSticker(buf); // reuse lib/sticker.js
      await sock.sendMessage(jid, { sticker: webp }, { quoted: m });
      ok++;
    } catch (e) {
      console.error('stickerpack', job.label, e?.message || e);
      gagal.push(job.label);
    }
  }
  if (gagal.length) {
    await safeReply(sock, jid, `✅ Jadi ${ok}/${jobs.length} stiker.\n❌ Gagal: ${gagal.join(', ').slice(0, 300)}`, m);
  } else if (jobs.length > 1) {
    await safeReply(sock, jid, `✅ Jadi ${ok} stiker.`, m);
  }
  return true;
}

// ---------------------------------------------------------- 2. ppcouple ---
async function cmdPpcouple(sock, m, jid) {
  await interim(sock, jid, m, '💑 Lagi nyiapin PP couple...');
  try {
    const [c1, c2] = pick(GRAD_PAIRS);
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const i1 = A[Math.floor(Math.random() * 26)];
    let i2 = A[Math.floor(Math.random() * 26)];
    if (i2 === i1) i2 = A[(A.indexOf(i1) + 7) % 26];
    const W = 1024;
    const H = 512;
    const svg =
      `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
      `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>` +
      `</linearGradient></defs>` +
      `<rect width="${W}" height="${H}" fill="url(#bg)"/>` +
      `<circle cx="${W / 2}" cy="${H / 2}" r="150" fill="#ffffff" fill-opacity="0.22"/>` +
      `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" dominant-baseline="middle" ` +
      `font-family="${FONT}" font-size="120" font-weight="bold" fill="#ffffff">&amp;</text>` +
      `<text x="256" y="300" text-anchor="middle" dominant-baseline="middle" ` +
      `font-family="${FONT}" font-size="150" font-weight="bold" fill="#ffffff">${i1}</text>` +
      `<text x="768" y="300" text-anchor="middle" dominant-baseline="middle" ` +
      `font-family="${FONT}" font-size="150" font-weight="bold" fill="#ffffff">${i2}</text>` +
      `<text x="${W - 16}" y="${H - 14}" text-anchor="end" font-family="${FONT}" font-size="20" fill="#ffffff" fill-opacity="0.8">parodi</text>` +
      `</svg>`;
    const full = await svgPng(svg);
    const left = await sharp(full).extract({ left: 0, top: 0, width: 512, height: 512 }).png().toBuffer();
    const right = await sharp(full).extract({ left: 512, top: 0, width: 512, height: 512 }).png().toBuffer();
    await sock.sendMessage(jid, { image: left, caption: `💑 PP couple (${i1}) — pasang bareng si ${i2} ya` }, { quoted: m });
    await sock.sendMessage(jid, { image: right, caption: `💑 PP couple (${i2})` }, { quoted: m });
  } catch (e) {
    console.error('ppcouple', e?.message || e);
    await safeReply(sock, jid, '❌ Gagal membuat PP couple. Coba lagi ya.', m);
  }
  return true;
}

// ---------------------------------------------------- 4. fake generator ---
function renderFakeig(nama, caption, likes) {
  const W = 720;
  const capLines = wrapLines(`${nama}: ${caption}`, 42, 4);
  const H = 130 + 460 + 84 + 44 + capLines.length * 38 + 60;
  const [c1, c2] = pick(GRAD_PAIRS);
  const ini = initials(nama);
  let y = 0;
  const photoY = 130;
  const actY = photoY + 460;
  const likeY = actY + 84;
  let capY = likeY + 44;
  const capSvg = capLines.map((ln) => {
    const t = `<text x="36" y="${capY}" font-family="${FONT}" font-size="28" fill="#111111">${esc(ln)}</text>`;
    capY += 38;
    return t;
  }).join('');
  const svg =
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${W}" height="${H}" fill="#ffffff"/>` +
    avatarCircle(64, 65, 34, c1, c2, ini, 'fig') +
    `<text x="112" y="58" font-family="${FONT}" font-size="30" font-weight="bold" fill="#111111">${esc(nama)}</text>` +
    `<text x="112" y="92" font-family="${FONT}" font-size="24" fill="#6b7280">Original audio</text>` +
    `<text x="${W - 36}" y="72" text-anchor="end" font-family="${FONT}" font-size="34" font-weight="bold" fill="#111111">...</text>` +
    `<defs><linearGradient id="figph" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>` +
    `<rect x="0" y="${photoY}" width="${W}" height="460" fill="url(#figph)"/>` +
    `<text x="${W / 2}" y="${photoY + 250}" text-anchor="middle" dominant-baseline="middle" ` +
    `font-family="${FONT}" font-size="220" font-weight="bold" fill="#ffffff" fill-opacity="0.35">${esc(ini)}</text>` +
    heart(36, actY + 8, 44, 'none', '#111111', 5) +
    `<circle cx="132" cy="${actY + 30}" r="20" fill="none" stroke="#111111" stroke-width="5"/>` +
    `<path d="M 176 ${actY + 46} L 216 ${actY + 8} L 186 ${actY + 30} Z" fill="none" stroke="#111111" stroke-width="5"/>` +
    `<rect x="${W - 76}" y="${actY + 8}" width="30" height="44" fill="none" stroke="#111111" stroke-width="5"/>` +
    `<text x="36" y="${likeY}" font-family="${FONT}" font-size="28" font-weight="bold" fill="#111111">${esc(likes)} likes</text>` +
    capSvg +
    parodiMark(W - 24, H - 18, 20) +
    `</svg>`;
  return svgPng(svg);
}

function renderFaketwit(nama, username, teks, likes, rt) {
  const W = 720;
  const lines = wrapLines(teks, 40, 6);
  const H = 130 + lines.length * 42 + 70 + 70;
  const [c1, c2] = pick(GRAD_PAIRS);
  let ty = 150;
  const body = lines.map((ln) => {
    const t = `<text x="36" y="${ty}" font-family="${FONT}" font-size="30" fill="#111111">${esc(ln)}</text>`;
    ty += 42;
    return t;
  }).join('');
  const statY = ty + 30;
  const svg =
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${W}" height="${H}" fill="#ffffff"/>` +
    avatarCircle(64, 62, 32, c1, c2, initials(nama), 'ftw') +
    `<text x="108" y="56" font-family="${FONT}" font-size="30" font-weight="bold" fill="#111111">${esc(nama)}</text>` +
    `<text x="108" y="94" font-family="${FONT}" font-size="25" fill="#6b7280">@${esc(username)} . 1h</text>` +
    `<text x="${W - 36}" y="66" text-anchor="end" font-family="${FONT}" font-size="32" font-weight="bold" fill="#6b7280">...</text>` +
    body +
    `<line x1="36" y1="${statY - 34}" x2="${W - 36}" y2="${statY - 34}" stroke="#e5e7eb" stroke-width="2"/>` +
    `<text x="36" y="${statY + 8}" font-family="${FONT}" font-size="26" font-weight="bold" fill="#111111">${esc(rt)} <tspan fill="#6b7280" font-weight="normal">Retweets</tspan>   ${esc(likes)} <tspan fill="#6b7280" font-weight="normal">Likes</tspan></text>` +
    parodiMark(W - 24, H - 16, 20) +
    `</svg>`;
  return svgPng(svg);
}

function renderFakestory(nama, teks) {
  const W = 540;
  const H = 960;
  const [c1, c2] = pick(GRAD_PAIRS);
  const lines = wrapLines(teks, 18, 5);
  const fs = lines.length > 3 ? 44 : 56;
  const lh = fs * 1.25;
  let ty = H / 2 - ((lines.length - 1) * lh) / 2;
  const body = lines.map((ln) => {
    const t = `<text x="${W / 2}" y="${ty.toFixed(0)}" text-anchor="middle" dominant-baseline="middle" ` +
      `font-family="${FONT}" font-size="${fs}" font-weight="bold" fill="#ffffff" stroke="#000000" stroke-width="1">${esc(ln)}</text>`;
    ty += lh;
    return t;
  }).join('');
  const svg =
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><linearGradient id="fst" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#fst)"/>` +
    `<rect x="20" y="20" width="${W - 40}" height="8" rx="4" fill="#ffffff" fill-opacity="0.35"/>` +
    `<rect x="20" y="20" width="${Math.round((W - 40) * 0.6)}" height="8" rx="4" fill="#ffffff"/>` +
    avatarCircle(56, 68, 24, '#ffffff', '#e5e7eb', initials(nama), 'fst') +
    `<text x="90" y="62" font-family="${FONT}" font-size="26" font-weight="bold" fill="#ffffff">${esc(nama)}</text>` +
    `<text x="90" y="92" font-family="${FONT}" font-size="22" fill="#ffffff" fill-opacity="0.8">2h</text>` +
    body +
    `<rect x="20" y="${H - 90}" width="${W - 140}" height="60" rx="30" fill="none" stroke="#ffffff" stroke-width="3"/>` +
    `<text x="48" y="${H - 52}" font-family="${FONT}" font-size="24" fill="#ffffff">Send message</text>` +
    heart(W - 88, H - 80, 40, 'none', '#ffffff', 4) +
    parodiMark(W - 16, H - 100, 18) +
    `</svg>`;
  return svgPng(svg);
}

function renderFakenotif(app, judul, isi) {
  const W = 720;
  const lines = wrapLines(isi, 44, 4);
  const H = 170 + lines.length * 36 + 70;
  const ini = esc(String(app || 'A').trim().charAt(0).toUpperCase() || 'A');
  let by = 190;
  const body = lines.map((ln) => {
    const t = `<text x="48" y="${by}" font-family="${FONT}" font-size="27" fill="#374151">${esc(ln)}</text>`;
    by += 36;
    return t;
  }).join('');
  const svg =
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${W}" height="${H}" fill="#111827"/>` +
    `<rect x="24" y="24" width="${W - 48}" height="${H - 48}" rx="28" fill="#ffffff"/>` +
    `<rect x="48" y="52" width="64" height="64" rx="16" fill="#2563eb"/>` +
    `<text x="80" y="94" text-anchor="middle" dominant-baseline="middle" font-family="${FONT}" font-size="34" font-weight="bold" fill="#ffffff">${ini}</text>` +
    `<text x="128" y="78" font-family="${FONT}" font-size="24" fill="#6b7280">${esc(String(app).toUpperCase())}</text>` +
    `<text x="${W - 48}" y="78" text-anchor="end" font-family="${FONT}" font-size="24" fill="#6b7280">now</text>` +
    `<text x="48" y="152" font-family="${FONT}" font-size="29" font-weight="bold" fill="#111111">${esc(judul)}</text>` +
    body +
    parodiMark(W - 44, H - 40, 19) +
    `</svg>`;
  return svgPng(svg);
}

function renderFakedana(nama, nominal, status) {
  const W = 720;
  const H = 880;
  const st = status || 'Berhasil';
  const svg =
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${W}" height="${H}" fill="#f2f4f7"/>` +
    `<rect width="${W}" height="210" fill="#108EE9"/>` +
    `<text x="48" y="110" font-family="${FONT}" font-size="52" font-weight="bold" fill="#ffffff">DANA</text>` +
    `<text x="48" y="158" font-family="${FONT}" font-size="26" fill="#ffffff">Bukti Transaksi</text>` +
    `<rect x="48" y="250" width="${W - 96}" height="520" rx="24" fill="#ffffff"/>` +
    `<circle cx="${W / 2}" cy="350" r="52" fill="#22c55e"/>` +
    checkPath(W / 2 - 28, 322, 56, '#ffffff', 10) +
    `<text x="${W / 2}" y="440" text-anchor="middle" font-family="${FONT}" font-size="32" font-weight="bold" fill="#111111">Pembayaran ${esc(st)}</text>` +
    `<text x="${W / 2}" y="505" text-anchor="middle" font-family="${FONT}" font-size="52" font-weight="bold" fill="#111111">${esc(nominal)}</text>` +
    `<line x1="96" y1="545" x2="${W - 96}" y2="545" stroke="#e5e7eb" stroke-width="2"/>` +
    `<text x="96" y="595" font-family="${FONT}" font-size="27" fill="#6b7280">Ke</text>` +
    `<text x="${W - 96}" y="595" text-anchor="end" font-family="${FONT}" font-size="27" font-weight="bold" fill="#111111">${esc(nama)}</text>` +
    `<text x="96" y="645" font-family="${FONT}" font-size="27" fill="#6b7280">Status</text>` +
    `<text x="${W - 96}" y="645" text-anchor="end" font-family="${FONT}" font-size="27" font-weight="bold" fill="#16a34a">${esc(st)}</text>` +
    `<text x="96" y="695" font-family="${FONT}" font-size="27" fill="#6b7280">Waktu</text>` +
    `<text x="${W - 96}" y="695" text-anchor="end" font-family="${FONT}" font-size="27" fill="#111111">${esc(nowHM())}</text>` +
    parodiMark(W - 24, H - 24, 20) +
    `</svg>`;
  return svgPng(svg);
}

function renderFakegc(gname, pengirim, pesan, jam) {
  const W = 720;
  const lines = wrapLines(pesan, 44, 6);
  const H = 110 + 40 + lines.length * 38 + 90 + 50;
  const bY = 150;
  let ty = bY + 62;
  const body = lines.map((ln) => {
    const t = `<text x="80" y="${ty}" font-family="${FONT}" font-size="28" fill="#111111">${esc(ln)}</text>`;
    ty += 38;
    return t;
  }).join('');
  const jamStr = jam || nowHM();
  const svg =
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${W}" height="${H}" fill="#ECE5DD"/>` +
    `<rect width="${W}" height="110" fill="#075E54"/>` +
    `<text x="36" y="70" font-family="${FONT}" font-size="40" fill="#ffffff">&lt;</text>` +
    avatarCircle(120, 55, 32, '#25D366', '#128C7E', initials(pengirim), 'fgc') +
    `<text x="166" y="52" font-family="${FONT}" font-size="30" font-weight="bold" fill="#ffffff">${esc(gname)}</text>` +
    `<text x="166" y="86" font-family="${FONT}" font-size="23" fill="#d1fae5">online</text>` +
    `<rect x="48" y="${bY}" width="${W - 130}" height="${lines.length * 38 + 78}" rx="14" fill="#ffffff"/>` +
    `<text x="80" y="${bY + 36}" font-family="${FONT}" font-size="25" font-weight="bold" fill="#35cd96">${esc(pengirim)}</text>` +
    body +
    `<text x="${W - 130}" y="${ty - 6}" text-anchor="end" font-family="${FONT}" font-size="22" fill="#6b7280">${esc(jamStr)}</text>` +
    checkPath(W - 118, ty - 24, 18, '#53bdeb', 4) +
    checkPath(W - 106, ty - 24, 18, '#53bdeb', 4) +
    parodiMark(W - 20, H - 14, 19) +
    `</svg>`;
  return svgPng(svg);
}

async function cmdFake(sock, m, jid, cmd, args, prefix) {
  const parts = String(args || '').split('|').map((s) => s.trim());
  try {
    if (cmd === 'fakeig') {
      const [nama, caption, likes] = parts;
      if (!nama || !caption) {
        await safeReply(sock, jid, `Contoh: ${prefix}fakeig Furina|caption keren banget|12.345`, m);
        return true;
      }
      await interim(sock, jid, m, '📸 Lagi bikin fake IG...');
      const png = await renderFakeig(nama, caption, likes || '1.234');
      await sock.sendMessage(jid, { image: png, caption: '📸 fake IG (parodi, bukan asli)' }, { quoted: m });
      return true;
    }
    if (cmd === 'faketwit' || cmd === 'faketweet') {
      const [nama, username, teks, likes, rt] = parts;
      if (!nama || !username || !teks) {
        await safeReply(sock, jid, `Contoh: ${prefix}faketwit Furina|furina_fp|halo semua!|5.678|123`, m);
        return true;
      }
      await interim(sock, jid, m, '🐦 Lagi bikin fake tweet...');
      const png = await renderFaketwit(nama, username.replace(/^@/, ''), teks, likes || '1.000', rt || '100');
      await sock.sendMessage(jid, { image: png, caption: '🐦 fake tweet (parodi, bukan asli)' }, { quoted: m });
      return true;
    }
    if (cmd === 'fakestory') {
      const [nama, teks] = parts;
      if (!nama || !teks) {
        await safeReply(sock, jid, `Contoh: ${prefix}fakestory Furina|liburan dulu ga sih`, m);
        return true;
      }
      await interim(sock, jid, m, '📱 Lagi bikin fake story...');
      const png = await renderFakestory(nama, teks);
      await sock.sendMessage(jid, { image: png, caption: '📱 fake story (parodi, bukan asli)' }, { quoted: m });
      return true;
    }
    if (cmd === 'fakenotif') {
      const [app, judul, isi] = parts;
      if (!app || !judul || !isi) {
        await safeReply(sock, jid, `Contoh: ${prefix}fakenotif WhatsApp|Mama|nak, pulang jam berapa?`, m);
        return true;
      }
      await interim(sock, jid, m, '🔔 Lagi bikin fake notif...');
      const png = await renderFakenotif(app, judul, isi);
      await sock.sendMessage(jid, { image: png, caption: '🔔 fake notif (parodi, bukan asli)' }, { quoted: m });
      return true;
    }
    if (cmd === 'fakedana') {
      const [nama, nominal, status] = parts;
      if (!nama || !nominal) {
        await safeReply(sock, jid, `Contoh: ${prefix}fakedana Budi|Rp50.000|Berhasil`, m);
        return true;
      }
      await interim(sock, jid, m, '💸 Lagi bikin fake DANA...');
      const png = await renderFakedana(nama, nominal, status || 'Berhasil');
      await sock.sendMessage(jid, { image: png, caption: '💸 fake bukti transfer (parodi, JANGAN dipakai nipu!)' }, { quoted: m });
      return true;
    }
    if (cmd === 'fakegc') {
      const [gname, pengirim, pesan, jam] = parts;
      if (!gname || !pengirim || !pesan) {
        await safeReply(sock, jid, `Contoh: ${prefix}fakegc Grup Gabut|Budi|besok libur guys|21.30`, m);
        return true;
      }
      await interim(sock, jid, m, '💬 Lagi bikin fake grup...');
      const png = await renderFakegc(gname, pengirim, pesan, jam || '');
      await sock.sendMessage(jid, { image: png, caption: '💬 fake grup chat (parodi, bukan asli)' }, { quoted: m });
      return true;
    }
  } catch (e) {
    console.error(cmd, e?.message || e);
    await safeReply(sock, jid, `❌ Gagal membuat ${cmd}. Coba lagi ya.`, m);
    return true;
  }
  return false;
}

// ------------------------------------------------------------ 5. ephoto ---
// Gaya teks lokal di atas infra SVG+sharp (pengganti scraper photooxy/textpro).
const EPHOTO_STYLES = ['neon', 'gold', 'glitch', 'lava', 'ocean'];

function renderEphoto(style, text) {
  const W = 768;
  const H = 384;
  const lines = wrapLines(text, 10, 3);
  const fs = lines.join(' ').length <= 6 ? 150 : lines.join(' ').length <= 12 ? 110 : 80;
  const lh = fs * 1.15;
  let ty = H / 2 - ((lines.length - 1) * lh) / 2;

  const layer = (extra) => lines.map((ln) => {
    const t = `<text x="${W / 2}" y="${ty.toFixed(0)}" text-anchor="middle" dominant-baseline="middle" ` +
      `font-family="${FONT}" font-size="${fs}" font-weight="bold" ${extra}>${esc(ln)}</text>`;
    ty += lh;
    return t;
  }).join('');
  const reset = () => { ty = H / 2 - ((lines.length - 1) * lh) / 2; };

  let bg = '';
  let fg = '';
  if (style === 'neon') {
    bg = `<rect width="${W}" height="${H}" fill="#0a0a14"/>`;
    reset(); fg = layer('fill="none" stroke="#00e5ff" stroke-width="10" opacity="0.25"');
    reset(); fg += layer('fill="none" stroke="#00e5ff" stroke-width="4" opacity="0.6"');
    reset(); fg += layer('fill="#e8ffff" stroke="#00e5ff" stroke-width="1.5"');
  } else if (style === 'gold') {
    bg = `<rect width="${W}" height="${H}" fill="#1a1207"/>` +
      `<defs><linearGradient id="ephg" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#fff3b0"/><stop offset="0.5" stop-color="#f5b301"/>` +
      `<stop offset="1" stop-color="#8a5a00"/></linearGradient></defs>`;
    reset(); fg = layer('fill="url(#ephg)" stroke="#3d2800" stroke-width="2"');
  } else if (style === 'glitch') {
    bg = `<rect width="${W}" height="${H}" fill="#0d0d0f"/>`;
    const off = Math.round(fs * 0.04);
    reset(); fg = layer(`fill="#ff004c" opacity="0.8" dx="${off}"`);
    reset(); fg += layer(`fill="#00e5ff" opacity="0.8" dx="${off}"`);
    reset(); fg += layer('fill="#ffffff"');
  } else if (style === 'lava') {
    bg = `<rect width="${W}" height="${H}" fill="#140404"/>` +
      `<defs><linearGradient id="ephl" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#ffd23f"/><stop offset="0.55" stop-color="#ff5e00"/>` +
      `<stop offset="1" stop-color="#c1121f"/></linearGradient></defs>`;
    reset(); fg = layer('fill="none" stroke="#ff5e00" stroke-width="8" opacity="0.35"');
    reset(); fg += layer('fill="url(#ephl)" stroke="#3d0000" stroke-width="2"');
  } else { // ocean
    bg = `<defs><linearGradient id="epho" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#012a4a"/><stop offset="1" stop-color="#01497c"/></linearGradient></defs>` +
      `<rect width="${W}" height="${H}" fill="url(#epho)"/>`;
    reset(); fg = layer('fill="#caf0f8" stroke="#ffffff" stroke-width="1.5"');
  }
  const mark = `<text x="${W - 16}" y="${H - 14}" text-anchor="end" font-family="${FONT}" font-size="20" fill="#ffffff" fill-opacity="0.7">parodi</text>`;
  return svgPng(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${bg}${fg}${mark}</svg>`);
}

async function cmdEphoto(sock, m, jid, args, prefix) {
  let gaya = '';
  let teks = '';
  const raw = String(args || '').trim();
  if (raw.includes('|')) {
    const i = raw.indexOf('|');
    gaya = raw.slice(0, i).trim().toLowerCase();
    teks = raw.slice(i + 1).trim();
  } else {
    const sp = raw.indexOf(' ');
    gaya = (sp === -1 ? raw : raw.slice(0, sp)).toLowerCase();
    teks = sp === -1 ? '' : raw.slice(sp + 1).trim();
  }
  if (!EPHOTO_STYLES.includes(gaya) || !teks) {
    await safeReply(
      sock, jid,
      `Gaya: ${EPHOTO_STYLES.join(', ')}\nContoh: ${prefix}ephoto neon|halo bang`,
      m
    );
    return true;
  }
  try {
    await interim(sock, jid, m, '✨ Lagi bikin efek teks...');
    const png = await renderEphoto(gaya, teks);
    await sock.sendMessage(jid, { image: png, caption: `✨ ephoto ${gaya}: ${teks.slice(0, 60)}` }, { quoted: m });
  } catch (e) {
    console.error('ephoto', e?.message || e);
    await safeReply(sock, jid, '❌ Gagal membuat efek teks.', m);
  }
  return true;
}

// ---------------------------------------------------------------- router ---
async function handleFake(ctx) {
  const { sock, m, jid, cmd, args, prefix } = ctx;
  const c = String(cmd || '').toLowerCase();

  if (c === 'stickerpack' || c === 'spack') return await cmdStickerpack(sock, m, jid, args, prefix);
  if (c === 'ppcouple' || c === 'ppcp') return await cmdPpcouple(sock, m, jid);
  if (c === 'fakeig' || c === 'faketwit' || c === 'faketweet' || c === 'fakestory' ||
      c === 'fakenotif' || c === 'fakedana' || c === 'fakegc') {
    return await cmdFake(sock, m, jid, c === 'faketweet' ? 'faketwit' : c, args, prefix);
  }
  if (c === 'ephoto') return await cmdEphoto(sock, m, jid, args, prefix);

  return false;
}

module.exports = { handleFake };
