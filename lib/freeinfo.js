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
// GET https://lrclib.net/api/search?q= (header UA wajib, jeda sopan).
// Contoh: const l = await lirik('dhyo haw bajingan');
async function lirik(query) {
  const q = String(query || '').trim();
  if (!q) throw new Error('Contoh: .lirik dhyo haw bajingan');
  await politeWait(800);
  const arr = await getJson('https://lrclib.net/api/search?q=' + encodeURIComponent(q), { headers: UA });
  if (!Array.isArray(arr) || !arr.length) throw new Error('❌ Lirik "' + q + '" tidak ketemu.');
  // Pilih yang berdurasi & bukan instrumental.
  const hit = arr.find((x) => x && x.plainLyrics && !x.instrumental) || arr[0];
  if (!hit || !hit.plainLyrics) throw new Error('❌ Lirik "' + q + '" tidak tersedia (instrumental?).');
  return {
    title: hit.trackName || q,
    artist: hit.artistName || '',
    album: hit.albumName || '',
    text: String(hit.plainLyrics).slice(0, 3500),
  };
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
  if (cheerioMod) {
    const $ = cheerioMod.load(html);
    const cand = [];
    $('article, .result, #result, .entri, main, .container').each((i, el) => {
      const t = $(el).text().replace(/\s+/g, ' ').trim();
      if (t && t.length > 40) cand.push(t);
    });
    if (cand.length) {
      cand.sort((a, b) => a.length - b.length);
      return cand[0].slice(0, 1500);
    }
    const body = $('body').text().replace(/\s+/g, ' ').trim();
    return body.slice(0, 1500);
  }
  return stripHtml(html).slice(0, 1500);
}

async function kbbi(kata) {
  const k = String(kata || '').trim().toLowerCase().replace(/[^a-z ]/g, '');
  if (!k) throw new Error('Contoh: .kbbi cinta');
  if (kbbiCache.has(k)) return kbbiCache.get(k);
  const urls = [
    'https://kbbi.web.id/' + encodeURIComponent(k),
    'https://kbbi.kemdikbud.go.id/entri/' + encodeURIComponent(k),
  ];
  let lastErr = null;
  for (const u of urls) {
    try {
      await politeWait(800);
      const html = await getText(u);
      const text = extractKbbi(html, k);
      if (text && text.length > 40) {
        const out = { kata: k, arti: text, sumber: u };
        if (kbbiCache.size > 100) kbbiCache.delete(kbbiCache.keys().next().value);
        kbbiCache.set(k, out);
        return out;
      }
      lastErr = new Error('kosong');
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error('❌ Arti "' + k + '" tidak ketemu di KBBI. ' + String((lastErr && lastErr.message) || ''));
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
