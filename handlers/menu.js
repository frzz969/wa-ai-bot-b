// handlers/menu.js - menu bot SONEZZ.
//
// MODE:
//   .menu            -> ringkasan + navigasi
//   .menu all        -> semua command, ringkas, satu pesan
//   .menu list       -> daftar kategori (satu per baris, turun)
//   .menu <kategori> -> isi satu kategori
//
// BADGE:
//   reply:true -> perlu reply pesan
//   owner:true -> owner only
// Item berbentuk ['@grup', 'Label'] dipakai untuk sub-judul (mis. "Reply gambar").
const CATEGORIES = [
  { tag: 'bot', title: '🤖 SONEZZ BOT', items: [
    ['menu', 'tampilkan menu ini'],
    ['help', 'sama dengan .menu'],
    ['about', 'info tentang bot'],
    ['status', 'cek status bot'],
    ['ping', 'cek respon bot'],
    ['rules', 'peraturan bot'],
  ] },
  { tag: 'chat', title: '💬 SONEZZ CHAT', items: [
    ['ai', 'tanya AI (mengingat 10 pesan)'],
    ['talk', 'mode curhat gaya lembut'],
    ['stoptalk', 'keluar dari mode curhat'],
    ['new', 'mulai chat baru'],
    ['clear', 'hapus ingatan'],
    ['memory', 'lihat ingatan'],
    ['model', 'lihat model aktif'],
    ['chat', 'chat AI alternatif'],
  ] },
  { tag: 'ai', title: '🧠 SONEZZ AI TOOLS', items: [
    ['ask', 'tanya apa saja'],
    ['explain', 'jelaskan sederhana'],
    ['summarize', 'ringkas teks'],
    ['rewrite', 'tulis ulang gaya beda'],
    ['translate', 'terjemahkan ID ⇄ EN'],
    ['ideas', 'buat 7 ide'],
    ['qr', 'buat QR dari teks'],
  ] },
  { tag: 'code', title: '💻 SONEZZ CODING', items: [
    ['code', 'buatkan kode'],
    ['debug', 'analisis error'],
    ['fix', 'perbaiki kode'],
    ['run', 'eksekusi JS', { owner: true }],
  ] },
  { tag: 'web', title: '🌐 SONEZZ WEB & INFO', items: [
    ['search', 'cari informasi di web'],
    ['news', 'berita terbaru'],
    ['weather', 'cek cuaca'],
    ['time', 'cek waktu lokal'],
    ['jadwalsholat', 'jadwal sholat'],
    ['quran', 'baca surat'],
    ['gempa', 'info gempa BMKG'],
    ['lirik', 'cari lirik lagu'],
    ['shortlink', 'perpendek link'],
    ['short', 'perpendek link alternatif'],
    ['kbbi', 'arti kata KBBI'],
    ['animesaran', 'rekomendasi anime'],
    ['yts', 'search YouTube'],
    ['wallpaper', 'wallpaper random'],
    ['cuaca', 'cuaca alternatif'],
    ['bmkg', 'cuaca BMKG'],
    ['libur', 'hari libur nasional'],
    ['genius', 'cari lagu Genius'],
  ] },
  { tag: 'downloader', title: '⬇️ SONEZZ DOWNLOADER', items: [
    ['play', 'cari + download mp3'],
    ['ytmp3', 'YouTube jadi mp3'],
    ['ytmp4', 'YouTube jadi mp4'],
    ['tiktok', 'download TikTok'],
    ['fbdl', 'download video FB'],
    ['igdl', 'download video IG'],
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
    ['dltt', 'TikTok fallback'],
    ['dlytmp3', 'YouTube mp3 fallback'],
    ['dlytmp4', 'YouTube mp4 fallback'],
    ['dlig', 'Instagram fallback'],
    ['dlfb', 'Facebook fallback'],
    ['dlspot', 'Spotify fallback'],
  ] },
  { tag: 'apipublik', title: '🆓 SONEZZ API PUBLIK', items: [
    ['aio', 'download multi-platform'],
    ['gdrive', 'download Google Drive'],
    ['deepsearch', 'riset singkat via AI'],
  ] },
  { tag: 'sticker', title: '🎭 SONEZZ STICKER & MEDIA', items: [
    ['@grup', 'Reply gambar untuk:'],
    ['stiker', 'gambar jadi stiker', { reply: true }],
    ['stickerwm', 'stiker + watermark', { reply: true }],
    ['triggered', 'efek triggered', { reply: true }],
    ['@grup', 'Reply stiker untuk:'],
    ['toimg', 'stiker jadi gambar', { reply: true }],
    ['@grup', 'Langsung:'],
    ['stiker', 'teks jadi stiker'],
    ['attp', 'teks jadi stiker'],
    ['ttp', 'teks jadi stiker'],
    ['emoji', 'emoji jadi gambar'],
    ['iqc', 'quote iPhone (tema online)'],
    ['iqclocal', 'quote iPhone offline'],
    ['qc', 'quote WA'],
    ['drake', 'meme Drake'],
    ['fakewa', 'fake WA'],
    ['fakecall', 'fake call iOS'],
    ['smeme', 'meme', { reply: true }],
    ['otaku', 'cari anime Otakudesu'],
    ['komik', 'cari komik Komikindo'],
    ['movie', 'cari film Moviebox'],
    ['viu', 'cari drama Viu'],
    ['igstalk', 'stalk Instagram'],
    ['ttstalk', 'stalk TikTok'],
    ['ytstalk', 'stalk YouTube'],
    ['ghstalk', 'stalk GitHub'],
    ['robstalk', 'stalk Roblox'],
  ] },
  { tag: 'vision', title: '👁️ SONEZZ VISION & VOICE', items: [
    ['@grup', 'Reply gambar untuk:'],
    ['ai', 'tanya AI tentang gambar', { reply: true }],
    ['ocr', 'baca tulisan di gambar', { reply: true }],
    ['describe', 'deskripsikan gambar', { reply: true }],
    ['analyze', 'analisis gambar mendalam', { reply: true }],
    ['@grup', 'Reply voice note untuk:'],
    ['vn', 'transkrip voice note', { reply: true }],
    ['transcribe', 'transkrip voice note', { reply: true }],
    ['@grup', 'Langsung:'],
    ['tts', 'teks jadi suara'],
    ['img2vid', 'gambar jadi video', { reply: true }],
    ['upscale', 'HD-kan gambar', { reply: true }],
    ['toanime', 'gambar jadi anime', { reply: true }],
    ['clone', 'voice clone', { reply: true }],
    ['swap', 'faceswap', { reply: true }],
  ] },
  { tag: 'creative', title: '🎨 SONEZZ CREATIVE', items: [
    ['img', 'buat gambar dari prompt'],
    ['image', 'buat gambar dari prompt'],
    ['txt2img', 'teks jadi gambar'],
    ['txt2vid', 'teks jadi video'],
    ['sora', 'video ala Sora'],
    ['suno', 'lagu AI'],
    ['brat', 'stiker teks ala brat'],
    ['caption', 'caption medsos'],
    ['story', 'cerita pendek'],
    ['prompt', 'prompt gambar detail'],
    ['nulis', 'tulis tangan di buku'],
  ] },
  { tag: 'tools', title: '🛠️ SONEZZ TOOLS', items: [
    ['@grup', 'Langsung:'],
    ['morse', 'teks jadi sandi morse'],
    ['dmorse', 'sandi morse jadi teks'],
    ['calc', 'hitung cepat'],
    ['style', 'variasi gaya teks'],
    ['mlbb', 'build MLBB'],
    ['mlbbtier', 'tier MLBB'],
    ['ff', 'stalk Free Fire'],
    ['speed', 'info bot/server'],
    ['os', 'info server'],
    ['@grup', 'Reply media untuk:'],
    ['tourl', 'upload media jadi link', { reply: true }],
    ['toimage', 'gambar jadi 512px', { reply: true }],
    ['toaudio', 'audio/video jadi VN', { reply: true }],
    ['tovn', 'audio/video jadi VN', { reply: true }],
    ['removebg', 'hapus background', { reply: true }],
    ['hd', 'HD-kan gambar', { reply: true }],
    ['qrdetect', 'baca isi QR', { reply: true }],
    ['blurface', 'blur wajah', { reply: true }],
    ['@grup', 'Owner only:'],
    ['backup', 'ringkasan database', { owner: true }],
    ['plugins', 'list plugin', { owner: true }],
    ['join', 'bot join grup', { owner: true }],
  ] },
  { tag: 'game', title: '🎮 SONEZZ GAME & FUN', items: [
    ['ttt', 'TicTacToe lawan bot'],
    ['kuis', 'soal acak'],
    ['jawab', 'jawab soal kuis'],
    ['kuislist', 'daftar kategori kuis'],
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
    ['primbon', '11 primbon'],
    ['primbonlist', 'daftar primbon'],
    ['animequotes', 'quote anime random'],
    ['fakta', 'fakta unik'],
    ['alkitab', 'baca Alkitab'],
    ['tukar', 'tukar koin ke limit'],
    ['jkuis', '23 kuis lanjutan'],
  ] },
  { tag: 'rpg', title: '🎮 SONEZZ RPG', items: [
    ['dash', 'main SPEEDY DASH'],
    ['fish', 'memancing'],
    ['mine', 'menambang'],
    ['quest', 'misi harian'],
    ['profile', 'profil RPG kamu'],
    ['leaderboard', 'peringkat level'],
    ['heal', 'pulihkan HP'],
  ] },
  { tag: 'group', title: '👥 SONEZZ GROUP', items: [
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
  ] },
  { tag: 'economy', title: '💰 SONEZZ ECONOMY', items: [
    ['daily', 'klaim harian'],
    ['work', 'kerja dapat saldo'],
    ['bank', 'info bank'],
    ['balance', 'cek saldo'],
    ['level', 'cek XP & level'],
    ['limit', 'sisa limit harian'],
    ['dompet', 'cek saldo dompet'],
    ['transfer', 'kirim saldo'],
    ['mining', 'nambang saldo'],
  ] },
];

const RUL = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
const FOOTER_NOTE = '> powered by *Sonezz* · ai · media · utility';

let PREFIX_ = '.';

function nowParts() {
  const d = new Date();
  let time = '', date = '';
  try {
    time = d.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });
  } catch { time = d.toTimeString().slice(0, 5); }
  try {
    date = d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' });
  } catch { date = d.toDateString(); }
  return { time, date };
}

function pluginCount() {
  try { return require('../lib/plugin-loader').loadPlugins().length; } catch { return 0; }
}

function badges(f) {
  const b = [];
  if (f && f.reply) b.push('💬');
  if (f && f.owner) b.push('👑');
  return b.length ? ' ' + b.join('') : '';
}

function header(pushName, prefix, opts = {}) {
  const { time, date } = nowParts();
  const role = opts.isOwner ? '👑 owner' : 'user';
  return (
`${RUL}\n` +
`*SONEZZ AI ASSISTANT*\n` +
`AI · Media · Utility\n` +
`${RUL}\n\n` +
`Halo kak _${String(pushName).toLowerCase()}_ 👋, ada yang bisa dibantu?\n` +
`🕐 ${date} · 🔑 Prefix \`${prefix}\`\n\n` +
`*kamu*\n` +
`• nama   : ${String(pushName).toLowerCase()}\n` +
`• role   : ${role}\n` +
`• plugin : ${pluginCount()} file\n` +
`• uptime : ${time} wib`
  );
}

// Untuk .menu all: tiap kategori dalam kotak ╭─「 」, sub-judul "Reply ... untuk:".
function renderCategoryBox(cat) {
  const groups = [];
  let cur = null;
  for (const [n, d, f] of cat.items) {
    if (n === '@grup') { cur = { label: d, cmds: [] }; groups.push(cur); continue; }
    const cmd = `${PREFIX_}${n}${badges(f)}`;
    if (!cur) { cur = { label: null, cmds: [] }; groups.push(cur); }
    cur.cmds.push(cmd);
  }
  const body = groups
    .map((g) => (g.label ? `│ *${g.label}*\n│ ${g.cmds.join(' ')}` : `│ ${g.cmds.join(' ')}`))
    .join('\n');
  return `╭─「 ${cat.title} 」─╮\n${body}\n╰${'─'.repeat(Math.max(4, cat.title.length + 8))}╯`;
}

// Penuh untuk .menu <kategori>, dengan sub-judul.
function renderCategoryFull(cat) {
  const out = [];
  for (const [n, d, f] of cat.items) {
    if (n === '@grup') { out.push(''); out.push(`*${d}*`); continue; }
    out.push(`• ${PREFIX_}${n}${badges(f)} — ${d}`);
  }
  return `${RUL}\n*${cat.title}*\n${RUL}\n` + out.join('\n');
}

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

function defaultMode(pushName, prefix, opts) {
  PREFIX_ = prefix;
  return (
header(pushName, prefix, opts) +
`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
`*NAVIGASI*\n` +
`• \`${prefix}menu all\` — semua fitur bot\n` +
`• \`${prefix}menu list\` — daftar kategori\n` +
`• \`${prefix}menu <kategori>\` — isi satu kategori\n` +
`• \`${prefix}ping\` — cek respon bot\n\n` +
`*Private* → chat bebas\n` +
`*Group* → \`${prefix}\` / mention bot\n` +
`━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
FOOTER_NOTE
  );
}

function listMode(prefix, opts) {
  PREFIX_ = prefix;
  // Satu kategori per baris (turun), bukan 3 bersebelahan.
  const rows = CATEGORIES.map((c) => `• \`${prefix}menu ${c.tag}\` — ${c.title}`);
  return (
header('user', prefix, opts) +
`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
`*KATEGORI* (${CATEGORIES.length})\n` +
`━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
rows.join('\n') +
`\n\n> ketik \`${prefix}menu <kategori>\` untuk lihat isi satu kategori\n\n` +
FOOTER_NOTE
  );
}

function allMode(prefix) {
  PREFIX_ = prefix;
  return (
`${RUL}\n` +
`*SONEZZ AI ASSISTANT*\n` +
`AI · Media · Utility\n` +
`${RUL}\n\n` +
CATEGORIES.map(renderCategoryBox).join('\n\n') +
`\n\n${RUL}\n` +
`*Private* → chat bebas\n` +
`*Group* → \`${prefix}\` / mention bot\n` +
`${RUL}\n\n` +
FOOTER_NOTE
  );
}

function categoryMode(query, prefix, opts) {
  PREFIX_ = prefix;
  const cat = findCategory(query);
  if (!cat) {
    return defaultMode('user', prefix, opts) +
      `\n\n❌ Kategori *"${query}"* tidak ada. Coba \`${prefix}menu list\` untuk daftar kategori.`;
  }
  return (
renderCategoryFull(cat) +
`\n\n> \`${prefix}menu all\` — semua kategori · \`${prefix}menu list\` — daftar kategori\n\n` +
FOOTER_NOTE
  );
}

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

function menuText(pushName, prefix, mode, opts) {
  return buildMenu(pushName, prefix, mode, opts);
}

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
