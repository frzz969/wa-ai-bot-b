// lib/jere-util.js — Util port dari jere-md (plugins/search|news|tools|info|group|mlbb|freefire|events|owner).
//
// ATURAN:
// - File BARU, standalone. TIDAK di-wire ke router/handler mana pun dari sini.
// - Semua call Jere API lewat `jereGet` dari ./jere-api.js (key diurus di sana, JANGAN log key).
// - CommonJS, tanpa dependensi baru (hanya node built-in + fetch/FormData bawaan Node >= 18).
// - SENGAJA TIDAK DIIMPLEMENTASIKAN: spamotp, spamngl, spam tempmail/OTP/NGL.
//   `tempmail` hanya dicatat sebagai CATATAN (lihat TEMPMAIL_NOTE), tanpa fungsi create/check/inbox.
//
// Sumber pola (jere-md_with_autofollow / "jere-md with jereapi", ESM + global.web/global.apikey):
//   plugins/search/*.js  -> GET ${global.web}/api/search/*?apikey=...
//   plugins/news/*.js     -> GET ${global.web}/api/news/{cnbc,kompas,liputan6}?apikey=...
//   plugins/tools/*.js    -> campuran Jere API (/api/tools/*) + servis publik (tinyurl/is.gd)
//   plugins/info/*.js     -> speed/os/totalchat/cekplugins (lokal)
//   plugins/group/*.js    -> mute/delete/security/settings/setppgc (pola Baileys, murni helper)
//   plugins/mlbb/*.js     -> GET ${global.web}/api/mlbb/{tier,counter,synergy}
//   plugins/freefire/*.js -> GET ${global.web}/api/freefire/stalk?apikey=&id=
//   plugins/events/autosholat.js -> pencocokan jam HH:MM zona Asia/Jakarta
//   plugins/owner/*.js    -> untuk eval/exec/restart/backup*/plugin/join/swgc HANYA helper
//                            file/util murni (tanpa child_process, tanpa eval, tanpa kirim pesan).

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { jereGet } = require('./jere-api');

// ---------------------------------------------------------------------------
// Util kecil (murni, tanpa I/O jaringan)
// ---------------------------------------------------------------------------

function requireText(value, label = 'Query') {
  const s = String(value == null ? '' : value).trim();
  if (!s) throw new Error(`${label} kosong.`);
  return s;
}

function toArrayList(result) {
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object') {
    if (Array.isArray(result.pins)) return result.pins;
    if (Array.isArray(result.tracks)) return result.tracks;
    if (Array.isArray(result.items)) return result.items;
  }
  return [];
}

function pickFirstImageUrl(items, keys = ['image', 'thumbnail', 'imageUrl', 'cover', 'icon']) {
  for (const it of items || []) {
    if (!it || typeof it !== 'object') continue;
    for (const k of keys) {
      const v = it[k];
      if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v;
    }
    if (it.album && Array.isArray(it.album.images)) {
      const u = it.album.images[0] && it.album.images[0].url;
      if (typeof u === 'string' && /^https?:\/\//i.test(u)) return u;
    }
  }
  return '';
}

function normalizeHttpUrl(value, label = 'URL') {
  let s = String(value == null ? '' : value).trim();
  if (!s) throw new Error(`${label} kosong.`);
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad-proto');
    return u.toString();
  } catch {
    throw new Error(`${label} harus berupa link http/https yang valid.`);
  }
}

function msToDurationText(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h} jam${m > 0 ? ` ${m} menit` : ''}`;
  return `${m} menit`;
}

// ---------------------------------------------------------------------------
// SEARCH — pola GET /api/search/* (lihat plugins/search/*.js)
// ---------------------------------------------------------------------------

async function jereYts(query, limit = 7) {
  const q = requireText(query, 'Kata kunci YouTube');
  const result = await jereGet('/api/search/youtube', { q });
  const videos = Array.isArray(result) ? result : (result.videos || result.result || result.data || []);
  return Array.isArray(videos) ? videos.slice(0, limit) : [];
}

function formatYtsCaption(query, videos) {
  let out = `🎬 *YOUTUBE SEARCH RESULTS*\n🔍 *Query:* ${query}\n\n`;
  (videos || []).forEach((v, i) => {
    out += `*${i + 1}. ${v.title || '-'}*\n`;
    if (v.channel || v.author) out += `• 👤 *Channel:* ${v.channel || v.author}\n`;
    if (v.duration) out += `• ⏱️ *Durasi:* ${v.duration}\n`;
    if (v.link || v.url) out += `• 🔗 *Link:* ${v.link || v.url}\n`;
    out += `\n`;
  });
  out += `✨ *Ketik .ytmp3 <link> atau .ytmp4 <link> untuk mendownload!*`;
  return out.trim();
}

async function jereSpotifySearch(query, limit = 5) {
  const q = requireText(query, 'Kata kunci Spotify');
  const result = await jereGet('/api/search/spotify', { query: q });
  const tracks = (result && result.tracks) || result.result || result.data || result || [];
  return Array.isArray(tracks) ? tracks.slice(0, limit) : [];
}

function formatSpotifyCaption(query, tracks) {
  let out = `🎧 *HASIL PENCARIAN SPOTIFY*\n🔍 *Query:* ${query}\n\n`;
  (tracks || []).forEach((t, i) => {
    const durSec = Math.round(((t.duration_ms || 0)) / 1000);
    const durStr = `${Math.floor(durSec / 60)}:${String(durSec % 60).padStart(2, '0')}`;
    const artists = Array.isArray(t.artists) ? t.artists.map((a) => a.name).join(', ') : (t.artist || '-');
    out += `*${i + 1}. ${t.name || t.title || '-'}*\n`;
    out += `• 👤 *Artis:* ${artists || '-'}\n`;
    out += `• 💿 *Album:* ${(t.album && t.album.name) || t.album || '-'}\n`;
    out += `• ⏱️ *Durasi:* ${durStr}\n`;
    if (t.url) out += `• 🔗 *Link:* ${t.url}\n`;
    out += `\n`;
  });
  out += `✨ *Spotify Search*`;
  return out.trim();
}

function isPinterestUrl(text) {
  return /https?:\/\/(www\.)?(id\.)?(pinterest\.(com|co\.[a-z]{2}|[a-z]{2})|pin\.it)/i.test(String(text || ''));
}

async function jerePinSearch(query, limit = 25) {
  const q = requireText(query, 'Kata kunci Pinterest');
  const result = await jereGet('/api/search/pin', { q, limit });
  const pins = result.pins || result.result || result.data || result || [];
  return Array.isArray(pins) ? pins : [];
}

async function jerePinDownload(pinterestUrl) {
  const url = normalizeHttpUrl(pinterestUrl, 'URL Pinterest');
  if (!isPinterestUrl(url)) throw new Error('Bukan link Pinterest yang valid.');
  return jereGet('/api/downloader/pin', { url });
}

async function jereWallpaper(query) {
  const result = await jereGet('/api/search/wallpaper', { query: String(query || '') });
  const list = Array.isArray(result) ? result : (result.result || result.data || []);
  if (!Array.isArray(list) || !list.length) throw new Error('Wallpaper tidak ditemukan.');
  return list[Math.floor(Math.random() * list.length)];
}

function formatWallpaperCaption(w) {
  let caption = `🖼️ *HD WALLPAPER SEARCH*\n\n`;
  if (w.title) caption += `📌 *Judul:* ${w.title}\n`;
  if (w.resolution) caption += `📐 *Resolusi:* ${w.resolution}\n`;
  if (w.category) caption += `🏷️ *Kategori:* ${w.category}\n`;
  if (w.source) caption += `🔗 *Sumber:* ${w.source}\n`;
  caption += `\n✨ *Wallhaven High Resolution Wallpapers*`;
  return caption.trim();
}

async function jereCuaca(kota) {
  const k = requireText(kota, 'Nama kota');
  return jereGet('/api/search/cuaca', { kota: k });
}

function formatCuacaCaption(r) {
  const src = r && typeof r === 'object' ? r : {};
  let out = `🌤️ *INFORMASI CUACA TERKINI*\n\n`;
  out += `📍 *Wilayah:* ${src.lokasi?.kota || '-'}, ${src.lokasi?.provinsi_wilayah || '-'} (${src.lokasi?.negara || 'Indonesia'})\n`;
  out += `🕒 *Waktu:* ${src.cuaca_saat_ini?.waktu_pengamatan || '-'} (${src.cuaca_saat_ini?.waktu_hari || 'Hari'})\n\n`;
  out += `🌡️ *Suhu:* ${src.cuaca_saat_ini?.suhu || '-'}\n`;
  out += `☁️ *Kondisi:* ${src.cuaca_saat_ini?.kondisi || '-'}\n`;
  out += `💧 *Kelembaban:* ${src.cuaca_saat_ini?.kelembaban || '-'}\n`;
  out += `💨 *Kecepatan Angin:* ${src.cuaca_saat_ini?.kecepatan_angin || '-'} (Arah ${src.cuaca_saat_ini?.arah_angin || '-'})\n\n`;
  if (Array.isArray(src.prakiraan_cuaca_7_hari) && src.prakiraan_cuaca_7_hari.length) {
    out += `📅 *Prakiraan Cuaca Mendatang:*\n`;
    src.prakiraan_cuaca_7_hari.slice(0, 5).forEach((f) => {
      out += `• *📅 ${f.tanggal}:* ${f.cuaca} (${f.suhu_minimum} s/d ${f.suhu_maksimum})\n`;
    });
    out += `\n`;
  }
  out += `✨ *JereAPI Weather Service*`;
  return out.trim();
}

async function jereBmkg(kota = '') {
  // jere-md memakai POST { kota }; di sini dipakai GET ?kota= yang setara untuk read-only.
  const result = await jereGet('/api/search/bmkg', { kota: String(kota || '') });
  return Array.isArray(result) ? result : (result.data || result.result || []);
}

function formatBmkgCaption(filter, list, total) {
  const rows = (list || []).slice(0, 10);
  let out = `🌤️ *INFORMASI CUACA BMKG HARI INI*\n`;
  if (filter) out += `🔍 *Filter Wilayah:* ${filter}\n`;
  out += `📊 *Total Data:* ${total || (list || []).length} Wilayah\n\n`;
  rows.forEach((item) => {
    out += `*📍 ${item.kota || '-'}*\n`;
    out += `• ☁️ *Cuaca:* ${item.cuaca || '-'}\n`;
    out += `• 🌡️ *Suhu:* ${item.suhu !== null && item.suhu !== undefined ? `${item.suhu}°C` : '-'}\n`;
    out += `• 🕒 *Waktu:* ${item.waktu || '-'} (${item.zonaWaktu || 'WIB'})\n`;
    if (item.kualitasUdara) out += `• 🍃 *Kualitas Udara:* ${item.kualitasUdara}\n`;
    out += `\n`;
  });
  out += `✨ *Badan Meteorologi, Klimatologi, dan Geofisika (BMKG)*`;
  return out.trim();
}

async function jereHariLibur(tahun = String(new Date().getFullYear())) {
  const t = String(tahun || new Date().getFullYear()).trim();
  const result = await jereGet('/api/search/harilibur', { tahun: t });
  return { tahun: (result && result.tahun) || t, total: (result && result.total) || 0, list: toArrayList(result.result || result) };
}

function formatHariLiburCaption(tahun, total, list) {
  let out = `🗓️ *DAFTAR HARI LIBUR NASIONAL ${tahun}*\n`;
  out += `📊 *Total Libur:* ${total || (list || []).length} Hari\n\n`;
  (list || []).forEach((h, i) => {
    out += `*${i + 1}. ${h.nama || h.deskripsi || '-'}*\n`;
    out += `• 📅 *Tanggal:* ${h.tanggal || '-'}\n`;
    if (h.deskripsi && h.deskripsi !== h.nama) out += `• 📝 *Keterangan:* ${h.deskripsi}\n`;
    out += `\n`;
  });
  out += `✨ *Kalender Resmi Republik Indonesia*`;
  return out.trim();
}

function parseGsmarenaArgs(text) {
  const raw = requireText(text, 'Nama HP');
  const parts = raw.split('|').map((s) => s.trim()).filter(Boolean);
  return { hp1: parts[0], hp2: parts[1] || '' };
}

async function jereGsmarena(hp1, hp2 = '') {
  const a = requireText(hp1, 'Nama HP');
  const params = { hp1: a };
  if (String(hp2 || '').trim()) params.hp2 = String(hp2).trim();
  return jereGet('/api/search/gsmarena', params);
}

async function jereApkpure(query, limit = 10) {
  const q = requireText(query, 'Nama aplikasi');
  const result = await jereGet('/api/search/apkpure', { query: q, limit });
  const list = Array.isArray(result) ? result : (result.result || result.data || []);
  return Array.isArray(list) ? list.slice(0, 5) : [];
}

function formatApkpureCaption(query, apps) {
  let out = `📱 *APKPURE SEARCH*\n🔍 *Query:* ${query}\n\n`;
  (apps || []).forEach((app, i) => {
    out += `*${i + 1}. ${app.title || app.name || '-'}*\n`;
    if (app.developer) out += `• 👨‍💻 *Developer:* ${app.developer}\n`;
    if (app.version) out += `• 📦 *Versi:* ${app.version}\n`;
    if (app.rating) out += `• ⭐ *Rating:* ${app.rating}\n`;
    out += `• 🔗 *Link:* ${app.link || app.download_url || '-'}\n\n`;
  });
  out += `✨ *JereAPI Search*`;
  return out.trim();
}

async function jereNpm(query, limit = 5) {
  const q = requireText(query, 'Nama package NPM');
  const result = await jereGet('/api/search/npm', { query: q, limit });
  const list = Array.isArray(result) ? result : (result.result || result.data || []);
  return Array.isArray(list) ? list.slice(0, 5) : [];
}

function formatNpmCaption(query, packages) {
  let out = `📦 *NPM PACKAGE REGISTRY SEARCH*\n🔍 *Query:* ${query}\n\n`;
  (packages || []).forEach((pkg, i) => {
    out += `*${i + 1}. ${pkg.name}* (v${pkg.version || '1.0.0'})\n`;
    if (pkg.description) out += `• 📝 ${pkg.description}\n`;
    if (pkg.author) out += `• 👤 *Author:* ${pkg.author}\n`;
    if (pkg.license) out += `• 📜 *License:* ${pkg.license}\n`;
    if (pkg.links?.npm) out += `• 🔗 *NPM:* ${pkg.links.npm}\n`;
    if (pkg.links?.repository) out += `• 🐙 *Repo:* ${pkg.links.repository}\n`;
    out += `\n`;
  });
  out += `✨ *NPM Official Registry Gateway*`;
  return out.trim();
}

async function jereCrypto(coin = '', currency = 'idr') {
  const result = await jereGet('/api/search/crypto', { coin: String(coin || ''), currency });
  const list = Array.isArray(result) ? result : (result.result || result.data || []);
  return { rate: (result && result.usd_idr_rate) || 0, list: Array.isArray(list) ? list.slice(0, 10) : [] };
}

function formatCryptoCaption(rate, coins) {
  let out = `🪙 *HARGA LIVE CRYPTOCURRENCY (BINANCE)*\n`;
  if (rate) out += `💱 *Kurs USD/IDR:* Rp ${Math.round(rate).toLocaleString('id-ID')}\n`;
  out += `\n`;
  (coins || []).forEach((c) => {
    const emoji = (c.change_24h_percent >= 0) ? '🟢' : '🔴';
    out += `*#${c.rank || '-'} ${c.name} (${c.symbol})*\n`;
    out += `• 💵 *Harga USD:* ${c.price_usd_formatted || `$${c.price_usd}`}\n`;
    out += `• 🇮🇩 *Harga IDR:* ${c.price_idr_formatted || `Rp${Math.round(c.price_idr || 0).toLocaleString('id-ID')}`}\n`;
    out += `• ${emoji} *Perubahan 24 Jam:* ${(c.change_24h_percent > 0 ? '+' : '')}${Number(c.change_24h_percent || 0).toFixed(2)}%\n`;
    if (c.high_24h_usd && c.low_24h_usd) out += `• 📊 *24h Range:* $${c.low_24h_usd} - $${c.high_24h_usd}\n`;
    out += `\n`;
  });
  out += `✨ *Data pasar real-time langsung dari Binance Exchange*`;
  return out.trim();
}

async function jereLirik(query) {
  const q = requireText(query, 'Judul lagu');
  const result = await jereGet('/api/search/lirik', { q });
  return (result && typeof result === 'object' ? result : {});
}

function formatLirikCaption(p) {
  let out = `🎵 *PENCARIAN LIRIK LAGU*\n\n`;
  out += `📌 *Judul:* ${p.title || '-'}\n`;
  out += `👤 *Artis:* ${p.artist || '-'}\n`;
  out += `💿 *Album:* ${p.album || '-'}\n`;
  out += `📅 *Rilis:* ${p.release_date || '-'}\n\n`;
  out += `📃 *Lirik:*\n${p.lyrics || '_Lirik tidak tersedia._'}\n\n`;
  out += `✨ *JereAPI Song Lyrics*`;
  return out.trim();
}

// ---------------------------------------------------------------------------
// NEWS — pola GET /api/news/{cnbc,kompas,liputan6} (lihat plugins/news/*.js)
// ---------------------------------------------------------------------------

const NEWS_SOURCES = ['cnbc', 'kompas', 'liputan6'];

async function jereNews(source, limit = 7) {
  const s = String(source || '').trim().toLowerCase();
  if (!NEWS_SOURCES.includes(s)) throw new Error(`Sumber berita tidak dikenal: ${source}. Pilih: ${NEWS_SOURCES.join(', ')}`);
  const result = await jereGet(`/api/news/${s}`, {});
  const list = Array.isArray(result) ? result : (result.data || result.result || []);
  if (!Array.isArray(list) || !list.length) throw new Error(`Tidak ada berita ${s} saat ini.`);
  return list.slice(0, limit);
}

function formatNewsCaption(source, list) {
  const title = { cnbc: 'CNBC INDONESIA', kompas: 'KOMPAS.COM', liputan6: 'LIPUTAN6' }[String(source).toLowerCase()] || String(source).toUpperCase();
  let out = `📰 *BERITA TERBARU ${title}*\n\n`;
  (list || []).forEach((item, i) => {
    out += `*${i + 1}. ${item.title || '-'}*\n`;
    if (item.category) out += `• 🏷️ *Kategori:* ${item.category}\n`;
    if (item.date || item.time) out += `• 📅 *Waktu:* ${item.date || item.time}\n`;
    if (item.link) out += `• 🔗 *Baca:* ${item.link}\n`;
    out += `\n`;
  });
  out += `✨ *JereAPI News Gateway*`;
  return out.trim();
}

// ---------------------------------------------------------------------------
// TOOLS layak port (lihat plugins/tools/*.js). Tanpa spam.
// ---------------------------------------------------------------------------

// styletext: jere-md memakai API luar + fallback lokal. Di sini HANYA fallback
// lokal murni (tanpa key pihak ketiga) agar tidak menambah kredensial baru.
function styleTextLocal(text, max = 20) {
  const raw = requireText(text, 'Teks');
  const fonts = [
    (t) => t.toUpperCase(),
    (t) => t.split('').join(' '),
    (t) => `『 ${t} 』`,
    (t) => `【 ${t} 】`,
    (t) => `★ ${t} ★`,
    (t) => `╰┈➤ ${t}`,
    (t) => `•·.·´¯\`·.·• ${t} •·.·´¯\`·.·•`,
  ];
  return fonts.map((fn) => fn(raw)).slice(0, max);
}

function formatStyleTextCaption(styles) {
  let out = `✨ *GAYA FONT (STYLE TEXT)*\n\n`;
  (styles || []).forEach((st, i) => {
    const val = (st && typeof st === 'object') ? (st.result || st.name || JSON.stringify(st)) : String(st);
    out += `*[${i + 1}]* ${val}\n`;
  });
  out += `\n💡 *Salin teks gaya yang kamu suka!*`;
  return out;
}

// web2pdf: jere-md memakai servis html2pdf publik. Di sini hanya helper nama
// file + normalisasi URL; konversi PDF dilakukan pemanggil (tanpa dep baru).
function web2pdfFileName(pageUrl) {
  const u = new URL(normalizeHttpUrl(pageUrl, 'URL web'));
  return `Web_${u.hostname}_${Date.now()}.pdf`;
}

function formatWeb2pdfCaption(pageUrl, requester = 'User') {
  return `📄 *WEB TO PDF BERHASIL*\n\n🔗 *URL:* ${pageUrl}\n✅ *Request by:* ${requester}`;
}

// CATATAN tempmail: jere-md punya alur create/check/inbox via /api/tools/tempmail.
// Sengaja TIDAK dip port sebagai fungsi agar tidak dipakai untuk spam/OTP abuse.
// Konstanta ini hanya dokumentasi pola endpoint untuk audit.
const TEMPMAIL_NOTE = [
  'TEMPMAIL — CATATAN (tanpa implementasi):',
  '- Endpoint pola jere-md: GET /api/tools/tempmail?action=create|inbox&email=...',
  '- Alasan tidak di-port: rawan disalahgunakan untuk spam OTP/verifikasi.',
  '- Jangan implementasikan spamotp/spamngl/tempmail-spam di bot ini.',
].join('\n');

// shorturl varian: jere-md memakai TinyURL + is.gd publik (tanpa key).
// Implementasi native fetch agar tanpa dep baru.
function tinyUrlApi(targetUrl) {
  return `https://tinyurl.com/api-create.php?url=${encodeURIComponent(normalizeHttpUrl(targetUrl, 'URL'))}`;
}

function isgdApi(targetUrl) {
  return `https://is.gd/create.php?format=simple&url=${encodeURIComponent(normalizeHttpUrl(targetUrl, 'URL'))}`;
}

async function jereShortUrl(targetUrl) {
  const url = normalizeHttpUrl(targetUrl, 'URL');
  const tinyRes = await fetch(tinyUrlApi(url));
  if (!tinyRes.ok) throw new Error(`TinyURL gagal (HTTP ${tinyRes.status}).`);
  const tiny = (await tinyRes.text()).trim();
  let isgd = '';
  try {
    const r = await fetch(isgdApi(url));
    const t = (await r.text()).trim();
    if (r.ok && t && !/error/i.test(t)) isgd = t;
  } catch { /* is.gd opsional */ }
  return { asal: url, tinyUrl: tiny, isgd };
}

function formatShortUrlCaption({ asal, tinyUrl, isgd }, requester = 'User') {
  let out = `🔗 *SHORT URL BERHASIL*\n\n🌐 *Link Asal:* ${asal}\n\n📌 *TinyURL:* ${tinyUrl}\n`;
  if (isgd) out += `📌 *Is.gd:* ${isgd}\n`;
  out += `\n✅ *Request by:* ${requester}`;
  return out;
}

// hd2/hd3/compressphoto/removewm: jere-md mengunggah multipart via 'form-data'
// ke POST /api/tools/{hd2,hd3,compressphoto,removewm}?apikey=...
// Di sini tanpa dep 'form-data': sediakan deskriptor + parser URL hasil.
// Upload multipart dilakukan pemanggil memakai FormData/Blob bawaan Node 18+.
const IMAGE_TOOL_ENDPOINTS = {
  hd2: '/api/tools/hd2',
  hd3: '/api/tools/hd3',
  compressphoto: '/api/tools/compressphoto',
  removewm: '/api/tools/removewm',
};

function buildImageToolDescriptor(kind, buffer, mime, scale = '2') {
  if (!IMAGE_TOOL_ENDPOINTS[kind]) throw new Error(`Image tool tidak dikenal: ${kind}`);
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Buffer gambar kosong.');
  if (!String(mime || '').startsWith('image/')) throw new Error('MIME harus image/*.');
  const s = String(scale).trim() === '4' ? '4' : '2';
  return {
    kind,
    endpoint: IMAGE_TOOL_ENDPOINTS[kind],
    filename: kind === 'compressphoto' ? `image.${String(mime).split('/')[1] || 'png'}` : 'image.jpg',
    mime: String(mime),
    scale: (kind === 'hd2' || kind === 'hd3') ? s : undefined,
    bytes: buffer.length,
    // Contoh pemanggil (Node 18+, tanpa dep baru):
    //   const fd = new FormData();
    //   fd.append('file', new Blob([buf], { type: mime }), filename);
    //   if (scale) fd.append('scale', scale);
    //   const res = await fetch(base + endpoint + '?key=' + key, { method: 'POST', body: fd });
  };
}

function parseHdResult(json, label = 'HD') {
  if (!json || json.status === false) throw new Error((json && (json.error || json.message)) || `Gagal memproses ${label}.`);
  const url = json.result?.upscaled_url || json.upscaled_url || json.url || '';
  if (!url) throw new Error(`URL gambar ${label} tidak ditemukan.`);
  return { url: String(url), scale: json.result?.scale_applied || '' };
}

function parseCompressResult(json) {
  if (!json || json.status === false) throw new Error((json && (json.error || json.detail || json.message)) || 'Gagal mengompres gambar.');
  const data = json.result || json.data || {};
  return {
    url: data.url || '',
    originalKb: data.original_size_bytes ? (data.original_size_bytes / 1024).toFixed(2) + ' KB' : '-',
    compressedKb: data.compressed_size_bytes ? (data.compressed_size_bytes / 1024).toFixed(2) + ' KB' : '-',
    saved: data.ratio_saved || '-',
  };
}

function parseRemovewmResult(json) {
  if (!json || json.status === false) throw new Error((json && (json.error || json.message)) || 'Gagal menghapus watermark.');
  const url = json.resultUrl || json.result?.url || json.url || '';
  if (!url) throw new Error('Gambar hasil pembersihan watermark tidak ditemukan.');
  return { url: String(url) };
}

// whatmusic: jere-md mengunggah audio lalu GET /api/tools/whatmusic?url=...
// Di sini hanya varian URL langsung (tanpa upload pihak ketiga).
async function jereWhatmusicByUrl(audioUrl) {
  const url = normalizeHttpUrl(audioUrl, 'URL audio');
  return jereGet('/api/tools/whatmusic', { url });
}

function formatWhatmusicCaption(data, requester = 'User') {
  const d = (data && typeof data === 'object') ? data : {};
  let out = `🎵 *MUSIK DITEMUKAN*\n\n`;
  out += `📌 *Judul:* ${d.title || '-'}\n`;
  out += `👤 *Artis:* ${d.artist || '-'}\n`;
  out += `💿 *Album:* ${d.album || '-'}\n`;
  out += `📅 *Rilis:* ${d.release_date || '-'}\n`;
  out += `⏱️ *Durasi:* ${d.duration || '-'}\n`;
  if (d.genre) out += `🎶 *Genre:* ${Array.isArray(d.genre) ? d.genre.join(', ') : d.genre}\n`;
  if (d.spotify_url) out += `🟢 *Spotify:* ${d.spotify_url}\n`;
  if (d.apple_music_url) out += `🍎 *Apple Music:* ${d.apple_music_url}\n`;
  out += `\n✅ *Request by:* ${requester}`;
  return out;
}

async function jereGenius(query, limit = 5) {
  const q = requireText(query, 'Judul lagu');
  const result = await jereGet('/api/tools/genius', { query: q });
  const songs = Array.isArray(result) ? result : (result.result || result.data || []);
  return Array.isArray(songs) ? songs.slice(0, limit) : [];
}

function formatGeniusCaption(query, songs) {
  let out = `🎵 *GENIUS MUSIC SEARCH*\n🔍 *Query:* ${query}\n\n`;
  (songs || []).forEach((s, i) => {
    out += `*${i + 1}. ${s.title || '-'}*\n`;
    if (s.artist) out += `• 👤 *Artis:* ${s.artist}\n`;
    if (s.url) out += `• 🔗 *Lirik Lengkap:* ${s.url}\n`;
    out += `\n`;
  });
  out += `✨ *Genius Lyrics Knowledge Gateway*`;
  return out.trim();
}

// inspect/getpp: jere-md memakai Baileys langsung (groupGetInviteInfo,
// profilePictureUrl + resolusi LID). Di sini hanya helper info pola Baileys —
// TIDAK memanggil sock, agar file ini bebas dependensi Baileys.
function parseInviteCode(text) {
  const m = String(text || '').match(/chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/i);
  return m ? m[1] : '';
}

function formatInviteInfoCaption(info, requester = 'User') {
  const g = (info && typeof info === 'object') ? info : {};
  let out = `🔍 *INFORMASI GRUP WHATSAPP*\n\n`;
  out += `📌 *Nama Grup:* ${g.subject || '-'}\n`;
  out += `🆔 *Group JID:* ${g.id ? `${g.id}@g.us` : '-'}\n`;
  out += `👑 *Owner:* ${g.owner ? `@${String(g.owner).split('@')[0]}` : 'Tidak diketahui'}\n`;
  out += `👥 *Jumlah Member:* ${g.size || '-'}\n`;
  out += `📅 *Dibuat:* ${g.creation ? new Date(g.creation * 1000).toLocaleString('id-ID') : '-'}\n`;
  out += `🔒 *Status:* ${g.isCommunity ? 'Komunitas' : 'Grup Standar'}\n`;
  if (g.desc) out += `📝 *Deskripsi:*\n${g.desc}\n`;
  out += `\n✅ *Request by:* ${requester}`;
  return out;
}

function resolvePpTarget({ mentionedJid, quotedSender, text, sender } = {}) {
  if (Array.isArray(mentionedJid) && mentionedJid[0]) return String(mentionedJid[0]).replace(/:\d+/, '');
  if (quotedSender) return String(quotedSender).replace(/:\d+/, '');
  const first = String(text || '').trim().split(/\s+/)[0] || '';
  const digits = first.replace(/[^0-9]/g, '');
  if (digits.length >= 7) return `${digits}@s.whatsapp.net`;
  if (sender) return String(sender).replace(/:\d+/, '');
  throw new Error('Target foto profil tidak ditemukan.');
}

// ---------------------------------------------------------------------------
// OWNER — HANYA helper file/util murni. Tanpa eval/exec/restart/proses.
// (lihat plugins/owner/{eval,exec,restart,backupdb,backupsc,getplugin,
//  saveplugin,deleteplugin,listplugin,join,swgc}.js)
// ---------------------------------------------------------------------------

const OWNER_DANGEROUS_NOTE = [
  'OWNER — CATATAN KEAMANAN:',
  '- eval/exec/restart SENGAJA tidak diimplementasikan di util ini.',
  '- backupdb/backupsc/getplugin/saveplugin/deleteplugin/listplugin hanya',
  '  helper path & baca/tulis file murni (validasi .js, cegah path traversal).',
  '- join/swgc hanya parser/pembentuk payload, eksekusi milik layer Baileys.',
].join('\n');

function sanitizePluginName(name) {
  const clean = String(name || '').trim().replace(/^(\.\/|\/)+/, '');
  if (!clean) throw new Error('Nama plugin kosong.');
  if (clean.includes('..')) throw new Error('Nama plugin tidak boleh mengandung "..".');
  if (!/\.(js|cjs|mjs)$/.test(clean)) throw new Error('Nama plugin harus berakhiran .js/.cjs/.mjs.');
  return clean.replace(/\\/g, '/');
}

function resolvePluginPath(pluginsDir, name) {
  const base = path.resolve(String(pluginsDir || './plugins'));
  const rel = sanitizePluginName(name);
  const full = path.resolve(base, rel);
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error('Path plugin di luar folder plugins.');
  return full;
}

function listPluginFiles(pluginsDir) {
  const base = path.resolve(String(pluginsDir || './plugins'));
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|cjs|mjs)$/.test(entry.name)) out.push(path.relative(base, full).replace(/\\/g, '/'));
    }
  };
  walk(base);
  return out.sort();
}

function readPluginFile(pluginsDir, name, maxBytes = 200 * 1024) {
  const full = resolvePluginPath(pluginsDir, name);
  if (!fs.existsSync(full)) throw new Error('File plugin tidak ditemukan.');
  const st = fs.statSync(full);
  if (st.size > maxBytes) throw new Error(`File plugin terlalu besar (${st.size} bytes).`);
  return fs.readFileSync(full, 'utf-8');
}

function formatPluginListCaption(files) {
  let out = '*->* List Plugin *<-*\n';
  out += (files || []).map((f, i) => ` *-(${i + 1})-*: ${f}`).join('\n');
  return out.trim();
}

function buildBackupDbFileName(prefix = 'database') {
  return `${prefix}-${Date.now()}.json`;
}

function summarizeBackupDb(dbData, sizeBytes) {
  return {
    file: 'database.json',
    sizeKb: ((Number(sizeBytes) || 0) / 1024).toFixed(2),
    totalUsers: Object.keys((dbData && dbData.users) || {}).length,
    totalChats: Object.keys((dbData && dbData.chats) || {}).length,
  };
}

function parseJoinInviteCode(text) {
  return parseInviteCode(text);
}

function buildSwgcPayload(text) {
  // swgc jere-md = siaran status/channel; di sini hanya validasi teks murni.
  const msg = requireText(text, 'Pesan siaran');
  if (msg.length > 4000) throw new Error('Pesan siaran maksimal 4000 karakter.');
  return { message: msg, createdAt: Date.now() };
}

// ---------------------------------------------------------------------------
// INFO — speed/os/totalchat/cekplugins versi lokal murni
// (lihat plugins/info/{speed,os,totalchat,cekplugins}.js)
// ---------------------------------------------------------------------------

function buildSpeedCaption(pingMs) {
  const used = process.memoryUsage().rss / 1024 / 1024;
  const total = os.totalmem() / 1024 / 1024;
  return (
    `⚡ *BENCHMARK & RESPONSE SPEED*\n\n` +
    `📶 *Latensi Respon:* ${Number(pingMs || 0).toFixed(2)} ms\n` +
    `🧠 *RAM:* ${used.toFixed(1)} MB / ${total.toFixed(0)} MB\n` +
    `🖥️ *Platform:* ${os.platform()} (${os.arch()})\n` +
    `✅ *Status Jaringan:* Stabil & Aktif`
  );
}

function collectOsInfo() {
  const totalMem = os.totalmem() || 1;
  const freeMem = os.freemem() || 0;
  const cpus = os.cpus() || [];
  return {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpuModel: (cpus[0] && cpus[0].model) || 'Unknown CPU',
    cpuCount: cpus.length || 1,
    totalMem,
    usedMem: totalMem - freeMem,
    osUptimeSec: os.uptime() || 0,
    runtimeSec: process.uptime() || 0,
  };
}

function formatOsCaption(info) {
  const i = info || collectOsInfo();
  const gb = (b) => (Number(b) / (1024 ** 3)).toFixed(2);
  const bar = (used, total, len = 10) => {
    if (!total || total <= 0) return `[${'░'.repeat(len)}]`;
    const filled = Math.round(Math.min(Math.max(used / total, 0), 1) * len);
    return `[${'█'.repeat(filled)}${'░'.repeat(Math.max(len - filled, 0))}]`;
  };
  const fmtTime = (s) => {
    const n = Math.floor(s || 0);
    return `${Math.floor(n / 3600)}h ${Math.floor((n % 3600) / 60)}m ${n % 60}s`;
  };
  return (
    `╭─[ ⚙️ *SYSTEM & SERVER INFO* ]\n` +
    `│ 🖥️ *OS*       : ${i.platform} ${i.release}\n` +
    `│ 🧠 *RAM*      : ${bar(i.usedMem, i.totalMem)} ${gb(i.usedMem)} / ${gb(i.totalMem)} GB\n` +
    `│ 🔧 *CPU*      : ${i.cpuCount} Cores (${i.cpuModel})\n` +
    `│ ⏱️ *OS Uptime*: ${fmtTime(i.osUptimeSec)}\n` +
    `│ 📆 *Runtime*  : ${Math.floor((i.runtimeSec || 0) / 3600)}h ${Math.floor(((i.runtimeSec || 0) % 3600) / 60)}m\n` +
    `╰────────────────────────`
  );
}

function rankTotalChat(participants, countByJid, limit = 50) {
  const lim = Number(limit);
  const n = Number.isFinite(lim) && lim > 0 ? Math.floor(lim) : 50;
  const rows = (participants || []).map((p) => {
    const jid = p.id || p.jid || '';
    const num = String(jid).split('@')[0].split(':')[0];
    return {
      jid,
      num,
      name: p.name || '',
      chat: Number((countByJid && (countByJid[jid] ?? countByJid[num])) || 0),
    };
  });
  rows.sort((a, b) => b.chat - a.chat);
  const totalMessages = rows.reduce((acc, r) => acc + r.chat, 0);
  return {
    totalMessages,
    activeMembers: rows.filter((r) => r.chat > 0).length,
    totalMembers: rows.length,
    top: rows.slice(0, n),
  };
}

function formatTotalChatCaption(rank) {
  let out = `🏆 *TOTAL CHAT ANGGOTA GRUP* 🏆\n\n`;
  out += `📊 *Total Pesan Terdata:* ${Number(rank.totalMessages || 0).toLocaleString()} pesan\n`;
  out += `👥 *Anggota Aktif:* ${rank.activeMembers} / ${rank.totalMembers}\n\n`;
  (rank.top || []).forEach((u, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    out += `${medal} @${u.num}${u.name ? ` (${u.name})` : ''} - *${Number(u.chat || 0).toLocaleString()}* pesan\n`;
  });
  return out.trim();
}

function summarizePlugins(keys, sample = 10) {
  const list = Array.isArray(keys) ? keys : Object.keys(keys || {});
  return {
    total: list.length,
    sample: list.slice(0, sample),
  };
}

function formatPluginsCaption(summary) {
  let out = `📊 *PLUGIN INSPECTOR*\n\n🔹 *Total Plugin Loaded:* ${summary.total} file\n\n📋 *Contoh ${summary.sample.length} Plugin Pertama:*\n`;
  summary.sample.forEach((k) => { out += `├─ ⚡ \`${k}\`\n`; });
  out += `└─────────────────────────`;
  return out.trim();
}

// ---------------------------------------------------------------------------
// GROUP — mute/delete/security/settings/setppgc helper murni
// (lihat plugins/group/{mute,delete,security,settings,setppgc}.js)
// ---------------------------------------------------------------------------

const MUTE_ACTIONS = ['on', 'off', 'status', 'list', 'temp', '--on', '--off', '--status', '--list', '--temp'];

function parseMuteArgs(text) {
  const args = String(text || '').trim().split(/\s+/).filter(Boolean);
  const action = String(args[0] || '').toLowerCase().replace(/^--/, '');
  if (!MUTE_ACTIONS.map((a) => a.replace(/^--/, '')).includes(action)) {
    throw new Error('Aksi mute tidak dikenal. Pilih: --on/--off/--status/--list/--temp');
  }
  let durationMs = 0;
  if (action === 'temp') {
    const m = String(args[1] || '').match(/^(\d+)([mh])$/i);
    if (!m) throw new Error('Format durasi salah. Gunakan: 30m, 1h, 2h, 24h');
    durationMs = m[2].toLowerCase() === 'm'
      ? Number(m[1]) * 60 * 1000
      : Number(m[1]) * 60 * 60 * 1000;
    if (durationMs > 7 * 24 * 60 * 60 * 1000) throw new Error('Durasi maksimal adalah 7 hari.');
  }
  return { action, durationMs, durationText: durationMs ? msToDurationText(durationMs) : '' };
}

function isMuteExpired(chat) {
  if (!chat || chat.mute !== true) return true;
  if (chat.mutedUntil && chat.mutedUntil > Date.now()) return false;
  if (chat.mutedUntil && chat.mutedUntil <= Date.now()) return true;
  return false; // mute permanen
}

function buildDeleteKey(chatJid, quoted) {
  if (!quoted) throw new Error('Reply pesan yang ingin dihapus terlebih dahulu.');
  return {
    remoteJid: String(chatJid),
    fromMe: Boolean(quoted.fromMe),
    id: String(quoted.id || ''),
    participant: String(quoted.sender || quoted.participant || ''),
  };
}

const SECURITY_FEATURES = [
  'antilink', 'antilinkwa', 'antitagsw', 'antisw', 'antikudeta',
  'antiforward', 'antibot', 'antidokumen', 'antifoto', 'antivideo',
  'antisticker', 'antivoice', 'antinsfw', 'antitoxic',
];

const SECURITY_MODES = ['on', 'delete', 'kick', 'warn', 'off'];

function parseSecurityArgs(command, text) {
  const cmd = String(command || '').toLowerCase();
  const args = String(text || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  let fitur = args[0] || '';
  let action = args[1] || '';
  if (SECURITY_FEATURES.includes(cmd)) {
    fitur = cmd;
    action = args[0] || '';
  }
  if (!fitur) return { fitur: '', action: '', list: true };
  if (!SECURITY_FEATURES.includes(fitur)) throw new Error(`Fitur ${fitur} tidak dikenal.`);
  if (action && !SECURITY_MODES.includes(action) && action !== 'status') throw new Error('Aksi tidak dikenal. Gunakan: on/delete/kick/warn/off');
  return { fitur, action: action || 'status', list: false };
}

function buildSecurityStatusCaption(state) {
  const s = (state && typeof state === 'object') ? state : {};
  const rows = SECURITY_FEATURES.map((f) => {
    const st = s[f]?.aktif ? `✅ Aktif (${s[f].mode || 'delete'})` : '❌ Nonaktif';
    return `├─ 🛡️ *${f}:* ${st}`;
  }).join('\n');
  return (
    `╔══════════════════════════╗\n║  🛡️ *GROUP SECURITY STATUS* 🛡️  ║\n╚══════════════════════════╝\n\n` +
    `┌───❖ *STATUS FITUR KEAMANAN* ❖───\n│\n${rows}\n│\n└─────────────────────────`
  );
}

function parseGroupSetting(mode) {
  const m = String(mode || '').toLowerCase().trim();
  if (['open', 'buka'].includes(m)) return 'not_announcement';
  if (['close', 'tutup'].includes(m)) return 'announcement';
  throw new Error('Mode tidak dikenal. Gunakan: buka/open atau tutup/close.');
}

function validateSetppgcInput(mime) {
  if (!/image/.test(String(mime || ''))) {
    throw new Error('Kirim atau balas gambar dengan caption .setppgc untuk mengganti foto profil grup!');
  }
  return true;
}

// ---------------------------------------------------------------------------
// MLBB + FREEFIRE (lihat plugins/mlbb/*.js, plugins/freefire/ffstalk.js)
// ---------------------------------------------------------------------------

async function jereMlbbTier() {
  const result = await jereGet('/api/mlbb/tier', {});
  const list = Array.isArray(result) ? result : (result.result || result.data || []);
  if (!Array.isArray(list)) throw new Error('Data tier MLBB tidak valid.');
  return list;
}

function filterMlbbTier(list, filterText = '') {
  const f = String(filterText || '').toLowerCase().trim();
  if (!f) return list;
  return (list || []).filter((h) =>
    String(h.hero_name || h.name || '').toLowerCase().includes(f) ||
    (Array.isArray(h.roles) ? h.roles.join(' ').toLowerCase().includes(f) : String(h.roles || '').toLowerCase().includes(f)) ||
    (Array.isArray(h.lanes) ? h.lanes.join(' ').toLowerCase().includes(f) : String(h.lanes || '').toLowerCase().includes(f)));
}

async function jereMlbbCounter(enemies) {
  const e = requireText(enemies, 'Nama hero musuh');
  return jereGet('/api/mlbb/counter', { enemies: e });
}

async function jereMlbbSynergy(allies) {
  const a = requireText(allies, 'Nama hero tim');
  return jereGet('/api/mlbb/synergy', { allies: a });
}

async function jereMlbbBuild(hero) {
  const heroQuery = requireText(hero, 'Nama hero').toLowerCase();
  const [tier, synergyRaw, counterRaw] = await Promise.all([
    jereMlbbTier().catch(() => []),
    jereMlbbSynergy(hero).catch(() => []),
    jereMlbbCounter(hero).catch(() => []),
  ]);
  const found = Array.isArray(tier)
    ? (tier.find((h) => String(h.hero_name || h.hero || h.name || '').toLowerCase() === heroQuery) ||
      tier.find((h) => String(h.hero_name || h.hero || h.name || '').toLowerCase().includes(heroQuery)) || null)
    : null;
  const norm = (v) => (Array.isArray(v) ? v : (v && (v.result || v.data)) || []);
  return {
    hero: (found && (found.hero_name || found.name)) || String(hero).toUpperCase(),
    roles: (found && (Array.isArray(found.roles) ? found.roles.join(', ') : found.roles)) || 'Fighter / Flex',
    lanes: (found && (Array.isArray(found.lanes) ? found.lanes.join(', ') : found.lanes)) || 'EXP / Roam',
    tier: (found && (found.tier || found.grade)) || 'A',
    synergies: norm(synergyRaw).slice(0, 3),
    counters: norm(counterRaw).slice(0, 3),
  };
}

function formatMlbbBuildCaption(build, botName = 'BOT') {
  let out = `⚔️ *${String(botName).toUpperCase()} - MLBB BUILD & HERO GUIDE*\n\n`;
  out += `👤 *Hero:* ${build.hero}\n🏷️ *Role:* ${build.roles}\n🛣️ *Lane Rekomendasi:* ${build.lanes}\n🏆 *Tier Meta:* Tier ${build.tier}\n\n`;
  out += `🛡️ *REKOMENDASI BUILD ITEM (TOP META):*\n`;
  out += `1. Tough Boots / Warrior Boots (Movement)\n2. Blade of the Heptaseas / War Axe (Core Damage)\n`;
  out += `3. Hunter Strike / Endless Battle (Cooldown & Speed)\n4. Malefic Roar (Physical PEN)\n`;
  out += `5. Blade of Despair / Queen's Wings (Burst / Sustain)\n6. Immortality / Athena's Shield (Late Game Defense)\n\n`;
  out += `🔮 *BATTLE SPELL:* Flicker / Retribution / Purify\n✨ *EMBLEM:* Custom Assassin / Fighter\n\n`;
  if (build.synergies?.length) out += `⚡ *Best Combo Allies:* ${build.synergies.map((s) => s.hero_name || s.name).join(', ')}\n`;
  if (build.counters?.length) out += `⚠️ *Waspada Counter Hero:* ${build.counters.map((c) => c.hero_name || c.name).join(', ')}\n`;
  out += `\n💡 *Tips Gameplay:* Kuasai positioning skill, manfaatkan bush, dan sesuaikan item counter lawan!`;
  return out.trim();
}

async function jereFfStalk(uid) {
  const id = String(uid || '').replace(/[^0-9]/g, '').trim();
  if (!id) throw new Error('UID Free Fire kosong. Contoh: 417262746');
  return jereGet('/api/freefire/stalk', { id });
}

function formatFfStalkCaption(p, uid) {
  const src = (p && typeof p === 'object') ? p : {};
  const acc = src.account || {};
  const rnk = src.ranked || {};
  const gld = src.guild || {};
  const pet = src.pet || {};
  const soc = src.social || {};
  let out = `╭━━━〔 🎮 *FREE FIRE PROFILE* 〕━━━\n`;
  out += `┃ 👤 *Nickname:* ${src.nickname || acc.nickname || '-'}\n`;
  out += `┃ 🆔 *UID:* ${src.id || uid}\n`;
  out += `┃ 🎖️ *Level:* ${acc.level || '-'} (EXP: ${acc.exp || '0'})\n`;
  out += `┃ 🗺️ *Region:* ${acc.region || '-'}\n`;
  out += `┃ ❤️ *Likes:* ${acc.likes || '0'}\n`;
  out += `┃\n`;
  out += `┃ 🏆 *Rank BR:* ${rnk.br_rank || '-'} (${rnk.br_points || '0 Poin'})\n`;
  out += `┃ ⚔️ *Rank CS:* ${rnk.cs_rank || '-'} (${rnk.cs_points || '0 Poin'})\n`;
  out += `┃\n`;
  if (gld.guild_name) out += `┃ 🛡️ *Guild:* ${gld.guild_name} (${gld.guild_level || 'Lv.1'})\n┃\n`;
  if (pet.pet_name) out += `┃ 🐾 *Pet:* ${pet.pet_name} (${pet.level || 'Lv.1'})\n┃\n`;
  if (soc.signature) out += `┃ 📝 *Bio:* ${soc.signature}\n`;
  out += `┃ 📅 *Dibuat:* ${acc.created_at || '-'}\n`;
  out += `┃ 🕒 *Login Terakhir:* ${acc.last_login || '-'}\n`;
  out += `╰━━━━━━━━━━━━━━━━━━━━━━━`;
  return out;
}

// ---------------------------------------------------------------------------
// EVENTS — pola autosholat (lihat plugins/events/autosholat.js)
// ---------------------------------------------------------------------------

const SHOLAT_SCHEDULE_DEFAULT = {
  subuh: '04:24',
  terbit: '06:11',
  dzuhur: '11:57',
  ashar: '15:22',
  magrib: '18:05',
  isya: '19:19',
};

function nowHHMMJakarta(date = new Date()) {
  const d = new Date(date);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t) => (parts.find((p) => p.type === t) || {}).value || '00';
  return `${get('hour')}:${get('minute')}`;
}

function matchSholatTime(hhmm, schedule = SHOLAT_SCHEDULE_DEFAULT) {
  for (const [name, time] of Object.entries(schedule || {})) {
    if (typeof time === 'string' && time === hhmm) return name;
  }
  return '';
}

function shouldTriggerAutosholat(date = new Date(), schedule = SHOLAT_SCHEDULE_DEFAULT) {
  const now = nowHHMMJakarta(date);
  const name = matchSholatTime(now, schedule);
  return name ? { fire: true, name, time: now } : { fire: false, name: '', time: now };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // kecil
  requireText,
  normalizeHttpUrl,
  pickFirstImageUrl,
  // search
  jereYts,
  formatYtsCaption,
  jereSpotifySearch,
  formatSpotifyCaption,
  isPinterestUrl,
  jerePinSearch,
  jerePinDownload,
  jereWallpaper,
  formatWallpaperCaption,
  jereCuaca,
  formatCuacaCaption,
  jereBmkg,
  formatBmkgCaption,
  jereHariLibur,
  formatHariLiburCaption,
  parseGsmarenaArgs,
  jereGsmarena,
  jereApkpure,
  formatApkpureCaption,
  jereNpm,
  formatNpmCaption,
  jereCrypto,
  formatCryptoCaption,
  jereLirik,
  formatLirikCaption,
  // news
  NEWS_SOURCES,
  jereNews,
  formatNewsCaption,
  // tools
  styleTextLocal,
  formatStyleTextCaption,
  web2pdfFileName,
  formatWeb2pdfCaption,
  TEMPMAIL_NOTE,
  tinyUrlApi,
  isgdApi,
  jereShortUrl,
  formatShortUrlCaption,
  IMAGE_TOOL_ENDPOINTS,
  buildImageToolDescriptor,
  parseHdResult,
  parseCompressResult,
  parseRemovewmResult,
  jereWhatmusicByUrl,
  formatWhatmusicCaption,
  jereGenius,
  formatGeniusCaption,
  parseInviteCode,
  formatInviteInfoCaption,
  resolvePpTarget,
  // owner (murni)
  OWNER_DANGEROUS_NOTE,
  sanitizePluginName,
  resolvePluginPath,
  listPluginFiles,
  readPluginFile,
  formatPluginListCaption,
  buildBackupDbFileName,
  summarizeBackupDb,
  parseJoinInviteCode,
  buildSwgcPayload,
  // info (lokal)
  buildSpeedCaption,
  collectOsInfo,
  formatOsCaption,
  rankTotalChat,
  formatTotalChatCaption,
  summarizePlugins,
  formatPluginsCaption,
  // group (murni)
  MUTE_ACTIONS,
  parseMuteArgs,
  isMuteExpired,
  buildDeleteKey,
  SECURITY_FEATURES,
  SECURITY_MODES,
  parseSecurityArgs,
  buildSecurityStatusCaption,
  parseGroupSetting,
  validateSetppgcInput,
  // mlbb + ff
  jereMlbbTier,
  filterMlbbTier,
  jereMlbbCounter,
  jereMlbbSynergy,
  jereMlbbBuild,
  formatMlbbBuildCaption,
  jereFfStalk,
  formatFfStalkCaption,
  // events
  SHOLAT_SCHEDULE_DEFAULT,
  nowHHMMJakarta,
  matchSholatTime,
  shouldTriggerAutosholat,
};
