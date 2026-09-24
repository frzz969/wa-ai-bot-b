// lib/fun.js — LANE FUN (murni lokal, tanpa API)
// truth/dare/bisakah/apakah/kapankah/rate/pantun/fakta/alay/hilih/jodoh/weton.
// Pola adaptasi Akira (bacot.json/anime.json di E:\folder projek vs code\akirabotv1\akiraganz\):
// file JSON dibaca bila ada (tulis ulang lewat loader), bila tak ada → fallback statis.
// Contoh router:
//   const fun = require('../lib/fun');
//   if (cmd === 'truth') return await sock.sendMessage(jid, { text: fun.truth() }, { quoted: m });

const fs = require('fs');
const path = require('path');

const AKIRA_DIR = process.env.AKIRA_DIR || path.join('E:', 'folder projek vs code', 'akirabotv1', 'akiraganz');

// Muat JSON eksternal bila ada & valid array, else null (→ fallback statis).
function loadAkiraJson(name) {
  try {
    const p = path.join(AKIRA_DIR, name);
    if (!fs.existsSync(p)) return null;
    const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr.map(String);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------- fallback ---
const TRUTH_STATIC = [
  'Siapa orang yang diam-diam kamu suka sekarang?',
  'Apa kebohongan terbesar yang pernah kamu katakan ke orang tua?',
  'Kapan terakhir kali kamu nangis? Karena apa?',
  'Apa hal paling memalukan yang pernah kamu lakukan di sekolah?',
  'Siapa nama mantan yang belum bisa kamu lupain?',
  'Pernah stalking siapa sampai ke postingan paling lama? Ngaku!',
  'Apa chat yang paling kamu sesali pernah dikirim?',
  'Kalau bisa balik ke masa lalu, apa yang mau kamu ubah?',
];

const DARE_STATIC = [
  'Kirim voice note nyanyi lagu favoritmu, minimal 10 detik!',
  'Ganti nama grup jadi "Aku Sayang Kamu" selama 1 jam!',
  'Chat mantanmu dengan teks "hai, kangen" lalu screenshot ke sini!',
  'Kirim foto muka jelekmu ke chat ini sekarang!',
  'Telepon kontak ke-5 di HP kamu dan bilang "aku sayang kamu"!',
  'Push-up 10x lalu kirim video buktinya!',
  'Kirim 100 ribu ke teman yang paling aktif di grup ini! (bercanda... atau tidak)',
  'Teriak "AKU GANTENG/CANTIK" pakai voice note!',
];

const PANTUN_STATIC = [
  'Jalan-jalan ke kota Blitar,\nJangan lupa membeli sukun.\nKalau kamu rajin belajar,\nMasa depan cerah menanti pun.',
  'Burung nuri burung dara,\nTerbang tinggi ke angkasa.\nJangan suka menunda-nunda,\nNanti menyesal tak berasa.',
  'Makan soto di pinggir jalan,\nMinumnya es teh manis.\nJangan lupa tersenyum kawan,\nHidup ini harus optimis.',
  'Ke pasar beli pepaya,\nPulangnya mampir ke Kediri.\nRajin-rajinlah berdoa,\nAgar hidup penuh berkah diri.',
  'Naik kereta ke Surabaya,\nDuduk manis di samping jendela.\nBelajar giat setiap harinya,\nSukses menanti di depan mata.',
];

const FAKTA_STATIC = [
  'Madu tidak pernah basi. Arkeolog menemukan madu 3000 tahun di makam Mesir yang masih bisa dimakan.',
  'Gurita punya tiga jantung dan darah berwarna biru.',
  'Pisang mengapung di air, sedangkan apel 25% volumenya adalah udara.',
  'Sidik lidah manusia unik — tidak ada dua orang yang sama.',
  'Jantung udang terletak di kepalanya.',
  'Koala tidur hingga 22 jam sehari.',
  'Air panas bisa membeku lebih cepat dari air dingin (efek Mpemba).',
  'Satu hari di Venus lebih lama dari satu tahun di Venus.',
];

const TRUTH = loadAkiraJson('truth.json') || TRUTH_STATIC;
const DARE = loadAkiraJson('dare.json') || DARE_STATIC;
const PANTUN = loadAkiraJson('pantun.json') || PANTUN_STATIC;
const FAKTA = loadAkiraJson('fakta.json') || FAKTA_STATIC;

// ---------------------------------------------------------------- util ---
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Hash deterministik agar .rate/.jodoh stabil untuk input sama.
function hashStr(s) {
  let h = 2166136261;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ----------------------------------------------------------------- api ---
// Contoh: fun.truth() → '🤔 Truth: ...'
function truth() {
  return '🤔 *Truth:*\n' + pick(TRUTH);
}

function dare() {
  return '😈 *Dare:*\n' + pick(DARE);
}

function pantun() {
  return '🎭 *Pantun:*\n' + pick(PANTUN);
}

function fakta() {
  return '🧠 *Fakta unik:*\n' + pick(FAKTA);
}

// Contoh: fun.bisakah('terbang') → 'Bisa, ...'
function bisakah(q) {
  const s = String(q || '').trim();
  if (!s) return 'Contoh: .bisakah terbang';
  const ya = hashStr('bisa' + s.toLowerCase()) % 2 === 0;
  const jawab = ya
    ? pick(['Bisa dong!', 'Bisa, asal niat!', 'Sangat bisa!'])
    : pick(['Tidak bisa!', 'Mustahil!', 'Mimpi kali ya!']);
  return '🔮 *Bisakah ' + s + '?*\n' + jawab;
}

// Contoh: fun.apakah('aku ganteng') → 'Ya, ...'
function apakah(q) {
  const s = String(q || '').trim();
  if (!s) return 'Contoh: .apakah aku ganteng';
  const ya = hashStr('apakah' + s.toLowerCase()) % 2 === 0;
  return '🔮 *Apakah ' + s + '?*\n' + (ya ? pick(['Ya!', 'Iya, betul!', 'Tentu saja!']) : pick(['Tidak!', 'Bukan!', 'Enggak!']));
}

// Contoh: fun.kapankah('aku nikah') → 'Besok, ...'
function kapankah(q) {
  const s = String(q || '').trim();
  if (!s) return 'Contoh: .kapankah aku nikah';
  const h = hashStr('kapan' + s.toLowerCase());
  const units = ['detik lagi', 'menit lagi', 'jam lagi', 'hari lagi', 'minggu lagi', 'bulan lagi', 'tahun lagi'];
  return '🔮 *Kapankah ' + s + '?*\n' + ((h % 100) + 1) + ' ' + units[h % units.length];
}

// Contoh: fun.rate('ketampananku') → 'Rate ...: 87/100'
function rate(q) {
  const s = String(q || '').trim();
  if (!s) return 'Contoh: .rate ketampananku';
  const v = hashStr('rate' + s.toLowerCase()) % 101;
  const emoji = v >= 80 ? '🔥' : v >= 50 ? '👍' : '😅';
  return emoji + ' *Rate ' + s + ': ' + v + '/100*';
}

// Ubah teks gaya alay. Contoh: fun.alay('halo apa kabar')
function alay(text) {
  const s = String(text || '').trim();
  if (!s) return 'Contoh: .alay halo apa kabar';
  const map = { a: '4', e: '3', i: '1', o: '0', s: '5', g: '9', b: '8' };
  return s
    .split('')
    .map((c) => {
      const low = c.toLowerCase();
      if (map[low] && Math.random() < 0.5) return map[low];
      return Math.random() < 0.3 ? c.toUpperCase() : c.toLowerCase();
    })
    .join('');
}

// Ubah semua vokal jadi "i" (gaya hilih). Contoh: fun.hilih('kamu kenapa')
function hilih(text) {
  const s = String(text || '').trim();
  if (!s) return 'Contoh: .hilih kamu kenapa';
  return s.replace(/[aiueoAIUEO]/g, (c) => (c === c.toUpperCase() ? 'I' : 'i'));
}

// Kecocokan jodoh 0-100 + label. Contoh: fun.jodoh('Andi', 'Sinta')
function jodoh(n1, n2) {
  const a = String(n1 || '').trim();
  const b = String(n2 || '').trim();
  if (!a || !b) return 'Contoh: .jodoh Andi Sinta';
  const key = [a.toLowerCase(), b.toLowerCase()].sort().join('&');
  const v = hashStr('jodoh' + key) % 101;
  const label = v >= 85 ? '💖 SANGAT COCOK! Jodoh dunia akhirat!' : v >= 65 ? '💕 Cocok! Lanjut ke pelaminan!' : v >= 40 ? '🙂 Lumayan, masih bisa diperjuangkan.' : '😅 Kurang cocok, cari yang lain aja.';
  return '💘 *Jodoh ' + a + ' & ' + b + ': ' + v + '%*\n' + label;
}

const PASARAN = ['Legi', 'Pahing', 'Pon', 'Wage', 'Kliwon'];
const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// Weton Jawa dari tanggal lahir. Epoch: 1 Jan 1970 = Kamis Wage.
// Contoh: fun.weton('17-8-1945') atau fun.weton('17 8 1945')
function weton(input) {
  const parts = String(input || '').trim().split(/[^0-9]+/).filter(Boolean).map(Number);
  if (parts.length < 3) return 'Contoh: .weton 17-8-1945';
  const d = parts[0];
  const mo = parts[1];
  const y = parts[2] < 100 ? 2000 + parts[2] : parts[2];
  const dt = new Date(y, mo - 1, d);
  if (isNaN(dt.getTime()) || dt.getDate() !== d || dt.getMonth() !== mo - 1) return '❌ Tanggal tidak valid. Contoh: .weton 17-8-1945';
  const epoch = new Date(1970, 0, 1); // Kamis Wage
  const diffDays = Math.round((dt - epoch) / 86400000);
  const pasaran = PASARAN[((diffDays % 5) + 5) % 5];
  const hari = HARI_ID[dt.getDay()];
  return '🗓️ *Weton ' + d + '-' + mo + '-' + y + ':*\n' + hari + ' ' + pasaran;
}

module.exports = {
  truth,
  dare,
  pantun,
  fakta,
  bisakah,
  apakah,
  kapankah,
  rate,
  alay,
  hilih,
  jodoh,
  weton,
};
