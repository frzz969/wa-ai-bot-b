// handlers/menu.js — menu bot (estetika ala Jere: ringkas + navigasi per kategori).
//
// MODE:
//   .menu            → profil + statistik + navigasi (ringkas, enak dibaca)
//   .menu all        → semua command, dikelompokkan per kategori
//   .menu list       → daftar kategori saja
//   .menu <kategori> → command satu kategori (cocok sebagian, mis. "dl" atau "jere")
//
// BADGE:
//   🌟  butuh JERE_API_KEY valid (fitur Jere — belum aktif selama key ditolak)
//   💬  perlu reply pesan (gambar/stiker/media)

// cmd: [nama, keterangan]; reply: true → butuh reply; jere: true → butuh key Jere.
const CATEGORIES = [
  {
    tag: 'bot', title: '🤖 BOT', items: [
      ['menu', 'tampilkan menu ini'],
      ['about', 'info tentang bot'],
      ['status', 'cek status bot'],
      ['ping', 'cek respon bot'],
      ['rules', 'peraturan bot'],
    ],
  },
  {
    tag: 'chat', title: '💬 CHAT', items: [
      ['ai', 'tanya AI (ingat 10 pesan)'],
      ['talk', 'mode curhat gaya lembut'],
      ['stoptalk', 'keluar mode curhat'],
      ['new', 'mulai chat baru'],
      ['clear', 'hapus ingatan'],
      ['memory', 'lihat ingatan'],
      ['model', 'lihat model aktif'],
    ],
  },
  {
    tag: 'ai', title: '🧠 AI TOOLS', items: [
      ['ask', 'tanya apa saja'],
      ['explain', 'jelaskan sederhana'],
      ['summarize', 'ringkas teks'],
      ['rewrite', 'tulis ulang gaya beda'],
      ['translate', 'terjemahkan ID ⇄ EN'],
      ['ideas', 'buat 7 ide'],
      ['qr', 'buat QR dari teks'],
    ],
  },
  {
    tag: 'code', title: '💻 CODING', items: [
      ['code', 'buatkan kode'],
      ['debug', 'analisis error'],
      ['fix', 'perbaiki kode'],
      ['run', 'eksekusi JS (owner)', { owner: true }],
    ],
  },
  {
    tag: 'web', title: '🌐 WEB & INFO', items: [
      ['search', 'cari informasi di web'],
      ['news', 'berita terbaru'],
      ['weather', 'cek cuaca'],
      ['time', 'cek waktu lokal'],
      ['jadwalsholat', 'jadwal sholat'],
      ['quran', 'baca surat'],
      ['gempa', 'info gempa BMKG'],
      ['lirik', 'cari lirik lagu'],
      ['shortlink', 'perpendek link'],
      ['kbbi', 'arti kata KBBI'],
      ['animesaran', 'rekomendasi anime'],
    ],
  },
  {
    tag: 'downloader', title: '⬇️ DOWNLOADER', items: [
      ['play', 'cari + download mp3'],
      ['ytmp3', 'YouTube jadi mp3'],
      ['ytmp4', 'YouTube jadi mp4'],
      ['tiktok', 'download TikTok'],
      ['fbdl', 'download video FB'],
      ['igdl', 'download video IG'],
    ],
  },
  {
    tag: 'apipublik', title: '🆓 API PUBLIK', items: [
      ['aio', 'download multi-platform'],
      ['spotify', 'audio Spotify'],
      ['gdrive', 'download Google Drive'],
      ['deepsearch', 'riset singkat via AI'],
    ],
  },
  {
    tag: 'sticker', title: '🎭 STICKER & MEDIA', items: [
      ['stiker', 'gambar jadi stiker', { reply: true }],
      ['stikerwm', 'stiker + watermark'],
      ['triggered', 'efek triggered', { reply: true }],
      ['toimg', 'stiker jadi gambar', { reply: true }],
      ['stiker', 'teks jadi stiker'],
      ['attp', 'teks jadi stiker'],
      ['ttp', 'teks jadi stiker'],
      ['emoji', 'emoji jadi gambar'],
      ['iqc', 'quote iPhone (tema online)', { jere: true }],
      ['iqclocal', 'quote iPhone (offline)'],
    ],
  },
  {
    tag: 'vision', title: '👁️ VISION & VOICE', items: [
      ['ai', 'tanya AI soal gambar', { reply: true }],
      ['ocr', 'baca tulisan di gambar', { reply: true }],
      ['describe', 'deskripsikan gambar', { reply: true }],
      ['analyze', 'analisis gambar mendalam', { reply: true }],
      ['vn', 'transkrip voice note', { reply: true }],
      ['transcribe', 'transkrip voice note', { reply: true }],
      ['tts', 'teks jadi suara'],
    ],
  },
  {
    tag: 'creative', title: '🎨 CREATIVE', items: [
      ['img', 'buat gambar dari prompt'],
      ['image', 'buat gambar dari prompt'],
      ['brat', 'stiker teks ala brat'],
      ['caption', 'caption medsos'],
      ['story', 'cerita pendek'],
      ['prompt', 'prompt gambar detail'],
      ['nulis', 'tulis tangan di buku'],
    ],
  },
  {
    tag: 'tools', title: '🛠️ TOOLS', items: [
      ['morse', 'teks jadi sandi morse'],
      ['dmorse', 'sandi morse jadi teks'],
      ['calc', 'hitung cepat'],
      ['tourl', 'upload media jadi link', { reply: true }],
      ['toimage', 'gambar jadi 512px', { reply: true }],
      ['toaudio', 'audio/video jadi VN', { reply: true }],
      ['tovn', 'audio/video jadi VN', { reply: true }],
      ['removebg', 'hapus background', { reply: true }],
      ['hd', 'HD-kan gambar', { reply: true }],
      ['qrdetect', 'baca isi QR', { reply: true }],
      ['blurface', 'blur wajah', { reply: true }],
    ],
  },
  {
    tag: 'game', title: '🎮 GAME & FUN', items: [
      ['ttt', 'TicTacToe lawan bot'],
      ['kuis', 'soal acak'],
      ['jawab', 'jawab soal kuis'],
      ['truth', 'truth or dare'],
      ['dare', 'truth or dare'],
      ['tarot', 'kartu tarot harianmu'],
      ['zodiak', 'karakter zodiak'],
      ['ship', 'cek kecocokan'],
      ['pantun', 'pantun random'],
      ['weton', 'hitung weton Jawa'],
      ['ramal', 'ramalan hari ini'],
      ['keberuntungan', 'persen hoki'],
      ['mimpi', 'tafsir mimpi'],
      ['karakter', 'baca karakter'],
      ['pilih', 'pilih satu dari beberapa'],
      ['coinflip', 'lempar koin'],
      ['dadu', 'lempar dadu'],
      ['8ball', 'Magic 8-Ball'],
      ['puji', 'pujian random'],
      ['quotes', 'quote motivasi'],
    ],
  },
  {
    tag: 'rpg', title: '🎮 RPG', items: [
      ['dash', 'main SPEEDY DASH'],
      ['fish', 'memancing'],
      ['mine', 'menambang'],
      ['quest', 'misi harian'],
      ['profile', 'profil RPG kamu'],
      ['leaderboard', 'peringkat level'],
      ['heal', 'pulihkan HP'],
    ],
  },
  {
    tag: 'group', title: '👥 GROUP', items: [
      ['tagall', 'sebut semua anggota'],
      ['hidetag', 'sebut tanpa daftar'],
      ['kick', 'keluarkan anggota'],
      ['add', 'tambah anggota'],
      ['promote', 'jadikan admin'],
      ['demote', 'turunkan admin'],
      ['linkgc', 'link invite grup'],
      ['group', 'buka/tutup grup'],
      ['setname', 'ganti nama grup'],
      ['setdesc', 'ganti deskripsi grup'],
      ['grouplist', 'daftar grup bot'],
      ['listadmin', 'daftar admin grup'],
      ['infogc', 'info grup'],
      ['welcome', 'sambutan anggota'],
      ['antilink', 'hapus link otomatis'],
      ['antiflood', 'anti spam'],
      ['badword', 'kelola kata terlarang'],
      ['warn', 'peringatan member'],
      ['unwarn', 'hapus peringatan'],
      ['cekwarn', 'cek peringatan'],
      ['groupset', 'pengaturan grup'],
      ['afk', 'mode AFK'],
    ],
  },
  {
    tag: 'economy', title: '💰 ECONOMY', items: [
      ['daily', 'klaim harian'],
      ['work', 'kerja dapat saldo'],
      ['bank', 'info bank'],
      ['balance', 'cek saldo'],
      ['level', 'cek XP & level'],
      ['limit', 'sisa limit harian'],
      ['dompet', 'cek saldo dompet'],
      ['transfer', 'kirim saldo'],
      ['mining', 'nambang saldo'],
    ],
  },
  {
    tag: 'jere-dl', title: '⬇️ JERE DOWNLOADER', jere: true, items: [
      ['dlcapcut', 'download CapCut'],
      ['dlmediafire', 'download MediaFire'],
      ['dlterabox', 'download TeraBox'],
      ['dlsfile', 'download SFile'],
      ['dldouyin', 'download Douyin'],
      ['dlsnack', 'download SnackVideo'],
      ['dltwitter', 'download X/Twitter'],
      ['dlsound', 'download SoundCloud'],
      ['dlapple', 'download Apple Music'],
      ['dlpin', 'download Pinterest'],
      ['dlthreads', 'download Threads'],
      ['dltele', 'stiker Telegram'],
      ['dlaio', 'multi-platform'],
      ['dltt', 'TikTok (fallback)'],
      ['dlytmp3', 'YouTube mp3 (fallback)'],
      ['dlytmp4', 'YouTube mp4 (fallback)'],
      ['dlig', 'Instagram (fallback)'],
      ['dlfb', 'Facebook (fallback)'],
      ['dlspot', 'Spotify (fallback)'],
    ],
  },
  {
    tag: 'jere-ai', title: '✨ JERE AI', jere: true, items: [
      ['jtxt2img', 'teks jadi gambar'],
      ['jtxt2vid', 'teks jadi video'],
      ['jsora', 'video ala Sora'],
      ['jsuno', 'lagu AI'],
      ['jchat', 'chat AI alternatif'],
      ['jimg2vid', 'gambar jadi video', { reply: true }],
      ['jupscale', 'HD-kan gambar', { reply: true }],
      ['jtoanime', 'gambar jadi anime', { reply: true }],
      ['jclone', 'voice clone', { reply: true }],
      ['jswap', 'faceswap', { reply: true }],
    ],
  },
  {
    tag: 'jere-game', title: '🎮 JERE GAME', jere: true, items: [
      ['jkuis', '23 kuis Jere'],
      ['jkuislist', 'daftar game Jere'],
      ['primbon', '11 primbon'],
      ['primbonlist', 'daftar primbon'],
      ['animequotes', 'quote anime random'],
      ['alkitab', 'baca Alkitab'],
      ['tukar', 'tukar koin ke limit'],
    ],
  },
  {
    tag: 'jere-media', title: '🎭 JERE MEDIA', jere: true, items: [
      ['jqc', 'quote WA'],
      ['jdrake', 'meme drake'],
      ['jsmeme', 'meme', { reply: true }],
      ['jfakewa', 'fake WA'],
      ['jfakecall', 'fake call iOS'],
      ['jotaku', 'cari anime Otakudesu'],
      ['jkomik', 'cari komik Komikindo'],
      ['jmovie', 'cari film Moviebox'],
      ['jviu', 'cari drama Viu'],
      ['igstalk', 'stalk Instagram'],
      ['ttstalk', 'stalk TikTok'],
      ['ytstalk', 'stalk YouTube'],
      ['ghstalk', 'stalk GitHub'],
      ['robstalk', 'stalk Roblox'],
    ],
  },
  {
    tag: 'jere-util', title: '🛠️ JERE UTIL', jere: true, items: [
      ['jyts', 'search YouTube'],
      ['jspotify', 'search Spotify'],
      ['jpin', 'search Pinterest'],
      ['jwallpaper', 'wallpaper random'],
      ['jcuaca', 'cuaca'],
      ['jbmkg', 'cuaca BMKG'],
      ['jlibur', 'hari libur nasional'],
      ['jstyle', 'variasi gaya teks'],
      ['jshort', 'perpendek link'],
      ['jgenius', 'cari lagu Genius'],
      ['jmlbb', 'build MLBB'],
      ['jmlbbtier', 'tier MLBB'],
      ['jff', 'stalk Free Fire'],
      ['jspeed', 'info bot/server'],
      ['jos', 'info server'],
      ['jbackup', 'ringkasan database', { owner: true }],
      ['jplugins', 'list plugin', { owner: true }],
      ['jjoin', 'bot join grup', { owner: true }],
    ],
  },
];

const FOOTER_NOTE = `> powered by *Sonezz* · ai · media · utility`;

function nowParts() {
  const d = new Date();
  let time = '', date = '';
  try {
    time = d.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });
  } catch { time = d.toTimeString().slice(0, 5); }
  try {
    date = d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' });
  } catch { date = d.toDateString(); }
  return { time, date: date.toLowerCase() };
}

function pluginCount() {
  try { return require('../lib/plugin-loader').loadPlugins().length; } catch { return 0; }
}

function header(pushName, prefix, opts = {}) {
  const { time, date } = nowParts();
  const nPlugins = pluginCount();
  const role = opts.isOwner ? '👑 owner' : 'user';
  return (
`╭── [ *SONEZZ AI* ] ──╮
│ ai · media · utility
╰─────────────────────╯

[ *user profile* ]
├ name   : *${String(pushName).toLowerCase()}*
├ prefix : \`${prefix}\`
└ role   : *${role}*

[ *bot stats* ]
├ time    : *${time} wib*
├ date    : *${date}*
├ plugins : *${nPlugins} file*
└ status  : *active*`
  );
}

// Prefix aktif dipakai saat render baris command per kategori.
let PREFIX_ = '.';

function line(cat, name, desc, flag) {
  const badges = [];
  if (flag && flag.jere) badges.push('🌟');
  if (flag && flag.reply) badges.push('💬');
  if (flag && flag.owner) badges.push('👑');
  const tag = badges.length ? ' ' + badges.join('') : '';
  return `  ┣ ${PREFIX_}${name}${tag} — ${desc}`;
}

function renderCategory(cat, opts = {}) {
  // Ringkas: hanya nama command (tanpa keterangan) supaya muat dalam 1 pesan.
  const lines = cat.items.map(([n, d, f]) => {
    const badges = [];
    if (f && f.jere) badges.push('🌟');
    if (f && f.reply) badges.push('💬');
    if (f && f.owner) badges.push('👑');
    const tag = badges.length ? ' ' + badges.join('') : '';
    return opts.compact
      ? `${PREFIX_}${n}${tag}`
      : `  ┣ ${PREFIX_}${n}${tag} — ${d}`;
  });
  return (
`╭── [ *${cat.title}* ]\n` +
lines.join(opts.compact ? '  ·  ' : '\n') +
`\n╰──────────────`
  );
}

// Cocokkan nama kategori: penuh atau sebagian (dl, jere, game, tools, ...).
function findCategory(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return null;
  return (
    CATEGORIES.find((c) => c.tag === q) ||
    CATEGORIES.find((c) => c.tag.includes(q)) ||
    CATEGORIES.find((c) => c.title.toLowerCase().includes(q)) ||
    CATEGORIES.find((c) => c.items.some(([n]) => n === q))
  ) || null;
}

function listMode(prefix, opts) {
  const tags = CATEGORIES.map((c) => (c.jere ? c.tag + ' 🌟' : c.tag));
  const rows = [];
  for (let i = 0; i < tags.length; i += 3) {
    rows.push('  ┣ ' + tags.slice(i, i + 3).join('   ┣ '));
  }
  return (
header('user', prefix, opts) +
`\n\n╭── [ *available categories* ]\n` +
rows.join('\n') +
`\n╰──────────────\n\n` +
`> ketik \`${prefix}menu <kategori>\` untuk lihat isi satu kategori\n\n` +
FOOTER_NOTE
  );
}

function defaultMode(pushName, prefix, opts) {
  PREFIX_ = prefix;
  return (
header(pushName, prefix, opts) +
`\n\n` +
`*quick navigation:*\n` +
`• \`${prefix}menu all\` ➔ semua fitur bot\n` +
`• \`${prefix}menu list\` ➔ daftar kategori\n` +
`• \`${prefix}menu <kategori>\` ➔ per kategori\n` +
`• \`${prefix}ping\` ➔ cek respon bot\n\n` +
`*Private* → chat bebas\n` +
`*Group* → \`${prefix}\` atau mention bot\n\n` +
FOOTER_NOTE
  );
}

function allMode(prefix) {
  PREFIX_ = prefix;
  // Ringkas (tanpa keterangan) supaya seluruh 205 command muat dalam SATU pesan.
  return (
CATEGORIES.map((c) => renderCategory(c, { compact: true })).join('\n\n') +
`\n\n` + FOOTER_NOTE
  );
}

function categoryMode(query, prefix, opts) {
  PREFIX_ = prefix;
  const cat = findCategory(query);
  if (!cat) {
    return (
defaultMode('user', prefix, opts) +
`\n\n❌ Kategori *"${query}"* tidak ada. Coba \`${prefix}menu list\` untuk daftar kategori.`
    );
  }
  // Kategori tidak perlu profile/stats diulang - cukup isi + cara pakai.
  return (
`╭── [ *${cat.title}* ]\n` +
cat.items.map(([n, d, f]) => {
  const badges = [];
  if (f && f.jere) badges.push('🌟');
  if (f && f.reply) badges.push('💬');
  if (f && f.owner) badges.push('👑');
  return `  ┣ ${PREFIX_}${n}${badges.length ? ' ' + badges.join('') : ''} — ${d}`;
}).join('\n') +
`\n╰──────────────\n\n` +
`> ketik \`${prefix}menu all\` untuk semua kategori · \`${prefix}menu list\` untuk daftar\n\n` +
FOOTER_NOTE
  );
}

// API utama: mode = '' | 'all' | 'list' | <nama kategori>
// opts.isOwner -> menampilkan role 👑 owner di profil (dikirim dari router).
function buildMenu(pushName, prefix, mode, opts) {
  if (prefix === undefined) { prefix = pushName; pushName = 'kak'; }
  pushName = String(pushName || '').trim() || 'kak';
  prefix = String(prefix == null ? '.' : prefix);
  const o = opts || {};
  const q = String(mode || '').trim().toLowerCase();
  PREFIX_ = prefix;
  if (q === 'all') return allMode(prefix);
  if (q === 'list' || q === 'kategori' || q === 'category') return listMode(prefix, o);
  if (q) return categoryMode(q, prefix, o);
  return defaultMode(pushName, prefix, o);
}

// Kompatibel pemanggilan lama: menuText(pushName, prefix)
function menuText(pushName, prefix, mode, opts) {
  return buildMenu(pushName, prefix, mode, opts);
}

// Potong teks panjang jadi beberapa bagian <= max (batas panjang pesan WA).
function splitMessage(text, max = 3600) {
  const out = [];
  let cur = '';
  for (const lineText of String(text).split('\n')) {
    if (cur.length + lineText.length + 1 > max) {
      if (cur) out.push(cur);
      cur = '';
    }
    cur += (cur ? '\n' : '') + lineText;
  }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}

module.exports = { menuText, buildMenu, splitMessage, CATEGORIES, findCategory };
