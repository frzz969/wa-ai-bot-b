// lib/freeinfo.js — LANE INFO GRATIS (tanpa API key)
// Memakai global fetch bawaan Node 18+ (paket `node-fetch` opsional bila terinstal).
// Contoh router:
//   const { handleSholat } = require('../lib/freeinfo');
//   if (cmd === 'jadwalsholat') return await handleSholat(sock, jid, m, args);

const UA = { 'User-Agent': 'WA-AI-Bot/1.0' };

let nodeFetch = null;
try {
  nodeFetch = require('node-fetch');
} catch {
  nodeFetch = null;
}
const doFetch = nodeFetch || fetch;

function getJson(url, opts) {
  const o = Object.assign({ headers: UA, signal: AbortSignal.timeout(20000) }, opts || {});
  o.headers = Object.assign({}, UA, (opts && opts.headers) || {});
  return doFetch(url, o).then(async (res) => {
    if (!res.ok) throw new Error('HTTP ' + res.status + ' untuk ' + url);
    return res.json();
  });
}

function getText(url, opts) {
  const o = Object.assign({ headers: UA, signal: AbortSignal.timeout(20000) }, opts || {});
  o.headers = Object.assign({}, UA, (opts && opts.headers) || {});
  return doFetch(url, o).then(async (res) => {
    if (!res.ok) throw new Error('HTTP ' + res.status + ' untuk ' + url);
    return res.text();
  });
}

// Jeda sopan antar request (dipakai lirik & rantai fallback).
let lastHit = 0;
async function politeWait(ms) {
  const wait = Math.max(0, (ms || 800) - (Date.now() - lastHit));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit = Date.now();
}

// ------------------------------------------------------- jadwal sholat ---
// GET https://api.myquran.com/v2/sholat/jadwal/{id}/{YYYY}/{MM}/{DD}
// Contoh id 1301 = Jakarta. Cari id kota: /v2/sholat/kota/cari/{nama}.
// Contoh: const j = await jadwalSholat(1301, 2026, 9, 24);
async function cariKotaSholat(nama) {
  const q = String(nama || '').trim();
  if (!q) throw new Error('Contoh: .jadwalsholat Jakarta');
  const data = await getJson('https://api.myquran.com/v2/sholat/kota/cari/' + encodeURIComponent(q));
  const list = (data && data.data) || [];
  if (!list.length) throw new Error('❌ Kota "' + q + '" tidak ketemu. Coba nama lain (cth: Bandung).');
  return list.map((k) => ({ id: k.id, lokasi: k.lokasi }));
}

async function jadwalSholat(id, yyyy, mm, dd) {
  const data = await getJson(
    'https://api.myquran.com/v2/sholat/jadwal/' + id + '/' + yyyy + '/' + String(mm).padStart(2, '0') + '/' + String(dd).padStart(2, '0')
  );
  const d = data && data.data;
  if (!d || !d.jadwal) throw new Error('❌ Jadwal sholat tidak tersedia.');
  return { lokasi: d.lokasi, daerah: d.daerah, tanggal: (d.jadwal && d.jadwal.tanggal) || '', jadwal: d.jadwal };
}

function formatSholat(j) {
  const t = j.jadwal;
  return (
    '🕌 *Jadwal Sholat ' + j.lokasi + ' (' + j.tanggal + ')*\n' +
    'Imsak: ' + t.imsak + '\nSubuh: ' + t.subuh + '\nTerbit: ' + t.terbit + '\n' +
    'Dhuha: ' + t.dhuha + '\nDzuhur: ' + t.dzuhur + '\nAshar: ' + t.ashar + '\n' +
    'Maghrib: ' + t.maghrib + '\nIsya: ' + t.isya
  );
}

// ---------------------------------------------------------------- quran ---
// GET https://api.myquran.com/v2/quran/surat/{nomor} (1-114)
// Contoh: const s = await quranSurat(112);
async function quranSurat(nomor) {
  const n = Number(nomor);
  if (!Number.isInteger(n) || n < 1 || n > 114) throw new Error('Contoh: .quran 112 (nomor surat 1-114).');
  const data = await getJson('https://api.myquran.com/v2/quran/surat/' + n);
  const d = data && data.data;
  if (!d) throw new Error('❌ Surat tidak ketemu.');
  return d; // { nama, nama_latin, jumlah_ayat, tempat_turun, arti, deskripsi, ayat: [...] }
}

function formatQuran(d, maxAyat) {
  const n = Math.max(1, Math.min(Number(maxAyat) || 5, 20));
  const ayat = (d.ayat || []).slice(0, n).map((a) => {
    const teks = a.teksArab || a.teks_arab || '';
    const indo = a.teksIndonesia || a.teks_indonesia || '';
    return '*' + (a.nomorAyat || a.nomor_ayat || '?') + '.* ' + teks + '\n_' + indo + '_';
  });
  return '📖 *QS. ' + d.nama_latin + ' (' + d.nama + ')* — ' + d.arti + '\n' + ayat.join('\n\n');
}

// ---------------------------------------------------------------- gempa ---
// GET https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json → field Infogempa.gempa.
// Contoh: const g = await gempa();
async function gempa() {
  const data = await getJson('https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json');
  const g = data && data.Infogempa && data.Infogempa.gempa;
  if (!g) throw new Error('❌ Data gempa BMKG tidak tersedia.');
  return g; // { Tanggal, Jam, Coordinates, Magnitude, Kedalaman, Wilayah, Potensi, ... }
}

function formatGempa(g) {
  return (
    '🌋 *Info Gempa Terkini*\n' +
    '📅 ' + g.Tanggal + ' ' + g.Jam + '\n' +
    '📍 ' + g.Wilayah + '\n' +
    '💪 Magnitudo: ' + g.Magnitude + ' | 📏 Kedalaman: ' + g.Kedalaman + '\n' +
    '⚠️ Potensi: ' + g.Potensi + '\n' +
    '_Sumber: BMKG (data.bmkg.go.id)_'
  );
}

// ---------------------------------------------------------------- lirik ---
// LRCLIB dulu, fallback scraping AZLyrics.
// Contoh: const l = await lirik('dhyo haw bajingan');
function decodeLyricEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => {
      try { return String.fromCharCode(parseInt(h, 16)); } catch { return m; }
    })
    .replace(/&#(\d+);/g, (m, d) => {
      try { return String.fromCharCode(Number(d)); } catch { return m; }
    })
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

async function lirik(query) {
  const q = String(query || '').trim();
  if (!q) throw new Error('Contoh: .lirik dhyo haw bajingan');
  // 1) LRCLIB dulu
  try {
    await politeWait(800);
    const arr = await getJson('https://lrclib.net/api/search?q=' + encodeURIComponent(q), { headers: UA });
    if (Array.isArray(arr) && arr.length) {
      const hit = arr.find((x) => x && x.plainLyrics && !x.instrumental) || arr[0];
      if (hit && hit.plainLyrics) {
        return {
          title: hit.trackName || q,
          artist: hit.artistName || '',
          album: hit.albumName || '',
          text: String(hit.plainLyrics).slice(0, 3500),
        };
      }
    }
  } catch {
    // lanjut ke fallback AZLyrics
  }
  // 2) Fallback: scraping AZLyrics
  const AZ_UA = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  };
  await politeWait(800);
  const searchUrl = 'https://search.azlyrics.com/search.php?q=' + encodeURIComponent(q);
  const searchRes = await fetch(searchUrl, { headers: AZ_UA, signal: AbortSignal.timeout(20000) });
  if (!searchRes.ok) throw new Error('❌ Lirik "' + q + '" tidak ketemu.');
  const searchHtml = await searchRes.text();
  const hrefMatch =
    searchHtml.match(/href="(https?:\/\/(?:www\.)?azlyrics\.com\/lyrics\/[^"']+)"/i) ||
    searchHtml.match(/(https?:\/\/(?:www\.)?azlyrics\.com\/lyrics\/[^\s"'<>]+)/i);
  if (!hrefMatch) throw new Error('❌ Lirik "' + q + '" tidak ketemu.');
  const lyricUrl = hrefMatch[1];
  await politeWait(800);
  const lyricRes = await fetch(lyricUrl, { headers: AZ_UA, signal: AbortSignal.timeout(20000) });
  if (!lyricRes.ok) throw new Error('❌ Lirik "' + q + '" tidak tersedia.');
  const lyricHtml = await lyricRes.text();
  const marker = '<!-- Usage of azlyrics.com content';
  const idx = lyricHtml.indexOf(marker);
  if (idx < 0) throw new Error('❌ Lirik "' + q + '" tidak tersedia.');
  const after = lyricHtml.slice(idx + marker.length);
  const divMatch = after.match(/<div[^>]*>([\s\S]*?)<\/div>/i);
  const rawDiv = divMatch ? divMatch[1] : after.split('</div>')[0];
  const withBreaks = String(rawDiv || '').replace(/<br\s*\/?>/gi, '\n');
  const stripped = withBreaks.replace(/<[^>]+>/g, '');
  const text = decodeLyricEntities(stripped).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 3500);
  if (!text || text.length < 20) throw new Error('❌ Lirik "' + q + '" tidak tersedia.');
  let title = q;
  let artist = '';
  try {
    const t = lyricHtml.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (t && t[1]) {
      // Format umum: "ARTIST - TITLE Lyrics | AZLyrics.com"
      const cleaned = t[1].replace(/\s*\|\s*AZLyrics\.com\s*/i, '').replace(/\s+Lyrics\s*$/i, '').trim();
      const dash = cleaned.indexOf(' - ');
      if (dash > 0) {
        artist = cleaned.slice(0, dash).trim();
        title = cleaned.slice(dash + 3).trim() || q;
      } else if (cleaned) {
        title = cleaned;
      }
    }
  } catch {
    // abaikan, pakai default
  }
  return { title, artist, album: '', text };
}

function formatLirik(l) {
  return '🎶 *' + l.title + '* — ' + l.artist + '\n\n' + l.text;
}

// ------------------------------------------------------------- shortlink ---
// Rantai: is.gd (GET json) → cleanuri (POST) → tinyurl (GET teks).
// Contoh: const s = await shortlink('https://google.com/xxx');
async function shortlink(url) {
  const u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) throw new Error('Contoh: .shortlink https://contoh.com/panjang');
  // 1) is.gd
  try {
    await politeWait(500);
    const j = await getJson('https://is.gd/create.php?format=json&url=' + encodeURIComponent(u));
    if (j && j.shorturl) return { short: j.shorturl, via: 'is.gd' };
    throw new Error('isgd kosong');
  } catch (e1) {
    // 2) cleanuri
    try {
      await politeWait(500);
      const res = await doFetch('https://cleanuri.com/api/v1/shorten', {
        method: 'POST',
        headers: Object.assign({}, UA, { 'Content-Type': 'application/x-www-form-urlencoded' }),
        body: 'url=' + encodeURIComponent(u),
        signal: AbortSignal.timeout(20000),
      });
      const j = await res.json();
      if (j && j.result_url) return { short: j.result_url, via: 'cleanuri' };
      throw new Error('cleanuri kosong');
    } catch (e2) {
      // 3) tinyurl
      await politeWait(500);
      const t = await getText('https://tinyurl.com/api-create.php?url=' + encodeURIComponent(u));
      if (t && /^https?:\/\//i.test(t.trim())) return { short: t.trim(), via: 'tinyurl' };
      throw new Error('❌ Semua layanan shortlink gagal. Coba lagi nanti.');
    }
  }
}

// ----------------------------------------------------------------- kbbi ---
// Rantai: kbbi.web.id/{kata} → kemdikbud entri/{kata}.
// cheerio dipakai bila ada, else potong teks 1500 char. Cache Map.
// Contoh: const k = await kbbi('cinta');
const kbbiCache = new Map();
let cheerioMod = null;
try {
  cheerioMod = require('cheerio');
} catch {
  cheerioMod = null;
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKbbi(html, kata) {
  const norm = String(kata || '').trim().toLowerCase();
  let text = '';
  if (cheerioMod) {
    try {
      const $ = cheerioMod.load(html);
      const cand = [];
      $('article, .result, #result, .entri, main, .container').each((i, el) => {
        const t = $(el).text().replace(/\s+/g, ' ').trim();
        if (t && t.length > 40) cand.push(t);
      });
      if (cand.length) {
        cand.sort((a, b) => b.length - a.length);
        text = cand[0].slice(0, 1500);
      } else {
        text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 1500);
      }
    } catch {
      text = '';
    }
    if (!text) text = stripHtml(html).slice(0, 1500);
  } else {
    text = stripHtml(html).slice(0, 1500);
  }
  // Deteksi rujukan kata baku, cth: "apo·tik ? apotek", "ap·otek → apotek", "lihat apotek".
  const cleanRef = (s) => String(s || '').toLowerCase().replace(/·/g, '').replace(/[^a-zà-ÿ]/gi, '').trim();
  const normClean = cleanRef(norm);
  let reference = norm;
  let m = null;
  m = String(text || '').match(/([\wÀ-ÿ·'’\-]+)\s*\?\s*([\wÀ-ÿ·'’\-]+)/);
  if (m && m[2]) {
    const r = cleanRef(m[2]);
    if (r && r !== normClean) reference = r;
  }
  if (reference === norm) {
    m = String(text || '').match(/→\s*([\wÀ-ÿ·'’\-]+)/);
    if (m && m[1]) {
      const r = cleanRef(m[1]);
      if (r && r !== normClean) reference = r;
    }
  }
  if (reference === norm) {
    m = String(text || '').match(/lihat\s+([\wÀ-ÿ·'’\-]+)/i);
    if (m && m[1]) {
      const r = cleanRef(m[1]);
      if (r && r !== normClean) reference = r;
    }
  }
  return { text, reference: reference || norm };
}

async function fetchEntry(kata) {
  const u = 'https://kbbi.web.id/' + encodeURIComponent(kata);
  await politeWait(800);
  const html = await getText(u);
  const parsed = extractKbbi(html, kata);
  const text = (parsed && parsed.text) || '';
  const reference = (parsed && parsed.reference) || kata;
  return { text, reference, sumber: u };
}

async function kbbi(kata) {
  const k = String(kata || '').trim().toLowerCase().replace(/[^a-zÀ-ÿ ]/gi, '').trim();
  if (!k) throw new Error('Contoh: .kbbi cinta');
  if (kbbiCache.has(k)) return kbbiCache.get(k);
  const first = await fetchEntry(k);
  // Ikuti rujukan kata baku bila beda dari kata input, cth: apotik -> apotek.
  if (first.reference && first.reference !== k) {
    try {
      const ref = await fetchEntry(first.reference);
      if (ref.text && ref.text.length > 40) {
        const out = { kata: first.reference, arti: ref.text, sumber: ref.sumber };
        if (kbbiCache.size > 100) kbbiCache.delete(kbbiCache.keys().next().value);
        kbbiCache.set(k, out);
        return out;
      }
    } catch {
      // abaikan, pakai hasil pertama di bawah
    }
  }
  if (first.text && first.text.length > 40) {
    const out = { kata: first.reference && first.reference !== k ? first.reference : k, arti: first.text, sumber: first.sumber };
    if (kbbiCache.size > 100) kbbiCache.delete(kbbiCache.keys().next().value);
    kbbiCache.set(k, out);
    return out;
  }
  throw new Error('❌ Arti "' + k + '" tidak ketemu di KBBI.');
}

// -------------------------------------------------------------- handlers ---
// Contoh router:
//   if (cmd === 'jadwalsholat') return await handleSholat(sock, jid, m, args);
//   if (cmd === 'quran') return await handleQuran(sock, jid, m, args);
//   if (cmd === 'gempa') return await handleGempa(sock, jid, m);
//   if (cmd === 'lirik') return await handleLirik(sock, jid, m, args);
//   if (cmd === 'shortlink') return await handleShortlink(sock, jid, m, args);
//   if (cmd === 'kbbi') return await handleKbbi(sock, jid, m, args);

async function safeSend(sock, jid, m, text) {
  return await sock.sendMessage(jid, { text: String(text).slice(0, 4000) }, { quoted: m });
}

async function handleSholat(sock, jid, m, args) {
  const a = String(args || '').trim();
  if (!a) return await safeSend(sock, jid, m, 'Contoh: .jadwalsholat Jakarta');
  await safeSend(sock, jid, m, '🕌 Lagi ambil jadwal sholat...').catch(() => {});
  try {
    const now = new Date();
    const cities = await cariKotaSholat(a.split('|')[0].trim());
    const picked = cities[0];
    const j = await jadwalSholat(picked.id, now.getFullYear(), now.getMonth() + 1, now.getDate());
    return await safeSend(sock, jid, m, formatSholat(j));
  } catch (e) {
    console.error('sholat', (e && e.message) || e);
    return await safeSend(sock, jid, m, String((e && e.message) || '❌ Gagal ambil jadwal sholat.'));
  }
}

async function handleQuran(sock, jid, m, args) {
  const parts = String(args || '').trim().split(/\s+/);
  if (!parts[0]) return await safeSend(sock, jid, m, 'Contoh: .quran 112  (opsional: .quran 112 3 = 3 ayat)');
  try {
    const d = await quranSurat(parts[0]);
    return await safeSend(sock, jid, m, formatQuran(d, parts[1]));
  } catch (e) {
    console.error('quran', (e && e.message) || e);
    return await safeSend(sock, jid, m, String((e && e.message) || '❌ Gagal ambil surat.'));
  }
}

async function handleGempa(sock, jid, m) {
  await safeSend(sock, jid, m, '🌋 Lagi ambil info gempa BMKG...').catch(() => {});
  try {
    const g = await gempa();
    return await safeSend(sock, jid, m, formatGempa(g));
  } catch (e) {
    console.error('gempa', (e && e.message) || e);
    return await safeSend(sock, jid, m, String((e && e.message) || '❌ Gagal ambil info gempa.'));
  }
}

async function handleLirik(sock, jid, m, args) {
  if (!args) return await safeSend(sock, jid, m, 'Contoh: .lirik dhyo haw bajingan');
  await safeSend(sock, jid, m, '🎶 Lagi cari lirik...').catch(() => {});
  try {
    const l = await lirik(args);
    return await safeSend(sock, jid, m, formatLirik(l));
  } catch (e) {
    console.error('lirik', (e && e.message) || e);
    return await safeSend(sock, jid, m, String((e && e.message) || '❌ Gagal ambil lirik.'));
  }
}

async function handleShortlink(sock, jid, m, args) {
  if (!args) return await safeSend(sock, jid, m, 'Contoh: .shortlink https://contoh.com/link-panjang');
  try {
    const s = await shortlink(args.split(/\s+/)[0]);
    return await safeSend(sock, jid, m, '🔗 *Shortlink (' + s.via + '):*\n' + s.short);
  } catch (e) {
    console.error('shortlink', (e && e.message) || e);
    return await safeSend(sock, jid, m, String((e && e.message) || '❌ Gagal memperpendek link.'));
  }
}

async function handleKbbi(sock, jid, m, args) {
  if (!args) return await safeSend(sock, jid, m, 'Contoh: .kbbi cinta');
  await safeSend(sock, jid, m, '📖 Lagi buka KBBI...').catch(() => {});
  try {
    const k = await kbbi(args.split(/\s+/)[0]);
    return await safeSend(sock, jid, m, '📖 *' + k.kata + '*\n' + k.arti + '\n_' + k.sumber + '_');
  } catch (e) {
    console.error('kbbi', (e && e.message) || e);
    return await safeSend(sock, jid, m, String((e && e.message) || '❌ Gagal buka KBBI.'));
  }
}

module.exports = {
  cariKotaSholat,
  jadwalSholat,
  formatSholat,
  quranSurat,
  formatQuran,
  gempa,
  formatGempa,
  lirik,
  formatLirik,
  shortlink,
  kbbi,
  handleSholat,
  handleQuran,
  handleGempa,
  handleLirik,
  handleShortlink,
  handleKbbi,
};
