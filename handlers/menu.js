// handlers/menu.js - menu bot SONEZZ.
//
// MODE:
//   .menu            -> ringkasan + navigasi
//   .menu all        -> semua command (dikirim chat, dipecah bila perlu)
//   .menu list       -> daftar kategori (turun, satu per baris)
//   .menu <kategori> -> isi satu kategori
//
// BADGE: reply:true = perlu reply pesan, owner:true = owner only.
// Item ['@grup', 'Label'] = sub-judul (mis. "Reply gambar untuk:").
//
// CATATAN NAMA: tiap fitur hanya punya SATU nama command. Fitur yang punya padanan
// di lane bot sendiri memakai nama itu (mis. .weather, bukan .jcuaca), dan command
// Jere yang dobel (.txt2img, .upscale, .jkuis, .dltt, ...) sudah dihapus.
// Semua alias berawalan "j" dibuang.
const CATEGORIES = [
  { tag: 'bot', title: '🤖 BOT', items: [
    ['menu', 'tampilkan menu ini'],
    ['help', 'sama dengan .menu'],
    ['about', 'info tentang bot'],
    ['status', 'cek status bot'],
    ['ping', 'cek respon bot'],
    ['rules', 'peraturan bot'],
  ] },
  { tag: 'chat', title: '💬 CHAT', items: [
    ['ai', 'tanya AI (mengingat 10 pesan)'],
    ['@grup', 'Lihat/ubah gaya:'],
    ['talk', 'mode curhat gaya lembut'],
    ['stoptalk', 'keluar dari mode curhat'],
    ['new', 'mulai chat baru + sapaan'],
    ['clear', 'hapus ingatan'],
    ['memory', 'lihat ingatan'],
    ['model', 'lihat model aktif'],
  ] },
  { tag: 'ai', title: '🧠 AI TOOLS', items: [
    ['ask', 'tanya apa saja'],
    ['explain', 'jelaskan sederhana'],
    ['summarize', 'ringkas teks'],
    ['rewrite', 'tulis ulang dengan gaya berbeda'],
    ['translate', 'terjemahkan ID ⇄ EN'],
    ['ideas', 'buat 7 ide'],
    ['qr', 'buat QR dari teks'],
  ] },
  { tag: 'code', title: '💻 CODING', items: [
    ['code', 'buatkan kode'],
    ['debug', 'analisis error'],
    ['fix', 'perbaiki kode'],
    ['run', 'eksekusi JS', { owner: true }],
  ] },
  { tag: 'web', title: '🌐 WEB & INFO', items: [
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
  ] },
  // Tag tetap 'downloader' (bukan 'download') supaya .menu downloader tetap jalan,
  // sekaligus .menu download ikut resolve lewat pencocokan tag.includes().
  // Gogh: DOWNLOADER + API PUBLIK + DOWNLOAD LAIN digabung, urutan & deskripsi utuh.
  { tag: 'downloader', title: '⬇️ DOWNLOAD', items: [
    ['@grup', 'Umum:'],
    ['play', 'cari + download MP3'],
    ['ytmp3', 'YouTube jadi MP3'],
    ['ytmp4', 'YouTube jadi MP4 (maks. 720p)'],
    ['tiktok', 'download TikTok'],
    ['fbdl', 'download video Facebook'],
    ['igdl', 'download video Instagram'],
    ['@grup', 'API gratis:'],
    ['aio', 'download multi-platform via API gratis'],
    ['spotify', 'audio Spotify via API gratis'],
    ['gdrive', 'download file Google Drive'],
    ['deepsearch', 'riset singkat via AI publik'],
    ['@grup', 'Lainnya:'],
    ['dlcapcut', 'download CapCut'],
    ['dlmediafire', 'download MediaFire'],
    ['dlmf', 'download MediaFire (alias)'],
    ['dlterabox', 'download TeraBox'],
    ['dltb', 'download TeraBox (alias)'],
    ['dlsfile', 'download SFile'],
    ['dldouyin', 'download Douyin'],
    ['dlsnack', 'download SnackVideo'],
    ['dltwitter', 'download X/Twitter'],
    ['dlx', 'download X/Twitter (alias)'],
    ['dlsound', 'download SoundCloud'],
    ['dlapple', 'download Apple Music'],
    ['dlpin', 'download Pinterest'],
    ['dlthreads', 'download Threads'],
    ['dltele', 'download stiker Telegram'],
    ['dlfast', 'multi-platform'],
  ] },
  { tag: 'sticker', title: '🎭 STICKER & MEDIA', items: [
    ['@grup', 'Reply gambar untuk:'],
    ['stickerwm', 'watermark', { reply: true }],
    ['triggered', 'efek triggered', { reply: true }],
    ['@grup', 'Reply stiker untuk:'],
    ['toimg', 'stiker jadi gambar', { reply: true }],
    ['@grup', 'Gambar atau teks:'],
    ['stiker', 'gambar/teks jadi stiker', { reply: true }],
    ['emoji', 'emoji jadi gambar'],
    ['iqc', 'quote iPhone online'],
    ['iqclocal', 'quote iPhone offline'],
  ] },
  { tag: 'vision', title: '👁️ VISION & VOICE', items: [
    ['@grup', 'Gambar — tanya AI tentang gambar:'],
    ['ai', 'analisis gambar', { reply: true }],
    ['ocr', 'baca tulisan di gambar', { reply: true }],
    ['describe', 'deskripsikan gambar', { reply: true }],
    ['analyze', 'analisis gambar mendalam', { reply: true }],
    ['@grup', 'Reply voice note untuk:'],
    ['vn', 'transkrip voice note', { reply: true }],
    ['@grup', 'Langsung:'],
    ['tts', 'ubah teks menjadi suara'],
  ] },
  { tag: 'creative', title: '🎨 CREATIVE', items: [
    ['img', 'buat gambar dari prompt'],
    ['brat', 'stiker teks ala Brat'],
    ['caption', 'caption media sosial'],
    ['story', 'cerita pendek'],
    ['prompt', 'prompt gambar detail'],
    ['nulis', 'tulisan tangan di buku'],
  ] },
  { tag: 'tools', title: '🛠️ TOOLS', items: [
    ['@grup', 'Langsung:'],
    ['morse', 'teks jadi sandi Morse'],
    ['dmorse', 'sandi Morse jadi teks'],
    ['calc', 'hitung cepat'],
    ['@grup', 'Reply media untuk:'],
    ['tourl', 'upload media jadi link', { reply: true }],
    ['toimage', 'gambar jadi gambar 512px', { reply: true }],
    ['tovn', 'audio/video jadi VN', { reply: true }],
    ['removebg', 'hapus background gambar', { reply: true }],
    ['hd', 'HD-kan gambar', { reply: true }],
    ['qrdetect', 'baca isi QR di gambar', { reply: true }],
    ['blurface', 'blur wajah di gambar', { reply: true }],
  ] },
  { tag: 'minigame', title: '🎮 MINI GAME', items: [
    ['ttt', 'main TicTacToe lawan bot'],
    ['kuis', 'soal acak'],
    ['kuislist', 'daftar kategori kuis'],
    ['jawab', 'jawab soal kuis'],
  ] },
  // Tag tetap 'fun'. DIGABUNG dengan kategori PRIMBON & SERU, urutan & deskripsi utuh.
  // MINIGAME & RPG sengaja TIDAK digabung (RPG punya sistem/progres sendiri).
  { tag: 'fun', title: '🎉 FUN & PRIMBON', items: [
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
    ['pilih', 'pilihkan satu'],
    ['coinflip', 'lempar koin'],
    ['dadu', 'lempar dadu'],
    ['8ball', 'Magic 8-Ball'],
    ['puji', 'pujian random'],
    ['quotes', 'quote motivasi'],
    ['@grup', 'Primbon &AIN:'],
    ['primbon', '11 primbon Jawa'],
    ['primbonlist', 'daftar primbon'],
    ['animequotes', 'quote anime random'],
    ['fakta', 'fakta unik'],
    ['alkitab', 'baca Alkitab'],
    ['tukar', 'tukar koin menjadi limit (50 koin = 1 limit)'],
  ] },
  { tag: 'rpg', title: '🎮 RPG', items: [
    ['dash', 'main SPEEDY DASH'],
    ['fish', 'memancing'],
    ['mine', 'menambang'],
    ['quest', 'misi harian'],
    ['profile', 'profil RPG kamu'],
    ['leaderboard', 'peringkat level'],
    ['heal', 'pulihkan HP'],
  ] },
  { tag: 'group', title: '👥 GROUP', items: [
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
    ['antiflood', 'anti-spam'],
    ['badword', 'kelola kata terlarang'],
    ['warn', 'peringatan member'],
    ['unwarn', 'hapus peringatan'],
    ['cekwarn', 'cek peringatan'],
    ['groupset', 'pengaturan grup'],
    ['afk', 'mode AFK'],
  ] },
  { tag: 'economy', title: '💰 ECONOMY', items: [
    ['daily', 'klaim harian'],
    ['work', 'kerja untuk mendapatkan saldo'],
    ['bank', 'info bank'],
    ['balance', 'cek saldo (cash + bank)'],
    ['level', 'cek XP & level'],
    ['limit', 'sisa limit harian'],
    ['transfer', 'kirim saldo'],
    ['mining', 'nambang saldo (cooldown 5 menit)'],
  ] },
  { tag: 'aivideo', title: '🎬 AI VIDEO & SUARA', items: [
    ['@grup', 'Langsung:'],
    ['txt2vid', 'teks jadi video'],
    ['video', 'teks jadi video (alias)'],
    ['sora', 'video ala Sora'],
    ['suno', 'lagu AI (prompt|judul|style)'],
    ['lagu', 'lagu AI (alias)'],
    ['@grup', 'Reply media untuk:'],
    ['img2vid', 'gambar jadi video', { reply: true }],
    ['toanime', 'gambar jadi anime', { reply: true }],
    ['clone', 'voice clone (reply audio)', { reply: true }],
    ['swap', 'faceswap (2 gambar)', { reply: true }],
  ] },
  { tag: 'meme', title: '🎭 QUOTE & MEME', items: [
    ['qc', 'quote WhatsApp palsu'],
    ['drake', 'meme Drake'],
    ['fakewa', 'buat tampilan WA palsu'],
    ['fakecall', 'fake call iOS'],
    ['smeme', 'meme (reply gambar/URL)', { reply: true }],
  ] },
  { tag: 'cari', title: '🔎 CARI & STALK', items: [
    ['@grup', 'Cari:'],
    ['otaku', 'cari anime Otakudesu'],
    ['otakudet', 'detail anime'],
    ['komik', 'cari komik Komikindo'],
    ['movie', 'cari film Moviebox'],
    ['viu', 'cari drama Viu'],
    ['yts', 'cari video YouTube'],
    ['pin', 'cari Pinterest'],
    ['genius', 'cari lagu Genius'],
    ['wallpaper', 'wallpaper random'],
    ['@grup', 'Stalk:'],
    ['igstalk', 'stalk Instagram'],
    ['ttstalk', 'stalk TikTok'],
    ['ytstalk', 'stalk YouTube'],
    ['ghstalk', 'stalk GitHub'],
    ['robstalk', 'stalk Roblox'],
  ] },
  { tag: 'ekstra', title: '🛠️ UTILITAS', items: [
    ['libur', 'hari libur nasional'],
    ['style', 'variasi gaya teks'],
    ['mlbb', 'build MLBB'],
    ['mlbbtier', 'tier MLBB'],
    ['ff', 'stalk Free Fire'],
    ['os', 'info server'],
    ['@grup', 'Khusus owner:'],
    ['backup', 'ringkasan file database', { owner: true }],
    ['plugins', 'list/baca command', { owner: true }],
    ['join', 'bot join grup', { owner: true }],
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
`Halo kak *${String(pushName).toLowerCase()}* 👋, ada yang bisa dibantu?\n` +
`🕐 ${date} · 🔑 Prefix \`${prefix}\`\n\n` +
`*kamu*\n` +
`• nama   : ${String(pushName).toLowerCase()}\n` +
`• role   : ${role}\n` +
`• plugin : ${pluginCount()} file\n` +
`• uptime : ${time} wib`
  );
}

// Kotak TANPA tepi kanan (╭─「 T 」 / ╰─) -> tidak pernah miring di font WA.
// Baris "│" kosong memisahkan sub-judul.
function renderCategoryBox(cat) {
  const out = [`╭─「 ${cat.title} 」`];
  let first = true;
  for (const [n, d, f] of cat.items) {
    if (n === '@grup') {
      if (!first) out.push('│');
      out.push(`│ ${d}`);
      first = false;
      continue;
    }
    out.push(`│ ${PREFIX_}${n}${badges(f)} — ${d}`);
  }
  out.push('╰─');
  return out.join('\n');
}

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
`\n\n${RUL}\n` +
`*NAVIGASI*\n` +
`• \`${prefix}menu all\` — semua fitur bot\n` +
`• \`${prefix}menu list\` — daftar kategori\n` +
`• \`${prefix}menu <kategori>\` — isi satu kategori\n` +
`• \`${prefix}ping\` — cek respon bot\n\n` +
`*Private* → chat langsung\n` +
`*Group* → gunakan \`${prefix}\` atau mention bot\n` +
`${RUL}\n\n` +
FOOTER_NOTE
  );
}

function listMode(prefix, opts) {
  PREFIX_ = prefix;
  const rows = CATEGORIES.map((c) => `• \`${prefix}menu ${c.tag}\` — ${c.title}`);
  return (
header('user', prefix, opts) +
`\n\n${RUL}\n*KATEGORI* (${CATEGORIES.length})\n${RUL}\n` +
rows.join('\n') +
`\n\n> ketik \`${prefix}menu <kategori>\` untuk lihat isi satu kategori\n\n` +
FOOTER_NOTE
  );
}

function allMode(prefix, pushName) {
  PREFIX_ = prefix;
  const { date } = nowParts();
  return (
`${RUL}\n` +
`*SONEZZ AI ASSISTANT*\n` +
`AI · Media · Utility\n` +
`${RUL}\n\n` +
`Halo kak *${String(pushName || 'kak').toLowerCase()}* 👋, ada yang bisa dibantu?\n` +
`🕐 ${date} · 🔑 Prefix \`${prefix}\`\n\n` +
CATEGORIES.map(renderCategoryBox).join('\n\n') +
`\n\n${RUL}\n` +
`*Private* → chat langsung\n` +
`*Group* → gunakan \`${prefix}\` atau mention bot\n` +
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
  if (q === 'all') return allMode(prefix, pushName);
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
