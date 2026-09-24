// lib/info.js — LANE GRUP: teks .rules & .animesaran (CommonJS, prefix ".").
// Adaptasi modern dari akiraganz/rules.js (tanpa donasi/sewabot) dan
// akiraganz/animesaran.js. anime.json bila ada dipakai, fallback list statis.

const fs = require('fs');
const path = require('path');

function rulesText(prefix) {
  const p = String(prefix || '.');
  return (
    `📜 *RULES PENGGUNA BOT*\n\n` +
    `➤ Gunakan delay, jangan spam. Mentang-mentang gratis jangan diborong semua.\n` +
    `➤ Dilarang call/VC bot — nomor yang call/VC otomatis diblokir.\n` +
    `➤ Bot tidak online 24 jam, tergantung kesediaan owner.\n` +
    `➤ Di grup: pakai prefix "${p}" atau mention bot agar direspons.\n\n` +
    `*Konsekuensi bila melanggar:*\n` +
    `Bot akan memblokir kamu atau keluar dari grup yang kamu kelola.\n\n` +
    `━━━━━━━━ [ *PENTING!* ] ━━━━━━━━\n` +
    `➤ Kami tidak menyimpan gambar, video, audio, dan dokumen yang kamu kirim.\n` +
    `➤ Kami tidak akan pernah meminta informasi pribadimu.\n` +
    `➤ Jika menemukan bug/error, langsung lapor ke owner bot.\n` +
    `➤ Jika kamu menelpon bot dan diblokir, owner tidak bertanggung jawab.\n` +
    `➤ Apapun yang kamu perintahkan pada bot ini, KAMI TIDAK AKAN BERTANGGUNG JAWAB.`
  );
}

const STATIC_ANIME = [
  { title: 'Romance: heroine awalnya benci lalu jatuh cinta', items: ['Fuuka', "Masamune's Revenge", 'Tonari no Kaibutsu-kun', 'Kaichou wa Maid-sama!', 'Nisekoi', 'Akame ga Kill'] },
  { title: 'Isekai + MC OP', items: ['Tensei Shitara Slime Datta Ken', 'No Game No Life', 'Arifureta Shokugyo de Sekai Saikyou', 'Maou-sama, Retry!', 'Yojou Senki (Saga of Tanya)'] },
  { title: 'Top Romance/Action', items: ['Kishuku Gakkou no Juliet', 'Devil Line', 'Beatless'] },
  { title: 'MC OP tapi tidak sadar / tidak bisa kendalikan', items: ['Musaigen no Phantom World', 'Witch Craft Works', 'Bungo Stray Dogs', 'Owari no Seraph', 'Kyoukai no Kanata'] },
  { title: 'MC kalem / badass', items: ['Angel Beats!', 'Tokyo Ghoul', 'Darling in the FranXX', 'Golden Time'] },
  { title: 'Harem + MC OP', items: ['Highschool DxD', 'Trinity Seven', 'IS: Infinite Stratos', 'Campione!'] },
  { title: 'MC jenius / ahli siasat', items: ['Dr. Stone', 'Classroom of the Elite', 'No Game No Life', 'Death Note', 'Hyouka'] },
  { title: 'MC pensiunan legenda yang kembali', items: ['Noragami', 'Hataraku Maou-sama!', 'Violet Evergarden', 'Rokudenashi Majutsu Koushi'] },
];

// Coba baca anime.json (format bebas: array string / array {title,items} / object kategori).
// Lokasi dicoba: database/anime.json (repo ini) lalu fallback statis.
function getAnimeList() {
  const candidates = [
    path.join(__dirname, '..', 'database', 'anime.json'),
    path.join(__dirname, 'anime.json'),
  ];
  for (const f of candidates) {
    try {
      if (!fs.existsSync(f)) continue;
      const raw = fs.readFileSync(f, 'utf8').trim();
      if (!raw) continue;
      const data = JSON.parse(raw);
      const norm = normalizeAnimeData(data);
      if (norm && norm.length) return norm;
    } catch { /* lanjut kandidat berikut */ }
  }
  return STATIC_ANIME;
}

function normalizeAnimeData(data) {
  if (Array.isArray(data)) {
    // Array string judul saja -> satu kategori.
    if (data.length && data.every((x) => typeof x === 'string')) {
      const items = data.filter(Boolean).slice(0, 60);
      if (!items.length) return null;
      // Abaikan bila isinya JID grup (file lama berisi id grup, bukan judul).
      if (items.every((x) => /@g\.us$/.test(String(x)))) return null;
      return [{ title: 'Rekomendasi Anime', items }];
    }
    // Array object {title, items|list}.
    const cats = [];
    for (const c of data) {
      if (!c || typeof c !== 'object') continue;
      const title = String(c.title || c.kategori || c.category || '').trim() || 'Rekomendasi Anime';
      const items = Array.isArray(c.items) ? c.items : Array.isArray(c.list) ? c.list : [];
      const clean = items.map((x) => String(x).trim()).filter(Boolean).slice(0, 30);
      if (clean.length) cats.push({ title, items: clean });
    }
    return cats.length ? cats : null;
  }
  if (data && typeof data === 'object') {
    const cats = [];
    for (const [k, v] of Object.entries(data)) {
      if (!Array.isArray(v)) continue;
      const clean = v.map((x) => String(x).trim()).filter(Boolean).slice(0, 30);
      if (clean.length) cats.push({ title: String(k).trim() || 'Rekomendasi Anime', items: clean });
    }
    return cats.length ? cats : null;
  }
  return null;
}

function animeSaranText() {
  const cats = getAnimeList();
  const body = cats
    .map((c) => `*${c.title}*\n${c.items.map((t) => `° ${t}`).join('\n')}`)
    .join('\n________________________\n');
  return `🎌 *SARAN ANIME*\n\n${body}`;
}

module.exports = {
  rulesText,
  animeSaranText,
  getAnimeList,
  STATIC_ANIME,
};
