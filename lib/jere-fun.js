// lib/jere-fun.js — Port murni game/primbon/random/alkitab dari jere-md (Jere API).
// Sumber: ../jere-md_with_autofollow/jere-md with jereapi/plugins/game|primbon|random|alkitab.
// Pola asal: GET /api/game/<nama>?apikey=, GET /api/primbon/<nama>?apikey=&...,
//   GET /api/random/animequotes?apikey=, GET /api/alkitab/alkitab?apikey=&kitab=&pasal=&ayat=.
// Di sini key DIURUS jereGet (./jere-api.js) — file ini TIDAK pernah menyentuh/me-log key.
// Semua fungsi MURNI: tanpa state koneksi/Baileys. State sesi game (conn.game,
// timeout 60 dtk, jawab/nyerah) diurus router nanti — lihat referensi perilaku di
// plugins/game/maths.js + maths_ans.js yang diport normalisasinya ke bawah.
// CommonJS, tanpa dependensi baru (pakai fetch global + ./jere-api.js).
'use strict';

const { jereGet } = require('./jere-api');

// ── Game ────────────────────────────────────────────────────────────────
// Timeout & reward mengikuti plugins/game/*.js: 60 detik, +500 XP & +10 Koin.
const GAME_TIMEOUT_MS = 60_000;
const GAME_REWARD = Object.freeze({ xp: 500, coin: 10 });

// Endpoint kanonis = nama file plugin tanpa .js → GET /api/game/<endpoint>.
// Daftar di bawah mencakup kuis yang diminta router: tebakgambar/hewan/kata/
// kalimat/logo/lirik/lagu/kimia/kartun/jkt/bendera/heroml/warna, susunkata,
// asahotak, family100, maths, tekateki, siapakahaku, caklontong, surah,
// kabupaten, lengkapikalimat. "tukar" BUKAN kuis (tukar koin→limit, lihat
// tukarKoin()) sehingga tidak masuk daftar fetch.
const GAME_ENDPOINTS = Object.freeze([
  'tebakgambar',
  'tebakhewan',
  'tebakkata',
  'tebakkalimat',
  'tebaklogo',
  'tebaklirik',
  'tebaklagu',
  'tebakkimia',
  'tebakkartun',
  'tebakjkt',
  'tebakbendera',
  'tebakheroml',
  'tebakwarna',
  'susunkata',
  'asahotak',
  'family100',
  'maths',
  'tekateki',
  'siapakahaku',
  'caklontong',
  'surah',
  'kabupaten',
  'lengkapikalimat',
]);

// Alias pendek (tanpa prefix "tebak") agar router bisa pakai "hewan", "kata",
// "bendera", "jkt", "warna", "heroml", dst.
const GAME_ALIASES = Object.freeze({
  gambar: 'tebakgambar',
  hewan: 'tebakhewan',
  kata: 'tebakkata',
  kalimat: 'tebakkalimat',
  logo: 'tebaklogo',
  lirik: 'tebaklirik',
  lagu: 'tebaklagu',
  kimia: 'tebakkimia',
  kartun: 'tebakkartun',
  jkt: 'tebakjkt',
  jkt48: 'tebakjkt',
  bendera: 'tebakbendera',
  heroml: 'tebakheroml',
  ml: 'tebakheroml',
  warna: 'tebakwarna',
  math: 'maths',
  matematika: 'maths',
});

function normalizeGameName(name) {
  const key = String(name == null ? '' : name).trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!key) return '';
  if (GAME_ENDPOINTS.includes(key)) return key;
  if (GAME_ALIASES[key]) return GAME_ALIASES[key];
  return key;
}

function listGames() {
  return [...GAME_ENDPOINTS];
}

function isAudioUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  const clean = url.split(/[?#]/)[0].toLowerCase();
  return clean.endsWith('.mp3') || clean.endsWith('.opus') || clean.endsWith('.m4a') || clean.endsWith('.ogg');
}

// Normalisasi payload soal mengikuti plugins/game/*.js:
//   soal: p.soal||p.pertanyaan||p.str||p.deskripsi||p.caption
//   jawaban: p.jawaban ?? p.result ?? p.nama||p.name||p.title
//   clue: p.bantuan||p.clue||p.tipe
//   media: p.img||p.image||p.gambar||p.link||p.audio||p.url
function normalizeSoal(game, p) {
  const src = p && typeof p === 'object' ? p : {};
  const soal = src.soal || src.pertanyaan || src.str || src.deskripsi || src.caption
    || 'Tebak jawaban dari petunjuk berikut:';
  const jawaban = src.jawaban !== undefined ? src.jawaban
    : (src.result !== undefined ? src.result : (src.nama || src.name || src.title || ''));
  const jawabanList = Array.isArray(jawaban) ? jawaban.map((a) => String(a)) : [String(jawaban)];
  const clue = src.bantuan || src.clue || src.tipe || '';
  const mediaUrl = src.img || src.image || src.gambar || src.link || src.audio || src.url || null;
  const audio = src.audio || (typeof mediaUrl === 'string' && isAudioUrl(mediaUrl) ? mediaUrl : null);
  return {
    game,
    soal: String(soal),
    jawaban,
    jawabanList,
    clue: String(clue || ''),
    mediaUrl: typeof mediaUrl === 'string' ? mediaUrl : null,
    isAudio: Boolean(audio),
    deskripsi: src.deskripsi && String(src.deskripsi) !== String(soal) ? String(src.deskripsi) : '',
    timeoutMs: GAME_TIMEOUT_MS,
    reward: { ...GAME_REWARD },
    raw: src,
  };
}

// Ambil 1 soal kuis dari Jere API. Murni: hanya GET + normalisasi, tanpa
// conn/state/timeout (router yang menyimpan sesi + setTimeout 60 dtk).
// Contoh: const soal = await fetchSoal('tebakgambar');
async function fetchSoal(namaGame) {
  const game = normalizeGameName(namaGame);
  if (!game || !GAME_ENDPOINTS.includes(game)) {
    throw new Error(`Game tidak dikenal: "${namaGame}". Pilihan: ${GAME_ENDPOINTS.join(', ')}`);
  }
  const result = await jereGet(`/api/game/${game}`);
  if (!result || (typeof result === 'object' && Object.keys(result).length === 0)) {
    throw new Error('Jere API tidak mengembalikan soal game.');
  }
  return normalizeSoal(game, result);
}

// ── Jawab / nyerah (port plugins/game/maths_ans.js) ─────────────────────
// maths_ans.js: threshold 0.72, surrender /^((me)?nyerah|surr?ender)$/i,
// cocok persis (case-insensitive, trim, dukung array), "dikit lagi" bila
// mirip. Fungsi ini murni: tidak menyentuh timeout/db.
const SURRENDER_RE = /^((me)?nyerah|surr?ender)$/i;
const CLOSE_THRESHOLD = 0.72;

function normalizeAnswerText(value) {
  return String(value == null ? '' : value).toLowerCase().trim().replace(/\s+/g, ' ');
}

function isSurrender(text) {
  return SURRENDER_RE.test(String(text == null ? '' : text).trim());
}

function isCloseAnswer(input, answer) {
  const a = normalizeAnswerText(answer);
  const b = normalizeAnswerText(input);
  if (!a || !b || b.length <= 2) return false;
  let matchCount = 0;
  for (const ch of b) if (a.includes(ch)) matchCount++;
  return (matchCount / Math.max(a.length, 1)) >= CLOSE_THRESHOLD;
}

// Cek jawaban user terhadap data jawaban soal.
// Mengembalikan { surrender, correct, close } — router yang memutuskan
// hapus sesi / tambah XP / balas "dikit lagi".
function checkJawaban(input, jawaban) {
  const text = String(input == null ? '' : input).trim();
  if (isSurrender(text)) return { surrender: true, correct: false, close: false };
  const norm = normalizeAnswerText(text);
  const list = Array.isArray(jawaban) ? jawaban : [jawaban];
  let correct = false;
  let close = false;
  for (const cand of list) {
    if (norm && norm === normalizeAnswerText(cand)) { correct = true; break; }
  }
  if (!correct) {
    for (const cand of list) {
      if (isCloseAnswer(norm, cand)) { close = true; break; }
    }
  }
  return { surrender: false, correct, close };
}

function formatJawaban(jawaban) {
  if (Array.isArray(jawaban)) return jawaban.map((a) => String(a)).join(' / ');
  return String(jawaban == null ? '' : jawaban);
}

// ── Primbon (11 plugin) ─────────────────────────────────────────────────
// Endpoint = nama file plugin → GET /api/primbon/<endpoint>.
const PRIMBON_DEFS = Object.freeze({
  artinama: { endpoint: 'artinama', params: ['nama'] },
  nomorhoki: { endpoint: 'nomorhoki', params: ['nomor'] },
  tafsirmimpi: { endpoint: 'tafsirmimpi', params: ['mimpi'] },
  zodiak: { endpoint: 'zodiak', params: ['zodiak'] },
  kecocokan_nama_pasangan: { endpoint: 'kecocokan_nama_pasangan', params: ['nama1', 'nama2'] },
  cek_potensi_penyakit: { endpoint: 'cek_potensi_penyakit', params: ['tgl', 'bln', 'thn'] },
  rejeki_hoki_weton: { endpoint: 'rejeki_hoki_weton', params: ['tgl', 'bln', 'thn'] },
  sifat_usaha_bisnis: { endpoint: 'sifat_usaha_bisnis', params: ['tgl', 'bln', 'thn'] },
  ramalanjodoh: { endpoint: 'ramalanjodoh', params: ['nama1', 'tgl1', 'bln1', 'thn1', 'nama2', 'tgl2', 'bln2', 'thn2'] },
  ramalanjodohbali: { endpoint: 'ramalanjodohbali', params: ['nama1', 'tgl1', 'bln1', 'thn1', 'nama2', 'tgl2', 'bln2', 'thn2'] },
  primbon: { endpoint: 'primbon', params: [] },
});

const PRIMBON_ALIASES = Object.freeze({
  kecocokannama: 'kecocokan_nama_pasangan',
  cekpotensipenyakit: 'cek_potensi_penyakit',
  potensipenyakit: 'cek_potensi_penyakit',
  rejekiweton: 'rejeki_hoki_weton',
  sifatusahabisnis: 'sifat_usaha_bisnis',
  usahabisnis: 'sifat_usaha_bisnis',
  mimpi: 'tafsirmimpi',
  artimimpi: 'tafsirmimpi',
  hoki: 'nomorhoki',
  nomor: 'nomorhoki',
  nama: 'artinama',
  jodoh: 'ramalanjodoh',
  jodohbali: 'ramalanjodohbali',
});

function listPrimbon() {
  return Object.keys(PRIMBON_DEFS);
}

function normalizePrimbonKind(kind) {
  const key = String(kind == null ? '' : kind).trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!key) return '';
  if (PRIMBON_DEFS[key]) return key;
  const noSep = key.replace(/\|/g, '');
  if (PRIMBON_DEFS[noSep]) return noSep;
  if (PRIMBON_ALIASES[key]) return PRIMBON_ALIASES[key];
  // Cocokkan longgar: "kecocokan_nama_pasangan" tanpa underscore.
  for (const name of Object.keys(PRIMBON_DEFS)) {
    if (name.replace(/_/g, '') === key) return name;
  }
  return key;
}

// Panggil 1 dari 11 primbon. Murni: validasi param + GET, tanpa format card.
// Contoh: await primbon('artinama', { nama: 'Budi' });
// Contoh: await primbon('cek_potensi_penyakit', { tgl: 1, bln: 1, thn: 2000 });
async function primbon(kind, params = {}) {
  const name = normalizePrimbonKind(kind);
  const def = PRIMBON_DEFS[name];
  if (!def) {
    throw new Error(`Primbon tidak dikenal: "${kind}". Pilihan: ${Object.keys(PRIMBON_DEFS).join(', ')}`);
  }
  const p = params && typeof params === 'object' ? params : {};
  const query = {};
  for (const key of def.params) {
    const val = p[key];
    if (val === undefined || val === null || String(val).trim() === '') {
      throw new Error(`Primbon "${name}" butuh parameter: ${def.params.join(', ')}.`);
    }
    query[key] = String(val).trim();
  }
  if (name === 'zodiak' && query.zodiak) query.zodiak = query.zodiak.toLowerCase();
  if (name === 'nomorhoki' && query.nomor) query.nomor = query.nomor.replace(/[^0-9]/g, '');
  return jereGet(`/api/primbon/${def.endpoint}`, query);
}

// ── Random: animequotes + fakta ─────────────────────────────────────────
// animequotes: GET /api/random/animequotes (butuh key via jereGet).
// Normalisasi mengikuti plugins/random/animequotes.js.
async function animequotes() {
  const r = await jereGet('/api/random/animequotes');
  const src = r && typeof r === 'object' ? r : {};
  return {
    quote: String(src.quote || src.quotes || src.text || ''),
    character: String(src.character || src.karakter || src.char || '-'),
    anime: String(src.anime || src.title || '-'),
    episode: src.episode ? String(src.episode) : '',
    image: src.gambar || src.image || null,
    raw: src,
  };
}

const FAKTA_FALLBACK = Object.freeze([
  'Otak manusia menghasilkan daya listrik sekitar 12 hingga 25 watt, cukup untuk menyalakan lampu LED kecil.',
  'Madu alami adalah satu-satunya makanan yang tidak akan pernah basi atau membusuk bahkan setelah ribuan tahun.',
  'Jantung paus biru berukuran sebesar mobil kecil dan beratnya mencapai sekitar 180 kg.',
  'Lumba-lumba tidur dengan satu mata terbuka dan hanya separuh otaknya yang tertidur untuk tetap waspada.',
  'Air panas dapat membeku lebih cepat daripada air dingin dalam kondisi tertentu, fenomena ini disebut Efek Mpemba.',
  'Gurita memiliki tiga buah jantung dan darah mereka berwarna biru karena kaya akan tembaga (hemosianin).',
  'Satu hari di planet Venus lebih lama daripada satu tahun di Venus karena rotasinya yang sangat lambat.',
  'Kucing menghabiskan sekitar 70% dari hidup mereka untuk tidur.',
  'Kupu-kupu mengecap rasa makanannya menggunakan sensor yang ada di kaki mereka.',
  'Semut tidak memiliki paru-paru, mereka bernapas melalui lubang-lubang kecil di seluruh tubuh yang disebut spirakel.',
]);

// Fakta unik: API gratis uselessfacts (tanpa key), fallback daftar lokal bila
// API gagal — port plugins/random/fakta.js. Murni (tidak pakai jereGet/key).
async function fakta(timeoutMs = 15000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en', {
        headers: { Accept: 'application/json', 'User-Agent': 'wa-ai-bot-b/1.0' },
        signal: controller.signal,
      });
      if (res.ok) {
        const json = await res.json();
        if (json && json.text) return { fakta: String(json.text), source: 'uselessfacts' };
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Abaikan — pakai fallback lokal di bawah.
  }
  const pick = FAKTA_FALLBACK[Math.floor(Math.random() * FAKTA_FALLBACK.length)];
  return { fakta: pick, source: 'lokal' };
}

// ── Alkitab ─────────────────────────────────────────────────────────────
// Port plugins/alkitab/alkitab.js: tanpa argumen → daftar kitab;
// dengan kitab+pasal(+ayat) → isi pasal/ayat.
// GET /api/alkitab/alkitab?kitab=&pasal=&ayat= (key via jereGet).
// Dukung string tunggal "Yohanes 3:16" / "Yohanes 3 16" / "Kejadian 1".
function parseReferensi(ref) {
  const clean = String(ref == null ? '' : ref).trim();
  if (!clean) return { kitab: '', pasal: '', ayat: '' };
  const m = clean.match(/^([1-3]?\s*[a-zA-Z\s-]+?)(?:\s+(\d+)(?:[:\s]+(\d+))?)?$/);
  if (m && m[2]) {
    return { kitab: m[1].trim(), pasal: m[2].trim(), ayat: m[3] ? m[3].trim() : '' };
  }
  return { kitab: clean, pasal: '', ayat: '' };
}

// Contoh: await alkitab() → daftar kitab
// Contoh: await alkitab('Yohanes', 3, 16) / await alkitab('Yohanes 3:16')
async function alkitab(kitab, pasal = '', ayat = '') {
  let k = String(kitab == null ? '' : kitab).trim();
  let p = String(pasal == null ? '' : pasal).trim();
  let a = String(ayat == null ? '' : ayat).trim();
  if (k && !p && !a && /\d/.test(k)) {
    const parsed = parseReferensi(k);
    k = parsed.kitab; p = parsed.pasal; a = parsed.ayat;
  }
  if (!k) return jereGet('/api/alkitab/alkitab');
  return jereGet('/api/alkitab/alkitab', { kitab: k, pasal: p, ayat: a });
}

// ── Tukar koin → limit (port plugins/game/tukar.js, murni) ──────────────
// Kurs: 50 koin = 1 limit. Tanpa DB: terima saldo koin + input user,
// kembalikan hasil kalkulasi; router yang memotong/menambah saldo.
const TUKAR_RATE = 50;

function tukarKoin(coin, input) {
  const saldo = Math.max(0, Math.floor(Number(coin) || 0));
  const raw = String(input == null ? '' : input).trim().toLowerCase();
  if (!raw) return { needInput: true, rate: TUKAR_RATE, coin: saldo };
  let count = 0;
  if (raw === 'all' || raw === 'semua') {
    count = Math.floor(saldo / TUKAR_RATE);
    if (count < 1) {
      throw new Error(`Koin tidak cukup untuk ditukar minimal 1 limit (butuh minimal ${TUKAR_RATE} koin). Koin saat ini: ${saldo}`);
    }
  } else {
    count = parseInt(raw.replace(/[^0-9]/g, ''), 10);
    if (!count || Number.isNaN(count) || count < 1) {
      throw new Error('Masukkan jumlah limit yang ingin ditukar! Contoh: tukar 5 / tukar all');
    }
  }
  const cost = count * TUKAR_RATE;
  if (saldo < cost) {
    throw new Error(`Koin tidak cukup! Untuk ${count} limit butuh ${cost} koin. Koin saat ini: ${saldo}`);
  }
  return { count, cost, rate: TUKAR_RATE, coin: saldo, sisa: saldo - cost };
}

module.exports = {
  GAME_TIMEOUT_MS,
  GAME_REWARD,
  listGames,
  normalizeGameName,
  fetchSoal,
  normalizeSoal,
  checkJawaban,
  isSurrender,
  isCloseAnswer,
  formatJawaban,
  CLOSE_THRESHOLD,
  listPrimbon,
  primbon,
  animequotes,
  fakta,
  alkitab,
  parseReferensi,
  tukarKoin,
  TUKAR_RATE,
};
