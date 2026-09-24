// handlers/messages.js — router semua perintah bot
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { chatAI, transcribeAudio } = require('../lib/ai');
const { pushMessage, buildContextPrompt, clearMemory, getMemory, countChats } = require('../lib/memory');
const { imageToSticker, textToSticker } = require('../lib/sticker');
const { downloadBuffer, getQuoted, wrapQuoted, unwrapMessage, compressForVision, preprocessForOCR } = require('../lib/media');
const { runSandboxed } = require('../lib/sandbox');
const { ddgSearch, googleNews, getWeather, getLocalTime, wikiSummary } = require('../lib/tools');
const { extractDocText } = require('../lib/files');
const { ttsEdge, googleTTSChunk } = require('../lib/tts');
// ---------- LANE INTEGRASI AKHIR (handler sudah ada, tinggal panggil) ----------
const groupLane = require('../lib/group');
const systems = require('../lib/systems');
const { rulesText, animeSaranText } = require('../lib/info');
const mediaTools = require('../lib/media-tools');
const { handleIqc } = require('../lib/iqc');
const { isDashCommand, handleDash } = require('../lib/dash');
const dlLane = require('../lib/downloader');
const freeInfo = require('../lib/freeinfo');
const funLane = require('../lib/fun');
const { handleNulis } = require('../lib/nulis');
const { handleSsweb } = require('../lib/ssweb');
// ---------- FASE 1: Router tipis + guards (src/commands + src/guards) ----------
// Dimuat toleran-gagal: kalau modul baru bermasalah, bot tetap jalan via handler lama.
let registry = null;
let runPipeline = null;
try {
  registry = require('../src/commands');
  ({ runPipeline } = require('../src/guards/pipeline'));
} catch (e) {
  console.error('[router] modul baru gagal dimuat, fallback handler lama:', e?.message || e);
}
// ---------- FASE 2: Safety hook anti-spam (src/extensions/safety) + scheduler ----------
// Dimuat toleran-gagal: kalau modul bermasalah, bot tetap jalan via handler lama.
let trySafety = null;
try {
  ({ trySafety } = require('../src/extensions/safety'));
} catch (e) {
  console.error('[safety] modul safety gagal dimuat, proteksi nonaktif:', e?.message || e);
}
// Scheduler Fase 2: bersih-bersih periodik tiap 10 menit (auto-start saat di-require).
try {
  require('../src/extensions/maintenance/scheduler');
} catch (e) {
  console.error('[scheduler] gagal start:', e?.message || e);
}

const ROUTER_PREFIXES = ['.', '!', '#'];

// Bangun ctx standar command: { sender, pushName, args, mentions, isOwner, isAdmin, isBotAdmin, reply, react, ... }.
// isAdmin/isBotAdmin best-effort via groupMetadata (gagal -> false, non-fatal).
async function buildCommandCtx(sock, m, jid, isGroup, sender, body) {
  const parts = String(body || '').split(/\s+/).filter(Boolean);
  const args = parts.slice(1).join(' ').trim();
  const mentions = getMentionList(m);
  const owner = isOwner(sender, jid);
  let admin = false;
  let botAdmin = false;
  if (isGroup) {
    try {
      const meta = await sock.groupMetadata(jid);
      const list = Array.isArray(meta?.participants) ? meta.participants : [];
      const botNum = botJidNormalized(sock);
      for (const p of list) {
        const pid = String(p?.id || '');
        const pNum = pid.split('@')[0].split(':')[0];
        const isAdm = p?.admin === 'admin' || p?.admin === 'superadmin';
        if (pid === sender && isAdm) admin = true;
        if (pNum && botNum && pNum === botNum && isAdm) botAdmin = true;
      }
    } catch {}
  }
  const reply = (text) => safeReply(sock, jid, text, m);
  const react = (emoji) => sock.sendMessage(jid, { react: { text: String(emoji || ''), key: m.key } }).catch(() => {});
  return {
    sock, m, jid, sender,
    pushName: getDisplayName(m),
    args, text: args, mentions,
    isGroup, isOwner: owner, isAdmin: admin, isBotAdmin: botAdmin,
    reply, react,
  };
}

// Coba tangani via registry baru. Return true bila sudah ditangani (panggil return di caller).
// Return false -> lanjutkan ke handler lama (fallback).
async function tryNewRouter(sock, m, jid, isGroup, sender, raw) {
  if (!registry || !runPipeline) return false;
  const ch = String(raw || '').charAt(0);
  if (!ROUTER_PREFIXES.includes(ch)) return false;
  const body = String(raw || '').slice(1).trim();
  if (!body) return false;
  const name = body.split(/\s+/)[0].toLowerCase();
  let command = null;
  try {
    command = registry.getCommand(name);
  } catch {
    return false;
  }
  if (!command) return false; // tidak ketemu -> fallback handler lama
  let ctx;
  try {
    ctx = await buildCommandCtx(sock, m, jid, isGroup, sender, body);
  } catch (e) {
    console.error('[router] build ctx gagal:', e?.message || e);
    return false;
  }
  let ok = false;
  try {
    ok = await runPipeline(ctx, command);
  } catch (e) {
    console.error('[router] pipeline gagal:', e?.message || e);
    return false;
  }
  if (!ok) return true; // diblokir guard (sudah di-reply guard) -> anggap tertangani
  try {
    await command.execute(ctx);
  } catch (e) {
    console.error(`[router] execute ${command.name} gagal:`, e?.message || e);
    try {
      await ctx.reply('❌ Command gagal dijalankan. Coba lagi sebentar ya.');
    } catch {}
  }
  return true;
}

const runCooldown = new Map(); // sender -> timestamp khusus .run (5 dtk)
const lastBotImage = new Map(); // key jid|sender -> Buffer (hasil .img/.brat terakhir)
const lastDoc = new Map(); // key jid|sender -> { name, text, at } (dokumen terakhir)
const talkSessions = new Map(); // key scopeKey(jid,sender) -> true (mode sesi curhat .talk sampai .stoptalk)

// Kunci per chat+pengirim agar user A tidak memakai data user B. Maks 100 entri.
function scopeKey(jid, sender) {
  return `${jid}|${sender}`;
}

// ---------- Mode sesi curhat (.talk s/d .stoptalk, per chat+pengirim) ----------
function talkOn(jid, sender) {
  return talkSessions.get(scopeKey(jid, sender)) === true;
}
function sessionStyle(jid, sender) {
  return talkOn(jid, sender) ? config.TALK_STYLE : undefined;
}
// Penanda konteks: hanya ditempel ke prompt (tidak disimpan ke memory)
function withTalkFlag(jid, sender, text) {
  if (!talkOn(jid, sender)) return text;
  return (
    `[MODE CURHAT AKTIF. User sedang curhat — jawab dengan empati gaya lembut. ` +
    `Jika user jelas GANTI TOPIK ke hal santai/teknis/umum (bukan perasaan/masalah pribadi), ` +
    `jawab topik barunya dengan gaya normal, lalu akhiri dengan saran singkat mengetik ` +
    `${config.PREFIX}stoptalk untuk keluar dari mode curhat.]\n${text}`
  );
}

function mapSetCapped(map, k, v, max = 100) {
  map.set(k, v);
  while (map.size > max) {
    map.delete(map.keys().next().value); // hapus entri tertua
  }
}

// ---------- Dokumen: chunking / ringkas / retrieval / kirim panjang ----------
const MAX_DOCUMENT_CHUNKS = 8;

// Potong dokumen jadi chunk ≤ maxChars, prioritas batas \n\n lalu '. ' lalu ' '.
// Pencarian batas hanya di jendela 60%-100% maxChars agar chunk tidak terlalu kecil.
function chunkDocument(text, maxChars = 12000) {
  const norm = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!norm.trim()) return [];
  if (norm.length <= maxChars) return [norm];
  const chunks = [];
  const minCut = Math.floor(maxChars * 0.6);
  let start = 0;
  while (start < norm.length) {
    const remaining = norm.length - start;
    if (remaining <= maxChars) {
      const tail = norm.slice(start).trim();
      if (tail) chunks.push(tail);
      break;
    }
    const windowEnd = start + maxChars;
    const windowStart = start + minCut;
    const win = norm.slice(windowStart, windowEnd);
    let cut;
    let idx = win.lastIndexOf('\n\n');
    if (idx !== -1) {
      cut = windowStart + idx + 2;
    } else {
      idx = win.lastIndexOf('. ');
      if (idx !== -1) {
        cut = windowStart + idx + 1; // sertakan titik, spasi jadi awal chunk berikut
      } else {
        idx = win.lastIndexOf(' ');
        cut = idx !== -1 ? windowStart + idx + 1 : windowEnd;
      }
    }
    if (cut <= start) cut = windowEnd; // pengaman infinite loop
    const piece = norm.slice(start, cut).trim();
    if (piece) chunks.push(piece);
    start = cut;
    if (chunks.length > 50) break; // pengaman, batas nyata dicek via MAX_DOCUMENT_CHUNKS
  }
  return chunks.filter(Boolean);
}

// Ringkas dokumen full tanpa pemotongan 4k. 1 chunk -> 1x chatAI terstruktur,
// N chunk -> ringkas tiap chunk padat lalu 1x merge final. Langsung chatAI
// (tanpa buildContextPrompt/memory) agar hemat konteks. Groq max_tokens 1024
// sehingga prompt per-chunk dibuat padat dan output merge dibatasi struktur.
async function summarizeDocument(docText, docName) {
  const chunks = chunkDocument(docText);
  if (chunks.length > MAX_DOCUMENT_CHUNKS) {
    const err = new Error('TOO_LONG');
    err.code = 'TOO_LONG';
    throw err;
  }
  const name = docName || 'dokumen';
  if (chunks.length <= 1) {
    const prompt =
      `Buatkan ringkasan terstruktur dari dokumen "${name}" berikut. Jangan mengarang, hanya berdasarkan isi dokumen.\n` +
      `Struktur:\n📌 Judul/Identitas\n🎯 Tujuan/Inti\n🔬 Poin-poin penting\n📊 Data/Angka penting (jika ada)\n` +
      `💡 Kesimpulan\n📝 Ringkasan singkat\n⚠️ Catatan/Keterbatasan\n\nIsi dokumen:\n\n${chunks[0] || String(docText || '')}`;
    return await chatAI(prompt);
  }
  const partSummaries = [];
  for (let i = 0; i < chunks.length; i++) {
    const p =
      `Ringkas bagian ${i + 1}/${chunks.length} dari dokumen "${name}" berikut secara padat dan faktual. ` +
      `Jangan mengarang, fokus pada fakta/poin penting saja:\n\n${chunks[i]}`;
    const s = await chatAI(p);
    partSummaries.push(`[Bagian ${i + 1}/${chunks.length}]\n${s}`);
  }
  const mergePrompt =
    `Gabungkan ringkasan-ringkasan bagian dari dokumen "${name}" berikut menjadi SATU ringkasan akhir yang lengkap dan tidak berulang. ` +
    `Jangan mengarang, hanya berdasarkan ringkasan bagian. Target panjang 2000-3500 karakter.\n` +
    `Gunakan struktur:\n📌 Judul/Identitas\n🎯 Tujuan/Inti\n🔬 Poin-poin penting\n📊 Data/Angka penting\n` +
    `💡 Kesimpulan\n📝 Ringkasan singkat\n⚠️ Catatan/Keterbatasan\n\nRingkasan bagian:\n\n${partSummaries.join('\n\n')}`;
  return await chatAI(mergePrompt);
}

// Ambil topK chunk paling relevan untuk pertanyaan via skor keyword sederhana.
function retrieveDocChunks(docText, question, topK = 3) {
  const chunks = chunkDocument(docText);
  if (chunks.length <= topK) return chunks;
  const stop = new Set([
    'yang', 'dan', 'atau', 'dengan', 'untuk', 'dari', 'pada', 'adalah', 'ini', 'itu',
    'dalam', 'sebagai', 'karena', 'jika', 'akan', 'telah', 'sudah', 'belum', 'saya',
    'kami', 'kita', 'anda', 'dia', 'mereka', 'apa', 'bagaimana', 'kapan', 'dimana',
    'berapa', 'mengapa', 'kenapa', 'tolong', 'the', 'and', 'or', 'with', 'from',
    'what', 'how', 'when', 'where', 'why', 'does', 'is', 'are', 'was', 'were',
    'this', 'that', 'these', 'those', 'about', 'into', 'over', 'under', 'please',
  ]);
  const qWords = String(question || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !stop.has(w));
  const uniqQ = [...new Set(qWords)];
  const scored = chunks.map((c, idx) => {
    const low = c.toLowerCase();
    let score = 0;
    for (const w of uniqQ) {
      if (low.includes(w)) score += 1;
    }
    return { idx, score };
  });
  const allZero = scored.every((s) => s.score === 0);
  if (allZero) {
    // Fallback: 2 awal + 1 akhir (deduplikasi)
    const picks = [0, 1, chunks.length - 1].filter((i) => i >= 0 && i < chunks.length);
    return [...new Set(picks)].map((i) => chunks[i]).filter(Boolean).slice(0, topK);
  }
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  const top = scored.slice(0, topK).map((s) => s.idx);
  return [...new Set(top)].map((i) => chunks[i]).filter(Boolean);
}

// Kirim teks panjang via beberapa pesan ≤ ~3500 char, potong di batas
// paragraf/kalimat/spasi. Mengirim berurutan via safeReply (tidak ubah safeReply global).
async function sendLongText(sock, jid, text, msg) {
  const s = String(text || '');
  const MAX = 3500;
  if (s.length <= MAX) return await safeReply(sock, jid, s, msg);
  const parts = [];
  let start = 0;
  const minCut = Math.floor(MAX * 0.6);
  while (start < s.length) {
    const remaining = s.length - start;
    if (remaining <= MAX) {
      parts.push(s.slice(start));
      break;
    }
    const windowEnd = start + MAX;
    const windowStart = start + minCut;
    const win = s.slice(windowStart, windowEnd);
    let cut;
    let idx = win.lastIndexOf('\n\n');
    if (idx !== -1) {
      cut = windowStart + idx + 2;
    } else {
      idx = win.lastIndexOf('\n');
      if (idx !== -1) {
        cut = windowStart + idx + 1;
      } else {
        idx = win.lastIndexOf('. ');
        if (idx !== -1) {
          cut = windowStart + idx + 1;
        } else {
          idx = win.lastIndexOf(' ');
          cut = idx !== -1 ? windowStart + idx + 1 : windowEnd;
        }
      }
    }
    if (cut <= start) cut = windowEnd;
    parts.push(s.slice(start, cut));
    start = cut;
  }
  for (const p of parts.filter(Boolean)) {
    await safeReply(sock, jid, p, msg);
  }
}

function normalizeNum(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
}

function isOwner(participant, remoteJid) {
  if (!config.OWNER_NUMBER) return false;
  // Baileys baru kirim @lid di grup: cocokkan participant DAN remoteJid
  return [normalizeNum(participant), normalizeNum(remoteJid)].some(
    (n) => n !== '' && n === config.OWNER_NUMBER
  );
}

function extractText(m) {
  const msg = unwrapMessage(m.message || {}) || {};
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.audioMessage?.caption ||
    ''
  ).trim();
}

function getSender(m) {
  return m.key.participant || m.key.remoteJid;
}

// ---------- Identitas grup (multi-user): hanya dipakai di jalur isGroup ----------
// displayName dari pushName pengirim; quoted text dibaca manual (tanpa download);
// mentions diteruskan apa adanya ke context (mention stripping di body tetap).
function getDisplayName(m) {
  return String(m.pushName || '').trim();
}

function getQuotedText(m) {
  try {
    const q = getQuoted(m);
    if (!q || !q.quotedMessage) return '';
    const inner = unwrapMessage(q.quotedMessage) || {};
    const t = (
      inner.conversation ||
      inner.extendedTextMessage?.text ||
      inner.imageMessage?.caption ||
      inner.videoMessage?.caption ||
      inner.documentMessage?.caption ||
      inner.audioMessage?.caption ||
      ''
    ).trim();
    return t.slice(0, 500);
  } catch {
    return '';
  }
}

function getMentionList(m) {
  try {
    const inner = unwrapMessage(m.message || {}) || {};
    const ctx =
      inner.extendedTextMessage?.contextInfo ||
      inner.imageMessage?.contextInfo ||
      inner.videoMessage?.contextInfo ||
      inner.audioMessage?.contextInfo ||
      inner.documentMessage?.contextInfo ||
      inner.stickerMessage?.contextInfo ||
      null;
    const arr = ctx?.mentionedJid || [];
    return arr.map((j) => String(j)).filter(Boolean).slice(0, 10);
  } catch {
    return [];
  }
}

// Paket opts untuk memory builder grup: { isGroup, senderId, displayName, quotedText, mentions }
function groupSenderOpts(m) {
  return {
    isGroup: true,
    senderId: getSender(m),
    displayName: getDisplayName(m),
    quotedText: getQuotedText(m),
    mentions: getMentionList(m),
  };
}

function botJidNormalized(sock) {
  const id = sock.user?.id || '';
  return id.split(':')[0].split('@')[0];
}

function isMentionToBot(m, sock) {
  const info =
    m.message?.extendedTextMessage?.contextInfo ||
    m.message?.imageMessage?.contextInfo ||
    null;
  const mentioned = info?.mentionedJid || [];
  const botNum = botJidNormalized(sock);
  return mentioned.some((j) => j.split('@')[0].split(':')[0] === botNum);
}

function menuText(pushName, prefix) {
  // Kompatibel pemanggilan lama menuText(prefix) → anggap prefix saja, nama fallback 'kak'.
  if (prefix === undefined) {
    prefix = pushName;
    pushName = 'kak';
  }
  pushName = String(pushName || '').trim() || 'kak';
  prefix = String(prefix == null ? '.' : prefix);
  let tanggal = '';
  try {
    tanggal = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    tanggal = new Date().toDateString();
  }
  return (
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🤖 *SONEZZ AI ASSISTANT*\n` +
    `AI · Media · Utility\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Halo kak _${pushName}_ 👋, ada yang bisa dibantu?\n` +
    `🕐 ${tanggal} · 🔑 Prefix \`${prefix}\`\n\n` +

    `╭─「 🤖 BOT 」\n` +
    `│ ${prefix}menu / ${prefix}help — tampilkan menu ini\n` +
    `│ ${prefix}about — info tentang bot\n` +
    `│ ${prefix}status — cek status bot\n` +
    `│ ${prefix}ping — cek respon bot\n` +
    `│ ${prefix}rules — peraturan bot\n` +
    `╰─\n\n` +

    `╭─「 💬 CHAT 」\n` +
    `│ ${prefix}ai <teks> — tanya AI (mengingat 10 pesan)\n` +
    `│ ${prefix}talk [teks] — mode curhat gaya lembut\n` +
    `│ ${prefix}stoptalk — keluar dari mode curhat\n` +
    `│ ${prefix}new — mulai chat baru + sapaan\n` +
    `│ ${prefix}clear — hapus ingatan\n` +
    `│ ${prefix}memory — lihat ingatan\n` +
    `│ ${prefix}model — lihat model aktif\n` +
    `╰─\n\n` +

    `╭─「 🧠 AI TOOLS 」\n` +
    `│ ${prefix}ask <tanya> — tanya apa saja\n` +
    `│ ${prefix}explain <topik> — jelaskan sederhana\n` +
    `│ ${prefix}summarize <teks> — ringkas teks\n` +
    `│ ${prefix}rewrite <teks> — tulis ulang gaya beda\n` +
    `│ ${prefix}translate <teks> — terjemahkan ID ⇄ EN\n` +
    `│ ${prefix}ideas <topik> — buat 7 ide\n` +
    `│ ${prefix}qr <teks> — buat QR dari teks\n` +
    `╰─\n\n` +

    `╭─「 💻 CODING 」\n` +
    `│ ${prefix}code <minta> — buatkan kode\n` +
    `│ ${prefix}debug <kode+error> — analisis error\n` +
    `│ ${prefix}fix <kode> — perbaiki kode\n` +
    `│ ${prefix}run <kode> — eksekusi JS (owner only)\n` +
    `╰─\n\n` +

    `╭─「 🌐 WEB & INFO 」\n` +
    `│ ${prefix}search <q> — cari informasi di web\n` +
    `│ ${prefix}news <topik> — berita terbaru\n` +
    `│ ${prefix}weather <kota> — cek cuaca\n` +
    `│ ${prefix}time <kota> — cek waktu lokal\n` +
    `│ ${prefix}jadwalsholat <kota> — jadwal sholat\n` +
    `│ ${prefix}quran <nomor> [jml] — baca surat\n` +
    `│ ${prefix}gempa — info gempa BMKG\n` +
    `│ ${prefix}lirik <judul> — cari lirik lagu\n` +
    `│ ${prefix}shortlink <url> — perpendek link\n` +
    `│ ${prefix}kbbi <kata> — arti kata KBBI\n` +
    `│ ${prefix}animesaran — rekomendasi anime\n` +
    `╰─\n\n` +

    `╭─「 ⬇️ DOWNLOADER 」\n` +
    `│ ${prefix}play <judul> — cari + download mp3\n` +
    `│ ${prefix}ytmp3 <link> — YouTube jadi mp3\n` +
    `│ ${prefix}ytmp4 <link> — YouTube jadi mp4 (max 720p)\n` +
    `│ ${prefix}tiktok <link> — download TikTok\n` +
    `│ ${prefix}fbdl <link> — download video FB\n` +
    `│ ${prefix}igdl <link> — download video IG\n` +
    `╰─\n\n` +

    `╭─「 🎭 STICKER & MEDIA 」\n` +
    `│ reply gambar + ${prefix}stiker — gambar jadi stiker\n` +
    `│ ${prefix}stiker <teks> — teks jadi stiker\n` +
    `│ reply stiker + ${prefix}toimg — stiker jadi gambar\n` +
    `│ reply gambar + ${prefix}stickerwm <pack>|<author>\n` +
    `│ ${prefix}attp / ${prefix}ttp <teks> — teks jadi stiker\n` +
    `│ reply gambar + ${prefix}triggered — efek TRIGGERED\n` +
    `│ ${prefix}emoji <emoji> — emoji jadi gambar\n` +
    `│ ${prefix}iqc <teks> — quote ala iPhone\n` +
    `╰─\n\n` +

    `╭─「 👁️ VISION & VOICE 」\n` +
    `│ ${prefix}ocr — baca teks dari gambar\n` +
    `│ ${prefix}describe — deskripsikan gambar\n` +
    `│ ${prefix}analyze — analisis gambar mendalam\n` +
    `│ kirim gambar + caption ${prefix}ai <tanya>\n` +
    `│ reply VN + ${prefix}vn / ${prefix}transcribe\n` +
    `│ ${prefix}tts <teks> — teks jadi suara (max 300)\n` +
    `╰─\n\n` +

    `╭─「 🎨 CREATIVE 」\n` +
    `│ ${prefix}img / ${prefix}image <prompt> — buat gambar\n` +
    `│ ${prefix}brat <teks> — stiker teks ala brat\n` +
    `│ ${prefix}caption <topik> — caption medsos\n` +
    `│ ${prefix}story <tema> — cerita pendek\n` +
    `│ ${prefix}prompt <ide> — prompt gambar detail\n` +
    `│ ${prefix}nulis <teks> — tulis tangan di buku\n` +
    `│ ${prefix}ssweb <url> — screenshot web\n` +
    `╰─\n\n` +

    `╭─「 🎉 FUN 」\n` +
    `│ ${prefix}truth / ${prefix}dare — truth or dare\n` +
    `│ ${prefix}tarot — kartu tarot harianmu\n` +
    `│ ${prefix}zodiak <nama> — karakter zodiak\n` +
    `│ ${prefix}ship <nama1> | <nama2> — cek kecocokan\n` +
    `│ ${prefix}pantun — pantun random\n` +
    `│ ${prefix}weton <tgl-bln-thn> — hitung weton Jawa\n` +
    `│ ${prefix}ramal — ramalan hari ini\n` +
    `│ ${prefix}keberuntungan [nama] — persen hoki\n` +
    `│ ${prefix}mimpi <kata> — tafsir mimpi\n` +
    `│ ${prefix}karakter <nama> — baca karakter\n` +
    `│ ${prefix}pilih <a> | <b> | <c> — pilihkan satu\n` +
    `│ ${prefix}coinflip — lempar koin\n` +
    `│ ${prefix}dadu [2-100] — lempar dadu\n` +
    `│ ${prefix}8ball <tanya> — Magic 8-Ball\n` +
    `│ ${prefix}puji [nama] — pujian random\n` +
    `│ ${prefix}quotes — quote motivasi\n` +
    `╰─\n\n` +

    `╭─「 🎮 RPG 」\n` +
    `│ ${prefix}dash — main SPEEDY DASH\n` +
    `│ ${prefix}fish — memancing\n` +
    `│ ${prefix}mine — menambang\n` +
    `│ ${prefix}quest — misi harian\n` +
    `│ ${prefix}profile — profil RPG kamu\n` +
    `│ ${prefix}leaderboard — peringkat level\n` +
    `│ ${prefix}heal — pulihkan HP\n` +
    `╰─\n\n` +

    `╭─「 👥 GROUP 」\n` +
    `│ ${prefix}tagall [teks] — sebut semua anggota\n` +
    `│ ${prefix}hidetag <teks> — sebut tanpa daftar\n` +
    `│ ${prefix}kick @user / reply — keluarkan anggota\n` +
    `│ ${prefix}add <nomor> — tambah anggota\n` +
    `│ ${prefix}promote / ${prefix}demote @user\n` +
    `│ ${prefix}linkgc — link invite grup\n` +
    `│ ${prefix}group buka / tutup — buka/tutup grup\n` +
    `│ ${prefix}setname <nama> — ganti nama grup\n` +
    `│ ${prefix}setdesc <teks> — ganti deskripsi grup\n` +
    `│ ${prefix}grouplist — daftar grup bot\n` +
    `│ ${prefix}listadmin — daftar admin grup\n` +
    `│ ${prefix}infogc — info grup\n` +
    `│ ${prefix}welcome on / off — sambutan anggota\n` +
    `│ ${prefix}antilink on / off — hapus link otomatis\n` +
    `│ ${prefix}antiflood on / off — anti spam\n` +
    `│ ${prefix}badword add / del / list <kata>\n` +
    `│ ${prefix}warn / ${prefix}unwarn / ${prefix}cekwarn @user\n` +
    `│ ${prefix}groupset <opsi> — pengaturan grup\n` +
    `│ ${prefix}afk [alasan] — mode AFK\n` +
    `╰─\n\n` +

    `╭─「 💰 ECONOMY 」\n` +
    `│ ${prefix}daily — klaim harian\n` +
    `│ ${prefix}work — kerja dapat saldo\n` +
    `│ ${prefix}bank — info bank\n` +
    `│ ${prefix}balance — cek saldo\n` +
    `│ ${prefix}level — cek XP & level\n` +
    `│ ${prefix}limit — sisa limit harian\n` +
    `│ ${prefix}dompet — cek saldo dompet\n` +
    `│ ${prefix}transfer @user <nominal> — kirim saldo\n` +
    `│ ${prefix}mining — nambang saldo (cd 5 menit)\n` +
    `╰─\n\n` +

    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `*Private* → chat bebas\n` +
    `*Group* → \`${prefix}\` / mention bot\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
  );
}

async function safeReply(sock, jid, text, quoted) {
  const full = String(text || '');
  let out = full.slice(0, 4000);
  if (full.length > 4000) out += '\n…(dipotong)';
  return await sock.sendMessage(jid, { text: out }, { quoted });
}

// Satu pesan interim sebelum proses berat (feedback cepat, non-fatal jika gagal)
async function interim(sock, jid, m, text) {
  try {
    await sock.sendMessage(jid, { text }, { quoted: m });
  } catch {}
}

// Header image untuk .menu/.help (assets/menu-header.jpg).
// Kalau file ADA: kirim sebagai image + caption = teks menu.
// Kalau file TIDAK ada / gagal kirim: fallback kirim teks menu polos (bot tidak error).
async function sendMenuWithHeader(sock, jid, m, text) {
  try {
    const headerPath = path.join(__dirname, '..', 'assets', 'menu-header.jpg');
    if (!fs.existsSync(headerPath)) return await safeReply(sock, jid, text, m);
    const buf = fs.readFileSync(headerPath);
    if (!buf || !buf.length) return await safeReply(sock, jid, text, m);
    await sock.sendMessage(jid, { image: buf, caption: text }, { quoted: m });
    return;
  } catch (e) {
    console.error('menu-header', e?.message || e);
    return await safeReply(sock, jid, text, m);
  }
}

// Batasi janji dengan timeout (untuk API/download tanpa signal)
function withTimeout(promise, ms, label) {
  let t;
  const to = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error((label || 'Timeout') + ' ' + ms + 'ms')), ms);
  });
  return Promise.race([promise.finally(() => clearTimeout(t)), to]);
}

// Potong teks panjang jadi chunk ≤ n char per batas kata (untuk TTS)
function chunkText(s, n = 200) {
  const words = String(s || '').split(/\s+/).filter(Boolean);
  const parts = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > n) {
      parts.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts.length ? parts : ['...'];
}

// Wrapper prompt via chatAI + memory (hemat kode untuk perintah AI TOOLS/CODE/CREATIVE)
async function aiWrap(sock, jid, m, userText, promptPrefix, usage, tag, style) {
  if (!userText) return await safeReply(sock, jid, usage, m);
  try {
    const prompt = buildContextPrompt(jid, `${promptPrefix}${userText}`);
    const answer = await chatAI(prompt, undefined, undefined, style || config.STYLE);
    pushMessage(jid, 'user', userText);
    pushMessage(jid, 'bot', answer);
    return await safeReply(sock, jid, answer, m);
  } catch (e) {
    console.error(tag || 'ai', e?.message || e);
    return await safeReply(sock, jid, '😢 Maaf, AI sedang sibuk. Coba lagi sebentar ya.', m);
  }
}

// Suffix wajib semua prompt vision: teliti baca tulisan tangan
const OCR_SUFFIX = '\nBaca teks/tulisan tangan dengan teliti, jika ada bagian ragu tandai dengan [?].';

// Vision: gambar saat ini / reply gambar -> chatAI vision (kompres + preprocess OCR)
async function visionWrap(sock, jid, m, instruction, usage, tag) {
  const imgMsg = m.message?.imageMessage;
  const quoted = getQuoted(m);
  const quotedImg = quoted?.quotedMessage?.imageMessage;
  const target = imgMsg ? m : quotedImg ? wrapQuoted(jid, quoted) : null;
  const mime = imgMsg?.mimetype || quotedImg?.mimetype || 'image/jpeg';
  if (!target) return await safeReply(sock, jid, usage, m);
  await interim(sock, jid, m, '🖼️ Lagi menganalisis gambarnya...');
  let buf;
  try {
    buf = await downloadBuffer(target, sock);
  } catch (e) {
    console.error(tag || 'vision', e?.message || e);
    return await safeReply(sock, jid, '❌ Gagal mengunduh gambar. Coba kirim ulang gambarnya.', m);
  }
  try {
    const v = await compressForVision(buf, mime);
    const p = await preprocessForOCR(v.buffer);
    const answer = await chatAI(instruction + OCR_SUFFIX, p.buffer.toString('base64'), p.mime);
    pushMessage(jid, 'user', instruction + ' [gambar]');
    pushMessage(jid, 'bot', answer);
    return await safeReply(sock, jid, answer, m);
  } catch (e) {
    console.error(tag || 'vision', e?.message || e);
    return await safeReply(sock, jid, '😢 Maaf, AI gambar sedang sibuk/gagal. Coba lagi sebentar ya.', m);
  }
}

// VN -> transkrip (Whisper) -> kirim transkrip segera -> jawab AI (pesan kedua)
// Dipakai .vn eksplisit maupun VN polos otomatis (private). VN >2 menit ditolak.
async function handleVN(sock, jid, m, target, audioMeta) {
  const secs = Number(audioMeta?.seconds || 0);
  if (secs > 120) {
    return await safeReply(sock, jid, '❌ VN terlalu panjang (max 2 menit). Kirim VN yang lebih pendek ya.', m);
  }
  await interim(sock, jid, m, '🎙️ Lagi transkrip VN...');
  let buf;
  try {
    buf = await downloadBuffer(target, sock);
  } catch (e) {
    console.error('vn', e?.message || e);
    return await safeReply(sock, jid, '❌ Gagal mengunduh VN. Coba lagi.', m);
  }
  const mime = audioMeta?.mimetype || 'audio/ogg';
  let transcript;
  try {
    transcript = await transcribeAudio(buf, mime);
  } catch (e) {
    console.error('vn', e?.message || e);
    return await safeReply(
      sock, jid,
      '😢 Maaf, transkrip VN gagal. Pastikan GROQ_API_KEY terisi dan coba VN lebih pendek.',
      m
    );
  }
  // Putus rantai: transkrip dikirim SEGERA, jawaban AI menyusul pesan kedua
  await safeReply(sock, jid, `🎙️ *Transkrip:*\n${transcript}`, m);
  pushMessage(jid, 'user', '[VN] ' + transcript);
  let answer = '';
  try {
    answer = await chatAI(`Transkrip VN berikut, jawab/tanggapi singkat:\n"${transcript}"`);
    pushMessage(jid, 'bot', answer);
  } catch (e) {
    console.error('vn', e?.message || e);
    answer = '(AI sedang sibuk, ini hanya hasil transkrip.)';
  }
  return await safeReply(sock, jid, `🤖 *Jawaban AI:*\n${answer}`, m);
}

async function handleMessage(sock, m) {
  try {
    if (!m?.message || m.key?.fromMe) return;
    const jid = m.key.remoteJid;
    const isGroup = jid.endsWith('@g.us');
    const raw = extractText(m);
    const unwrapped = unwrapMessage(m.message || {}) || {};
    const isDocMsg = !!unwrapped?.documentMessage;
    const audioMeta = unwrapped?.audioMessage;
    const isAudioMsg = !!audioMeta;
    if (!raw && !isDocMsg && !isAudioMsg) return;

    // VN polos di PRIVATE otomatis transkrip + jawab (grup wajib .vn eksplisit).
    // Di atas sebelum guard body kosong: VN polos body='' harus tetap diproses.
    if (!isGroup && audioMeta) {
      const capHasPrefix = String(raw || '').trim().startsWith(config.PREFIX);
      if (!capHasPrefix && !isMentionToBot(m, sock)) {
        await sock.sendPresenceUpdate('composing', jid).catch(() => {});
        return await handleVN(sock, jid, m, m, audioMeta);
      }
    }

    const prefix = config.PREFIX;
    const hasPrefix = raw.startsWith(prefix);
    const mentioned = isMentionToBot(m, sock);

    // ---------- FASE 2 SAFETY: anti-flood/anti-link/mute SEBELUM router (toleran-gagal) ----------
    // Wajib SEBELUM early-return grup non-prefix di bawah agar spam teks biasa ikut dicek.
    // trySafety true -> pesan sudah ditangani (hapus/warn), stop di sini.
    try {
      if (isGroup && trySafety && await trySafety(sock, m, { jid, sender: getSender(m), text: raw })) return;
    } catch (e) {
      console.error('[safety]', e?.message || e);
    }

    // Grup: hanya respon jika prefix / mention bot (dokumen ikut aturan yang sama)
    if (isGroup && !hasPrefix && !mentioned) {
      if (!isDocMsg) return;
      const cap = unwrapped?.documentMessage?.caption || '';
      if (!cap.startsWith(prefix)) return;
    }

    // Strip prefix; di grup tanpa prefix tapi mention -> pakai raw
    let body = hasPrefix ? raw.slice(prefix.length).trim() : raw.trim();
    // Bersihkan mention "@bot" di awal body (jika via mention tanpa prefix)
    body = body.replace(/^@\S+\s+/, '').trim();
    // Grup mention+prefix ganda ("@bot .ai halo"): strip prefix sekali lagi
    if (body.startsWith(prefix)) body = body.slice(prefix.length).trim();
    if (!body) return;

    const parts = body.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ').trim();

    const sender = getSender(m);
    const start = Date.now(); // untuk .ping (RTT)

    await sock.sendPresenceUpdate('composing', jid).catch(() => {});

    // ---------- FASE 1 ROUTER: registry baru dulu, fallback handler lama ----------
    // Hanya prefix [. ! #] + command terdaftar yang diambil alih; sisanya jatuh ke logika lama.
    try {
      if (await tryNewRouter(sock, m, jid, isGroup, sender, raw)) return;
    } catch (e) {
      console.error('[router]', e?.message || e);
    }

    // ---------- XP OTOMATIS 5-10 per pesan (non-fatal, tak ganggu flow AI) ----------
    try {
      const lv = systems.addXp(sender, 5 + Math.floor(Math.random() * 6));
      if (lv && lv.leveledUp) {
        await sock.sendMessage(
          jid,
          { text: `🎉 @${String(sender).split('@')[0]} naik ke *Lv.${lv.level}!*`, mentions: [String(sender)] },
          { quoted: m }
        ).catch(() => {});
      }
    } catch {}

    // ---------- AUTO-MODERASI GRUP: AFK / antilink / badword (non-fatal) ----------
    // Dilewati untuk command (ber-prefix) agar .badword/.linkgc tak kena hapus.
    if (isGroup && !hasPrefix) {
      try {
        // AFK: pengirim kembali → hapus status + kabari.
        if (systems.getAfk(sender)) {
          systems.clearAfk(sender);
          await sock.sendMessage(
            jid,
            { text: `👋 @${String(sender).split('@')[0]} sudah kembali dari AFK.` },
            { quoted: m }
          ).catch(() => {});
        }
        // AFK: mention user yang sedang AFK → notifikasi.
        const afkHit = systems.checkAfk(getMentionList(m));
        if (afkHit.length) {
          const lines = afkHit.map((a) => `• @${String(a.id).split('@')[0]} AFK: ${a.reason}`).join('\n');
          await sock.sendMessage(jid, { text: `💤 *AFK:*\n${lines}` }, { quoted: m }).catch(() => {});
        }
        // Antilink + badword: lewati admin grup.
        let senderIsAdmin = false;
        try {
          senderIsAdmin = await groupLane.isAdmin(sock, jid, sender);
        } catch {}
        if (!senderIsAdmin) {
          if (systems.isAntilinkOn(jid) && systems.containsInviteLink(raw)) {
            try {
              await sock.sendMessage(jid, { delete: m.key }).catch(() => {});
            } catch {}
            await safeReply(sock, jid, `🔗 @${String(sender).split('@')[0]} link invite grup tidak diizinkan di sini!`, m);
            return;
          }
          const bw = systems.containsBadword(raw);
          if (bw) {
            try {
              await sock.sendMessage(jid, { delete: m.key }).catch(() => {});
            } catch {}
            await safeReply(sock, jid, `🚫 Kata "${bw}" tidak diizinkan di grup ini!`, m);
            return;
          }
        }
      } catch {}
    }

    // ---------- FILE: dokumen otomatis (pdf/docx/txt, max ~5MB) ----------
    if (isDocMsg) {
      const doc = unwrapped.documentMessage;
      const fileLen = Number(doc.fileLength || 0);
      if (fileLen > 5 * 1024 * 1024) {
        return await safeReply(sock, jid, '❌ File terlalu besar (max ~5MB). Kirim file yang lebih kecil ya.', m);
      }
      const dName = String(doc.fileName || '').toLowerCase();
      const dMime = String(doc.mimetype || '').toLowerCase();
      const dOk =
        dName.endsWith('.pdf') || dName.endsWith('.docx') || dName.endsWith('.txt') ||
        dMime.includes('pdf') || dMime.includes('officedocument.wordprocessingml') ||
        dMime === 'text/plain' || dMime.startsWith('text/plain;');
      if (!dOk) {
        return await safeReply(sock, jid, '❌ Format tidak didukung. Kirim file .pdf / .docx / .txt ya (max 5MB). File .doc lama belum didukung — save as .docx dulu.', m);
      }
      try {
        await interim(sock, jid, m, '📄 Dokumen diterima, lagi dibaca...');
        const buf = await withTimeout(downloadBuffer(m, sock), 15000, 'Download dokumen');
        if (buf.length > 5 * 1024 * 1024) {
          return await safeReply(sock, jid, '❌ File terlalu besar (max ~5MB). Kirim file yang lebih kecil ya.', m);
        }
        const text = await extractDocText(buf, doc.fileName || '', doc.mimetype || '');
        const isPdfFile = dName.endsWith('.pdf') || dMime.includes('pdf');
        if ((!text || text.length < 20) && isPdfFile) {
          // PDF scan/foto: hemat token, jangan panggil AI — arahkan ke .ai vision
          return await safeReply(sock, jid, '📄 File ini kayaknya hasil scan/foto (tidak ada teks terbaca). Kirim foto halamannya langsung ke chat + caption .ai ya, nanti aku bacakan.', m);
        }
        if (!text || text.length < 20) {
          return await safeReply(sock, jid, '❌ Gagal membaca isi dokumen. Pastikan file PDF/DOCX/TXT tidak kosong/rusak.', m);
        }
        mapSetCapped(lastDoc, scopeKey(jid, sender), { name: doc.fileName || 'dokumen', text, at: Date.now() });
        if (chunkDocument(text).length > MAX_DOCUMENT_CHUNKS) {
          return await safeReply(sock, jid, `📄 Dokumennya terlalu panjang untuk diringkas sekaligus (melebihi ${MAX_DOCUMENT_CHUNKS} bagian). Coba kirim file yang lebih pendek / bagi menjadi beberapa file ya.`, m);
        }
        await interim(sock, jid, m, '📝 Lagi membaca dan menyusun ringkasan lengkap...');
        let summary;
        try {
          summary = await summarizeDocument(text, doc.fileName || 'dokumen');
        } catch (e) {
          if (e && e.code === 'TOO_LONG') {
            return await safeReply(sock, jid, `📄 Dokumennya terlalu panjang untuk diringkas sekaligus (melebihi ${MAX_DOCUMENT_CHUNKS} bagian). Coba kirim file yang lebih pendek / bagi menjadi beberapa file ya.`, m);
          }
          console.error('doc', e?.message || e);
          return await safeReply(
            sock, jid,
            `📄 *${doc.fileName || 'Dokumen'} tersimpan!* Tapi AI sedang sibuk, coba ${prefix}summarize sebentar lagi ya.`,
            m
          );
        }
        pushMessage(jid, 'user', `[dokumen: ${doc.fileName || 'dokumen'}]`);
        pushMessage(jid, 'bot', summary);
        return await sendLongText(
          sock, jid,
          `📄 *${doc.fileName || 'Dokumen'} tersimpan!*\n\n📝 *Ringkasan:*\n${summary}\n\n_Tanya isinya pakai ${prefix}ask ..._`,
          m
        );
      } catch (e) {
        console.error('doc', e?.message || e);
        return await safeReply(sock, jid, '❌ Gagal memproses dokumen. Coba file PDF/DOCX/TXT lain (max 5MB).', m);
      }
    }

    // Private tanpa prefix/mention = chat bebas, JANGAN dianggap command
    if (!isGroup && !hasPrefix && !mentioned) {
      try {
        const prompt = buildContextPrompt(jid, withTalkFlag(jid, sender, body));
        const answer = await chatAI(prompt, undefined, undefined, sessionStyle(jid, sender) || config.STYLE);
        pushMessage(jid, 'user', body);
        pushMessage(jid, 'bot', answer);
        return await safeReply(sock, jid, answer, m);
      } catch (e) {
        console.error('freechat', e?.message || e);
        return await safeReply(
          sock, jid,
          '😢 Maaf, AI sedang sibuk. Cek GEMINI_API_KEY / GROQ_API_KEY di file .env lalu coba lagi.',
          m
        );
      }
    }

    // ---------- MENU ----------
    if (cmd === 'menu' || cmd === 'help') {
      return await sendMenuWithHeader(sock, jid, m, menuText(getDisplayName(m) || 'kak', prefix));
    }

    // ---------- .ai ----------
    if (cmd === 'ai') {
      const imgMsg = m.message?.imageMessage;
      const quoted = getQuoted(m);
      const quotedImg = quoted?.quotedMessage?.imageMessage;

      // Kasus 1: gambar + caption .ai <pertanyaan> (vision)
      if (imgMsg) {
        const question = args || 'Jelaskan gambar ini.';
        await interim(sock, jid, m, '🖼️ Lagi menganalisis gambarnya...');
        let buf;
        try {
          buf = await downloadBuffer(m, sock);
        } catch (e) {
          console.error('ai', e?.message || e);
          return await safeReply(sock, jid, '❌ Gagal mengunduh gambar. Coba kirim ulang gambarnya.', m);
        }
        const v = await compressForVision(buf, imgMsg.mimetype || 'image/jpeg');
        const p = await preprocessForOCR(v.buffer);
        const base64 = p.buffer.toString('base64');
        const mime = p.mime;
        try {
          const answer = await chatAI(question + OCR_SUFFIX, base64, mime);
          pushMessage(jid, 'user', question + ' [gambar]');
          pushMessage(jid, 'bot', answer);
          return await safeReply(sock, jid, answer, m);
        } catch (e) {
          console.error('ai', e?.message || e);
          return await safeReply(
            sock, jid,
            '😢 Maaf, AI gambar sedang sibuk/gagal. Coba lagi sebentar ya, pastikan GEMINI_API_KEY terisi.',
            m
          );
        }
      }

      // Kasus 2: reply gambar + ketik .ai <pertanyaan>
      if (quotedImg && args) {
        await interim(sock, jid, m, '🖼️ Lagi menganalisis gambarnya...');
        let buf;
        try {
          buf = await downloadBuffer(wrapQuoted(jid, quoted), sock);
        } catch (e) {
          console.error('ai', e?.message || e);
          return await safeReply(sock, jid, '❌ Gagal mengunduh gambar yang di-reply.', m);
        }
        try {
          const v = await compressForVision(buf, quotedImg.mimetype || 'image/jpeg');
          const p = await preprocessForOCR(v.buffer);
          const answer = await chatAI(args + OCR_SUFFIX, p.buffer.toString('base64'), p.mime);
          pushMessage(jid, 'user', args + ' [gambar reply]');
          pushMessage(jid, 'bot', answer);
          return await safeReply(sock, jid, answer, m);
        } catch (e) {
          console.error('ai', e?.message || e);
          return await safeReply(sock, jid, '😢 Maaf, AI gambar sedang sibuk/gagal. Coba lagi sebentar ya.', m);
        }
      }

      // Kasus 3: chat teks biasa (dengan memory; ikut mode curhat bila aktif)
      if (!args) {
        return await safeReply(sock, jid, `Contoh: ${prefix}ai Halo, apa kabar?`, m);
      }
      try {
        if (isGroup) {
          // Jalur grup: sertakan identitas pengirim + reply/mention ke context.
          // Jalur private di bawah TIDAK diubah.
          const gopts = groupSenderOpts(m);
          const prompt = buildContextPrompt(jid, withTalkFlag(jid, sender, args), gopts);
          const answer = await chatAI(prompt, undefined, undefined, sessionStyle(jid, sender) || config.STYLE);
          pushMessage(jid, 'user', args, gopts);
          pushMessage(jid, 'bot', answer);
          return await safeReply(sock, jid, answer, m);
        }
        const prompt = buildContextPrompt(jid, withTalkFlag(jid, sender, args));
        const answer = await chatAI(prompt, undefined, undefined, sessionStyle(jid, sender) || config.STYLE);
        pushMessage(jid, 'user', args);
        pushMessage(jid, 'bot', answer);
        return await safeReply(sock, jid, answer, m);
      } catch (e) {
        console.error('ai', e?.message || e);
        return await safeReply(
          sock, jid,
          '😢 Maaf, AI sedang sibuk. Cek GEMINI_API_KEY / GROQ_API_KEY di file .env lalu coba lagi.',
          m
        );
      }
    }

    // ---------- .talk (masuk SESI curhat) / .stoptalk (keluar sesi) ----------
    if (cmd === 'talk' || cmd === 'curhat') {
      mapSetCapped(talkSessions, scopeKey(jid, sender), true);
      if (!args) {
        pushMessage(jid, 'user', '.talk (masuk mode curhat)');
        pushMessage(jid, 'bot', '[masuk mode curhat]');
        return await safeReply(
          sock, jid,
          `bolehh sini cerita pelan-pelan yaa, aku bakal dengerin kok \n\n_(mode curhat aktif - sampai kamu ketik ${prefix}stoptalk)_`,
          m
        );
      }
      try {
        const prompt = buildContextPrompt(jid, withTalkFlag(jid, sender, args));
        const answer = await chatAI(prompt, undefined, undefined, config.TALK_STYLE);
        pushMessage(jid, 'user', args);
        pushMessage(jid, 'bot', answer);
        return await safeReply(sock, jid, `${answer}\n\n_(mode curhat aktif sampai ${prefix}stoptalk)_`, m);
      } catch (e) {
        console.error('talk', e?.message || e);
        return await safeReply(sock, jid, '😢 Maaf, AI sedang sibuk. Coba lagi sebentar ya.', m);
      }
    }
    if (cmd === 'stoptalk' || cmd === 'stopcurhat') {
      talkSessions.delete(scopeKey(jid, sender));
      pushMessage(jid, 'user', '.stoptalk (keluar mode curhat)');
      pushMessage(jid, 'bot', '[keluar mode curhat]');
      return await safeReply(
        sock, jid,
        'okeyy, mode curhatnya aku matiin ya. makasih udah mau ceritaa, kamu hebat kok udah berani ngomongin inii.. \n\nmau lanjut ngobrol biasa atau tanya-tanya, gas ajaa!',
        m
      );
    }

    // ---------- .img ----------
    if (cmd === 'img' || cmd === 'image' || cmd === 'gambar') {
      if (!args) {
        return await safeReply(sock, jid, `Contoh: ${prefix}img kucing astronot di bulan, ultra detail`, m);
      }
      await interim(sock, jid, m, '🎨 Lagi digambar...');
      // 1024px HD + 25 dtk/percobaan, retry MAKS 1x seed beda
      const tryImg = async (seed) => {
        const url =
          `https://image.pollinations.ai/prompt/${encodeURIComponent(args)}` +
          `?width=1024&height=1024&seed=${seed}&model=flux&nologo=true`;
        const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
        if (!res.ok) throw new Error('Pollinations HTTP ' + res.status);
        return Buffer.from(await res.arrayBuffer());
      };
      try {
        let buf;
        try {
          buf = await tryImg(Math.floor(Math.random() * 999999));
        } catch (e1) {
          console.error('img', e1?.message || e1);
          buf = await tryImg(Math.floor(Math.random() * 999999)); // retry 1x, seed beda
        }
        mapSetCapped(lastBotImage, scopeKey(jid, sender), buf); // simpan untuk .stiker berurutan
        pushMessage(jid, 'user', '.img ' + args);
        pushMessage(jid, 'bot', '[mengirim gambar]');
        await sock.sendMessage(
          jid,
          { image: buf, caption: `🎨 *${args}*` },
          { quoted: m }
        );
      } catch (e) {
        console.error('img', e?.message || e);
        return await safeReply(sock, jid, '❌ Gagal membuat gambar setelah 2x coba. Coba prompt lain / ulangi sebentar lagi ya.', m);
      }
      return;
    }

    // ---------- .stiker ----------
    if (cmd === 'stiker' || cmd === 'sticker') {
      const quoted = getQuoted(m);
      const quotedImg = quoted?.quotedMessage?.imageMessage;
      const currentImg = m.message?.imageMessage;

      // A. Ada gambar (reply gambar / kirim gambar + caption .stiker)
      if (quotedImg || currentImg) {
        try {
          const target = quotedImg ? wrapQuoted(jid, quoted) : m;
          const buf = await downloadBuffer(target, sock);
          const webp = await imageToSticker(buf);
          await sock.sendMessage(jid, { sticker: webp }, { quoted: m });
        } catch (e) {
          console.error('stiker', e?.message || e);
          await safeReply(sock, jid, '❌ Gagal membuat stiker dari gambar. Coba gambar lain.', m);
        }
        return;
      }

      // B. Teks -> stiker (.stiker <teks>)
      if (args) {
        try {
          const webp = await textToSticker(args);
          await sock.sendMessage(jid, { sticker: webp }, { quoted: m });
        } catch (e) {
          console.error('stiker', e?.message || e);
          await safeReply(sock, jid, '❌ Gagal membuat stiker teks.', m);
        }
        return;
      }

      // C. Berurutan: .img lalu .stiker (pakai gambar terakhir pengirim di chat ini)
      const prevImg = lastBotImage.get(scopeKey(jid, sender));
      if (prevImg) {
        try {
          const webp = await imageToSticker(prevImg);
          await sock.sendMessage(jid, { sticker: webp }, { quoted: m });
        } catch (e) {
          console.error('stiker', e?.message || e);
          await safeReply(sock, jid, '❌ Gagal membuat stiker dari gambar terakhir.', m);
        }
        return;
      }

      return await safeReply(
        sock, jid,
        `Cara pakai:\n• reply gambar + ${prefix}stiker\n• ${prefix}stiker <teks>\n• ${prefix}img <prompt> lalu ${prefix}stiker`,
        m
      );
    }

    // ---------- .vn / .transcribe (transkrip voice note) ----------
    if (cmd === 'vn' || cmd === 'transkrip' || cmd === 'transcribe') {
      const quoted = getQuoted(m);
      const quotedAudio = quoted?.quotedMessage?.audioMessage;
      const currentAudio = m.message?.audioMessage;

      const target = quotedAudio ? wrapQuoted(jid, quoted) : currentAudio ? m : null;
      if (!target) {
        return await safeReply(sock, jid, `Reply VN dengan ${prefix}vn, atau kirim VN dengan caption ${prefix}vn`, m);
      }
      return await handleVN(sock, jid, m, target, quotedAudio || currentAudio);
    }

    // ---------- 1. CHAT: new / clear / memory / model ----------
    if (cmd === 'new') {
      clearMemory(jid);
      talkSessions.delete(scopeKey(jid, sender));
      return await safeReply(sock, jid, '✨ Oke, kita mulai baru! Ingatanku sudah kuhapus. Mau tanya apa?', m);
    }
    if (cmd === 'clear') {
      clearMemory(jid);
      talkSessions.delete(scopeKey(jid, sender));
      return await safeReply(sock, jid, '🧹 Ingatan chat dihapus. Sampai jumpa lagi!', m);
    }
    if (cmd === 'memory') {
      const hist = getMemory(jid);
      if (hist.length === 0) {
        return await safeReply(sock, jid, '🧠 Belum ada pesan tersimpan. Ngobrol dulu yuk pakai .ai!', m);
      }
      const last3 = hist
        .slice(-3)
        .map((h) => `• [${h.role}] ${String(h.content).slice(0, 120)}`)
        .join('\n');
      return await safeReply(
        sock, jid,
        `🧠 *Memory:* ${hist.length} pesan tersimpan.\n\n${last3}`,
        m
      );
    }
    if (cmd === 'model') {
      return await safeReply(
        sock, jid,
        `🧩 *Model aktif:*\n• Gemini: ${config.GEMINI_MODEL}\n• Groq: ${config.GROQ_CHAT_MODEL}`,
        m
      );
    }

    // ---------- 2. AI TOOLS ----------
    if (cmd === 'ask') {
      if (!args) {
        return await safeReply(sock, jid, `Contoh: ${prefix}ask Apa itu fotosintesis?`, m);
      }
      try {
        const doc = lastDoc.get(scopeKey(jid, sender));
        if (doc) {
          const picked = retrieveDocChunks(doc.text, args, 3);
          let ctx = picked.join('\n\n---\n\n');
          if (ctx.length > 15000) ctx = ctx.slice(0, 15000);
          const prompt = `Berdasarkan kutipan dokumen "${doc.name}" berikut, jawab pertanyaan hanya dari isi kutipan (jangan mengarang, jika tidak ada jawab jujur):\n\n${ctx}\n\nPertanyaan: ${args}`;
          const answer = await chatAI(prompt);
          pushMessage(jid, 'user', args);
          pushMessage(jid, 'bot', answer);
          return await safeReply(sock, jid, answer, m);
        }
        const prompt = buildContextPrompt(jid, args);
        const answer = await chatAI(prompt);
        pushMessage(jid, 'user', args);
        pushMessage(jid, 'bot', answer);
        return await safeReply(sock, jid, answer, m);
      } catch (e) {
        console.error('ask', e?.message || e);
        return await safeReply(sock, jid, '😢 Maaf, AI sedang sibuk. Coba lagi sebentar ya.', m);
      }
    }
    if (cmd === 'explain') {
      return await aiWrap(sock, jid, m, args, 'Jelaskan secara sederhana dan mudah dipahami: ', `Contoh: ${prefix}explain gravitasi`, 'explain');
    }
    if (cmd === 'summarize' || cmd === 'ringkas') {
      if (args) {
        return await aiWrap(sock, jid, m, args, 'Ringkas teks berikut secara singkat dan jelas: ', '', 'summarize');
      }
      const doc = lastDoc.get(scopeKey(jid, sender));
      if (doc) {
        if (chunkDocument(doc.text).length > MAX_DOCUMENT_CHUNKS) {
          return await safeReply(sock, jid, `📄 Dokumennya terlalu panjang untuk diringkas sekaligus (melebihi ${MAX_DOCUMENT_CHUNKS} bagian). Coba kirim file yang lebih pendek / bagi menjadi beberapa file ya.`, m);
        }
        await interim(sock, jid, m, '📝 Lagi membaca dan menyusun ringkasan lengkap...');
        try {
          const summary = await summarizeDocument(doc.text, doc.name);
          pushMessage(jid, 'user', `[summarize: ${doc.name}]`);
          pushMessage(jid, 'bot', summary);
          return await sendLongText(sock, jid, `📝 *Ringkasan ${doc.name}:*\n${summary}`, m);
        } catch (e) {
          if (e && e.code === 'TOO_LONG') {
            return await safeReply(sock, jid, `📄 Dokumennya terlalu panjang untuk diringkas sekaligus (melebihi ${MAX_DOCUMENT_CHUNKS} bagian). Coba kirim file yang lebih pendek / bagi menjadi beberapa file ya.`, m);
          }
          console.error('summarize', e?.message || e);
          return await safeReply(sock, jid, '😢 Maaf, AI sedang sibuk. Coba lagi sebentar ya.', m);
        }
      }
      return await safeReply(sock, jid, `Contoh: ${prefix}summarize <teks panjang> — atau kirim dokumen dulu lalu ${prefix}summarize`, m);
    }
    if (cmd === 'rewrite') {
      return await aiWrap(sock, jid, m, args, 'Tulis ulang teks berikut dengan gaya yang berbeda tapi makna tetap sama: ', `Contoh: ${prefix}rewrite <teks>`, 'rewrite');
    }
    if (cmd === 'translate') {
      return await aiWrap(sock, jid, m, args, 'Terjemahkan ke Bahasa Indonesia, jika teks sudah Bahasa Indonesia terjemahkan ke Bahasa Inggris: ', `Contoh: ${prefix}translate good morning`, 'translate');
    }
    if (cmd === 'ideas' || cmd === 'ide') {
      return await aiWrap(sock, jid, m, args, 'Beri 7 ide kreatif tentang: ', `Contoh: ${prefix}ideas usaha kopi modal kecil`, 'ideas');
    }

    // ---------- 3. WEB & INFO ----------
    if (cmd === 'search') {
      if (!args) {
        return await safeReply(sock, jid, `Contoh: ${prefix}search resep rendang`, m);
      }
      await interim(sock, jid, m, '🔎 Lagi cari di web...');
      // Tahap 1: Wikipedia
      try {
        const w = await wikiSummary(args);
        const out = `📖 *${w.title}*\n${w.extract}${w.url ? `\n🔗 ${w.url}` : ''}`;
        pushMessage(jid, 'user', '.search ' + args);
        pushMessage(jid, 'bot', out.slice(0, 2000));
        return await safeReply(sock, jid, `🔎 *Hasil "${args}" (Wikipedia):*\n\n${out}`, m);
      } catch (e) {
        console.error('search-wiki', e?.message || e);
      }
      // Tahap 2: DuckDuckGo
      try {
        const r = await ddgSearch(args);
        const lines = [];
        if (r.abstract) lines.push(`📖 ${r.abstract}`);
        r.topics.forEach((t, i) => lines.push(`${i + 1}. ${t.text}${t.url ? `\n   🔗 ${t.url}` : ''}`));
        if (lines.length === 0) throw new Error('kosong');
        pushMessage(jid, 'user', '.search ' + args);
        pushMessage(jid, 'bot', lines.join('\n\n').slice(0, 2000));
        return await safeReply(sock, jid, `🔎 *Hasil "${args}":*\n\n${lines.join('\n\n')}`, m);
      } catch (e) {
        console.error('search', e?.message || e);
      }
      // Tahap 3: AI fallback — jangan pernah balas "web kosong" tanpa jawaban
      try {
        const fb = await chatAI(
          buildContextPrompt(jid, `Jawab berdasarkan pengetahuanmu, awali dengan _(info web tidak tersedia)_: ${args}`)
        );
        pushMessage(jid, 'user', '.search ' + args);
        pushMessage(jid, 'bot', fb);
        return await safeReply(sock, jid, fb, m);
      } catch (e) {
        console.error('search', e?.message || e);
        return await safeReply(sock, jid, '❌ Pencarian gagal total. Coba kata kunci lain ya.', m);
      }
    }
    if (cmd === 'news' || cmd === 'berita') {
      if (!args) {
        return await safeReply(sock, jid, `Contoh: ${prefix}news timnas indonesia`, m);
      }
      await interim(sock, jid, m, '📰 Lagi ambil berita...');
      try {
        const list = await googleNews(args);
        if (list.length === 0) throw new Error('kosong');
        const out = list
          .map((n, i) => `${i + 1}. *${n.title}*\n   🗓️ ${n.pubDate}${n.link ? `\n   🔗 ${n.link}` : ''}`)
          .join('\n\n');
        pushMessage(jid, 'user', '.news ' + args);
        pushMessage(jid, 'bot', out.slice(0, 2000));
        return await safeReply(sock, jid, `📰 *Berita "${args}":*\n\n${out}`, m);
      } catch (e) {
        console.error('news', e?.message || e);
        return await safeReply(sock, jid, '❌ Gagal ambil berita. Coba topik lain / ulangi sebentar lagi.', m);
      }
    }
    if (cmd === 'weather' || cmd === 'cuaca') {
      if (!args) {
        return await safeReply(sock, jid, `Contoh: ${prefix}weather Bandung`, m);
      }
      try {
        const w = await getWeather(args);
        return await safeReply(
          sock, jid,
          `🌤️ *Cuaca ${w.name}${w.country ? ', ' + w.country : ''}*\n` +
          `Kondisi: ${w.desc}\n🌡️ Suhu: ${w.temp}°C (min ${w.min}°C / max ${w.max}°C)\n💧 Kelembapan: ${w.humidity}%\n💨 Angin: ${w.wind} km/jam`,
          m
        );
      } catch (e) {
        console.error('weather', e?.message || e);
        const msg = String((e && e.message) || '');
        if (msg.includes('tidak ditemukan')) {
          return await safeReply(sock, jid, `❌ Kota "${args}" tidak ditemukan. Coba nama kota lain ya.`, m);
        }
        return await safeReply(sock, jid, '❌ Gagal ambil cuaca. Coba lagi sebentar ya.', m);
      }
    }
    if (cmd === 'time' || cmd === 'jam') {
      if (!args) {
        return await safeReply(sock, jid, `Contoh: ${prefix}time Tokyo`, m);
      }
      try {
        const t = await getLocalTime(args);
        if (!t) {
          const fb = await chatAI(`Pengguna tanya jam di "${args}" tapi kotanya tidak ada di daftarku. Jawab semampumu dari pengetahuanmu: sekarang jam berapa di ${args}?`);
          return await safeReply(sock, jid, `${fb}`, m);
        }
        const d = new Date(t.datetime);
        const str = t.str || (isNaN(d.getTime())
          ? t.datetime
          : d.toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' }));
        return await safeReply(sock, jid, `🕒 *Waktu di ${args}*\n${str}\n(${t.zone}${t.abbrev ? ' • ' + t.abbrev : ''})`, m);
      } catch (e) {
        console.error('time', e?.message || e);
        return await safeReply(sock, jid, '❌ Gagal ambil waktu. Coba lagi sebentar ya.', m);
      }
    }

    // ---------- 4. CODE ----------
    if (cmd === 'code') {
      return await aiWrap(sock, jid, m, args, 'Buatkan kode yang rapi beserta penjelasan singkat. Permintaan: ', `Contoh: ${prefix}code fungsi fibonacci python`, 'code');
    }
    if (cmd === 'debug') {
      return await aiWrap(sock, jid, m, args, 'Analisa error pada kode berikut, jelaskan penyebabnya dan solusinya: ', `Contoh: ${prefix}debug <tempel kode + pesan error>`, 'debug');
    }
    if (cmd === 'fix') {
      return await aiWrap(sock, jid, m, args, 'Perbaiki kode berikut agar berjalan benar, tampilkan kode hasil perbaikan + penjelasan singkat perubahannya: ', `Contoh: ${prefix}fix <tempel kode>`, 'fix');
    }

    // ---------- 5. VISION (reply gambar) ----------
    if (cmd === 'ocr') {
      return await visionWrap(sock, jid, m, 'Bacakan semua teks yang ada di gambar ini persis apa adanya, tanpa tambahan.', `Reply gambar + ${prefix}ocr untuk membaca teks di gambar.`, 'ocr');
    }
    if (cmd === 'describe' || cmd === 'deskripsi') {
      return await visionWrap(sock, jid, m, 'Deskripsikan gambar ini secara detail: objek, warna, suasana, dan hal menarik lainnya.', `Reply gambar + ${prefix}describe untuk mendeskripsikan gambar.`, 'describe');
    }
    if (cmd === 'analyze' || cmd === 'analisis') {
      return await visionWrap(sock, jid, m, 'Analisis gambar ini secara mendalam: isi, konteks, makna, dan hal penting yang perlu diketahui.', `Reply gambar + ${prefix}analyze untuk menganalisis gambar.`, 'analyze');
    }

    // ---------- 6. CREATIVE ----------
    if (cmd === 'caption') {
      return await aiWrap(sock, jid, m, args, 'Buatkan 3 pilihan caption media sosial yang catchy lengkap dengan hashtag untuk topik: ', `Contoh: ${prefix}caption liburan ke pantai`, 'caption');
    }
    if (cmd === 'story' || cmd === 'cerita') {
      return await aiWrap(sock, jid, m, args, 'Buatkan cerita pendek yang menarik tentang: ', `Contoh: ${prefix}story robot penjaga hutan`, 'story');
    }
    if (cmd === 'prompt') {
      return await aiWrap(sock, jid, m, args, 'Buatkan prompt gambar AI yang sangat detail (gaya, objek, lighting, komposisi) untuk ide: ', `Contoh: ${prefix}prompt istana di awan saat senja`, 'prompt');
    }

    // ---------- .brat (stiker teks ala brat, render lokal) ----------
    if (cmd === 'brat') {
      if (!args) {
        return await safeReply(sock, jid, `Contoh: ${prefix}brat i don't know what to say`, m);
      }
      try {
        const webp = await textToSticker(args);
        pushMessage(jid, 'user', '.brat ' + args);
        pushMessage(jid, 'bot', '[mengirim stiker brat]');
        await sock.sendMessage(jid, { sticker: webp }, { quoted: m });
      } catch (e) {
        console.error('brat', e?.message || e);
        return await safeReply(sock, jid, '❌ Gagal membuat stiker brat. Coba teks lain ya.', m);
      }
      return;
    }

    // ---------- 7. VOICE: tts (chunk ≤200 char, kirim berurutan) ----------
    if (cmd === 'tts') {
      if (!args) {
        return await safeReply(sock, jid, `Contoh: ${prefix}tts Halo, selamat pagi semuanya`, m);
      }
      if (args.length > 300) {
        return await safeReply(sock, jid, '❌ Teks terlalu panjang (max 300 karakter). Pendekkan dulu ya.', m);
      }
      await interim(sock, jid, m, '🎙️ Lagi bikin suara...');
      try {
        const chunks = chunkText(args, 200);
        // Utama Edge TTS paralel (urutan via index); per chunk gagal -> Google + retry 1x
        const bufs = await Promise.all(chunks.map(async (chunk, i) => {
          try {
            return { i, buf: await ttsEdge(chunk) };
          } catch (eEdge) {
            console.error('tts-edge', eEdge?.message || eEdge);
            try {
              return { i, buf: await googleTTSChunk(chunk) };
            } catch (e1) {
              console.error('tts', e1?.message || e1);
              return { i, buf: await googleTTSChunk(chunk) }; // retry 1x
            }
          }
        }));
        bufs.sort((a, b) => a.i - b.i);
        for (const b of bufs) {
          await sock.sendMessage(jid, { audio: b.buf, mimetype: 'audio/mpeg', ptt: true }, { quoted: m });
        }
      } catch (e) {
        console.error('tts', e?.message || e);
        return await safeReply(sock, jid, '❌ Gagal membuat suara via Edge maupun Google. Coba teks lain / ulangi sebentar lagi ya.', m);
      }
      return;
    }

    // ---------- 9. UTILITIES ----------
    if (cmd === 'calc' || cmd === 'hitung') {
      if (!args) {
        return await safeReply(sock, jid, `Contoh: ${prefix}calc 12*8+5`, m);
      }
      if (args.length > 100) {
        return await safeReply(sock, jid, '❌ Rumus max 100 karakter.', m);
      }
      if (!/^[0-9+\-*/().,%\s^]*$/.test(args) || args.trim() === '') {
        return await safeReply(sock, jid, '❌ Rumus hanya boleh angka & operator + - * / ( ) . % ^', m);
      }
      try {
        const expr = args.replace(/\^/g, '**').replace(/,/g, '.');
        if (/\*\*.*\*\*/.test(expr)) throw new Error('nested-power');
        if (!/^[0-9+\-*/().\s%*]*$/.test(expr)) throw new Error('bad');
        const val = Function('"use strict"; return (' + expr + ')')();
        if (typeof val !== 'number' || !isFinite(val)) throw new Error('bad');
        return await safeReply(sock, jid, `🧮 *${args}* = *${val}*`, m);
      } catch (e) {
        console.error('calc', e?.message || e);
        return await safeReply(sock, jid, '❌ Rumus tidak valid. Contoh: .calc (12+8)*2', m);
      }
    }
    if (cmd === 'convert' || cmd === 'konversi') {
      return await aiWrap(sock, jid, m, args, 'Jawab konversi berikut dengan tepat (satuan, mata uang pakai kurs umum, jelaskan singkat cara hitungnya): ', `Contoh: ${prefix}convert 100 USD ke rupiah`, 'convert');
    }
    if (cmd === 'qr') {
      if (!args) {
        return await safeReply(sock, jid, `Contoh: ${prefix}qr https://google.com`, m);
      }
      if (args.length > 500) {
        return await safeReply(sock, jid, '❌ Teks terlalu panjang (max 500 karakter).', m);
      }
      try {
        const QRCode = require('qrcode');
        const buf = await QRCode.toBuffer(args, { type: 'png', width: 512, margin: 1 });
        await sock.sendMessage(jid, { image: buf, caption: `🔳 QR: ${args}` }, { quoted: m });
      } catch (e) {
        console.error('qr', e?.message || e);
        return await safeReply(sock, jid, '❌ Gagal membuat QR. Coba teks lain ya.', m);
      }
      return;
    }
    if (cmd === 'ping') {
      return await safeReply(sock, jid, `🏓 Pong! ${Date.now() - start} ms`, m);
    }

    // ---------- 10. BOT: about / status ----------
    if (cmd === 'about') {
      return await sendMenuWithHeader(
        sock, jid, m,
        `🤖 *SONEZZ AI ASSISTANT*\n\n` +
        `*SONEZZ* adalah WhatsApp AI Assistant yang menggabungkan AI, utility, media, downloader, game, dan berbagai fitur lainnya dalam satu bot.\n\n` +
        `*✦ FEATURES*\n\n` +
        `💬 *AI Chat* — ngobrol, tanya jawab, curhat, dan memory\n` +
        `🧠 *AI Tools* — explain, summarize, rewrite, translate, dan ideas\n` +
        `💻 *Coding* — generate, debug, dan fix kode\n` +
        `🌐 *Web & Info* — search, news, weather, dan berbagai utility\n` +
        `🎨 *Creative* — generate gambar dan bantu membuat konten\n` +
        `👁️ *Vision & Voice* — OCR, analisis gambar, transcribe, dan TTS\n` +
        `📥 *Downloader* — download berbagai media\n` +
        `🎲 *Fun & RPG* — game, random tools, quest, dan leaderboard\n` +
        `💰 *Economy* — daily, work, bank, transfer, mining, dan progression\n` +
        `👥 *Group Tools* — moderation dan pengaturan grup\n\n` +
        `*✦ ABOUT*\n\n` +
        `SONEZZ dikembangkan sebagai project WhatsApp bot dengan berbagai fitur yang bisa digunakan langsung dari chat.\n\n` +
        `Setiap fitur dibuat untuk kebutuhan yang berbeda, mulai dari ngobrol dengan AI, mencari informasi, mengolah media dan dokumen, sampai bermain dan mengelola grup.\n\n` +
        `Ketik ${prefix}menu untuk melihat seluruh command yang tersedia.\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `*SONEZZ AI ASSISTANT*\n` +
        `_WhatsApp AI · Utility · Media · Fun_`
      );
    }
    if (cmd === 'status') {
      const up = Math.floor(process.uptime());
      const h = Math.floor(up / 3600);
      const mi = Math.floor((up % 3600) / 60);
      const s = up % 60;
      return await safeReply(
        sock, jid,
        `📊 *Status Bot*\n` +
        `• Uptime: ${h}j ${mi}m ${s}d\n` +
        `• Model: ${config.GEMINI_MODEL} + ${config.GROQ_CHAT_MODEL}\n` +
        `• Chat di memory: ${countChats()} jid\n` +
        `• Dokumen tersimpan: ${lastDoc.size} chat`,
        m
      );
    }

    // ---------- .run (eksekusi JS aman, OWNER ONLY) ----------
    if (cmd === 'run') {
      if (!isOwner(m.key.participant, m.key.remoteJid)) {
        return await safeReply(sock, jid, '⛔ Hanya owner yang bisa pakai perintah ini.', m);
      }
      const lastRun = runCooldown.get(sender) || 0;
      if (Date.now() - lastRun < 5000) {
        return await safeReply(sock, jid, '⏳ Cooldown .run 5 detik, tunggu sebentar.', m);
      }

      // Ambil kode: argumen langsung, atau reply ke pesan berisi kode
      let code = args;
      if (!code) {
        const qRaw = getQuoted(m)?.quotedMessage;
        const q = qRaw ? unwrapMessage(qRaw) : null;
        code = (q?.conversation || q?.extendedTextMessage?.text || '').trim();
      }
      if (!code) {
        return await safeReply(sock, jid, `Contoh: ${prefix}run 2+2*10`, m);
      }
      runCooldown.set(sender, Date.now());

      console.log(`[RUN] ${sender} :: ${code.slice(0, 200)}`);
      try {
        const out = await runSandboxed(code);
        return await safeReply(sock, jid, `💻 *Hasil:*\n${out}`, m);
      } catch (e) {
        console.error('run', e?.message || e);
        const msg = String((e && e.message) || e || 'Error').slice(0, 500);
        return await safeReply(sock, jid, `❌ Error:\n${msg}`, m);
      }
    }

    // ---------- LANE GRUP ADMIN (lib/group.js) ----------
    if (cmd === 'tagall') {
      const g = groupLane.guardGroup(jid);
      if (g) return await safeReply(sock, jid, g, m);
      const ga = await groupLane.guardAdmin(sock, jid, sender);
      if (ga) return await safeReply(sock, jid, ga, m);
      try {
        await groupLane.tagall(sock, jid, m, args);
      } catch (e) {
        console.error('tagall', e?.message || e);
        return await safeReply(sock, jid, '❌ Gagal tagall. Coba lagi.', m);
      }
      return;
    }
    if (cmd === 'hidetag' || cmd === 'hideteg') {
      const g = groupLane.guardGroup(jid);
      if (g) return await safeReply(sock, jid, g, m);
      const ga = await groupLane.guardAdmin(sock, jid, sender);
      if (ga) return await safeReply(sock, jid, ga, m);
      if (!args) return await safeReply(sock, jid, `Contoh: ${prefix}hidetag Halo semua!`, m);
      try {
        await groupLane.hidetag(sock, jid, args, m);
      } catch (e) {
        console.error('hidetag', e?.message || e);
        return await safeReply(sock, jid, '❌ Gagal hidetag. Coba lagi.', m);
      }
      return;
    }
    if (cmd === 'kick') {
      const ga = await groupLane.guardAdmin(sock, jid, sender);
      if (ga) return await safeReply(sock, jid, ga, m);
      const gb = await groupLane.guardBotAdmin(sock, jid);
      if (gb) return await safeReply(sock, jid, gb, m);
      const targets = groupLane.resolveTargets(m, args);
      if (!targets.length) return await safeReply(sock, jid, `Contoh: ${prefix}kick @user (atau reply pesannya)`, m);
      try {
        await groupLane.kick(sock, jid, targets);
        return await safeReply(sock, jid, `✅ ${targets.length} anggota dikeluarkan.`, m);
      } catch (e) {
        console.error('kick', e?.message || e);
        return await safeReply(sock, jid, '❌ Gagal kick. Pastikan target valid & bot admin.', m);
      }
    }
    if (cmd === 'add') {
      const ga = await groupLane.guardAdmin(sock, jid, sender);
      if (ga) return await safeReply(sock, jid, ga, m);
      const gb = await groupLane.guardBotAdmin(sock, jid);
      if (gb) return await safeReply(sock, jid, gb, m);
      const nums = (String(args || '').match(/\d{8,16}/g) || []).map(String);
      if (!nums.length) return await safeReply(sock, jid, `Contoh: ${prefix}add 6281234567890`, m);
      try {
        await groupLane.addMembers(sock, jid, nums);
        return await safeReply(sock, jid, `✅ Undangan dikirim ke ${nums.length} nomor.`, m);
      } catch (e) {
        console.error('add', e?.message || e);
        return await safeReply(sock, jid, '❌ Gagal add. Nomor harus terdaftar WA & mengizinkan ditambah.', m);
      }
    }
    if (cmd === 'promote' || cmd === 'demote') {
      const ga = await groupLane.guardAdmin(sock, jid, sender);
      if (ga) return await safeReply(sock, jid, ga, m);
      const gb = await groupLane.guardBotAdmin(sock, jid);
      if (gb) return await safeReply(sock, jid, gb, m);
      const targets = groupLane.resolveTargets(m, args);
      if (!targets.length) return await safeReply(sock, jid, `Contoh: ${prefix}${cmd} @user`, m);
      try {
        if (cmd === 'promote') await groupLane.promote(sock, jid, targets);
        else await groupLane.demote(sock, jid, targets);
        return await safeReply(sock, jid, `✅ ${cmd} berhasil untuk ${targets.length} anggota.`, m);
      } catch (e) {
        console.error(cmd, e?.message || e);
        return await safeReply(sock, jid, `❌ Gagal ${cmd}. Coba lagi.`, m);
      }
    }
    if (cmd === 'linkgc' || cmd === 'linkgrup' || cmd === 'linkgroup') {
      const ga = await groupLane.guardAdmin(sock, jid, sender);
      if (ga) return await safeReply(sock, jid, ga, m);
      try {
        const link = await groupLane.getInviteLink(sock, jid);
        return await safeReply(sock, jid, `🔗 *Link grup:*\n${link}`, m);
      } catch (e) {
        console.error('linkgc', e?.message || e);
        return await safeReply(sock, jid, '❌ Gagal ambil link grup. Pastikan bot admin.', m);
      }
    }
    if (cmd === 'group' || cmd === 'grup') {
      const ga = await groupLane.guardAdmin(sock, jid, sender);
      if (ga) return await safeReply(sock, jid, ga, m);
      const gb = await groupLane.guardBotAdmin(sock, jid);
      if (gb) return await safeReply(sock, jid, gb, m);
      const sub = String(args || '').trim().toLowerCase();
      try {
        if (sub === 'buka' || sub === 'open') {
          await groupLane.openGroup(sock, jid);
          return await safeReply(sock, jid, '✅ Grup dibuka — semua anggota bisa chat.', m);
        }
        if (sub === 'tutup' || sub === 'close') {
          await groupLane.closeGroup(sock, jid);
          return await safeReply(sock, jid, '🔒 Grup ditutup — hanya admin yang bisa chat.', m);
        }
        return await safeReply(sock, jid, `Contoh: ${prefix}group buka / ${prefix}group tutup`, m);
      } catch (e) {
        console.error('group', e?.message || e);
        return await safeReply(sock, jid, '❌ Gagal ubah setelan grup.', m);
      }
    }
    if (cmd === 'setname' || cmd === 'setdesc') {
      const ga = await groupLane.guardAdmin(sock, jid, sender);
      if (ga) return await safeReply(sock, jid, ga, m);
      const gb = await groupLane.guardBotAdmin(sock, jid);
      if (gb) return await safeReply(sock, jid, gb, m);
      if (!args) return await safeReply(sock, jid, `Contoh: ${prefix}${cmd} Teks baru`, m);
      try {
        if (cmd === 'setname') await groupLane.setGroupName(sock, jid, args);
        else await groupLane.setGroupDesc(sock, jid, args);
        return await safeReply(sock, jid, `✅ ${cmd} berhasil.`, m);
      } catch (e) {
        console.error(cmd, e?.message || e);
        return await safeReply(sock, jid, `❌ Gagal ${cmd}.`, m);
      }
    }
    if (cmd === 'grouplist' || cmd === 'listgc' || cmd === 'listgrup') {
      try {
        const all = await sock.groupFetchAllParticipating();
        const list = Object.values(all || {});
        if (!list.length) return await safeReply(sock, jid, '📋 Bot belum ikut grup mana pun.', m);
        const out = list.map((gr, i) => `${i + 1}. *${gr.subject || '-'}* (${(gr.participants || []).length} anggota)`).join('\n');
        return await safeReply(sock, jid, `📋 *Grup bot (${list.length}):*\n${out}`, m);
      } catch (e) {
        console.error('grouplist', e?.message || e);
        return await safeReply(sock, jid, '❌ Gagal ambil daftar grup.', m);
      }
    }
    if (cmd === 'listadmin' || cmd === 'adminlist') {
      const g = groupLane.guardGroup(jid);
      if (g) return await safeReply(sock, jid, g, m);
      try {
        const parts = await groupLane.getParticipants(sock, jid);
        const admins = parts.filter(groupLane.isParticipantAdmin);
        if (!admins.length) return await safeReply(sock, jid, 'Belum ada admin terdeteksi.', m);
        const ids = admins.map((p) => String(p.id));
        const text = '👑 *Admin grup:*\n' + ids.map((id, i) => `${i + 1}. @${id.split('@')[0]}`).join('\n');
        await sock.sendMessage(jid, { text, mentions: ids }, { quoted: m });
      } catch (e) {
        console.error('listadmin', e?.message || e);
        return await safeReply(sock, jid, '❌ Gagal ambil daftar admin.', m);
      }
      return;
    }
    if (cmd === 'infogc' || cmd === 'infogrup' || cmd === 'infogroup') {
      const g = groupLane.guardGroup(jid);
      if (g) return await safeReply(sock, jid, g, m);
      try {
        const meta = await groupLane.getGroupMetadata(sock, jid);
        return await safeReply(sock, jid, groupLane.groupInfoText(meta), m);
      } catch (e) {
        console.error('infogc', e?.message || e);
        return await safeReply(sock, jid, '❌ Gagal ambil info grup.', m);
      }
    }

    // ---------- LANE GRUP SISTEM (lib/systems.js) ----------
    if (cmd === 'welcome') {
      const ga = await groupLane.guardAdmin(sock, jid, sender);
      if (ga) return await safeReply(sock, jid, ga, m);
      const sub = String(args || '').trim().toLowerCase();
      if (sub === 'on') {
        systems.welcomeOn(jid);
        return await safeReply(sock, jid, '✅ Welcome ON — anggota baru otomatis disambut.', m);
      }
      if (sub === 'off') {
        systems.welcomeOff(jid);
        return await safeReply(sock, jid, '✅ Welcome OFF.', m);
      }
      return await safeReply(sock, jid, `Contoh: ${prefix}welcome on / off (saat ini: ${systems.isWelcomeOn(jid) ? 'ON' : 'OFF'})`, m);
    }
    if (cmd === 'antilink') {
      const ga = await groupLane.guardAdmin(sock, jid, sender);
      if (ga) return await safeReply(sock, jid, ga, m);
      const sub = String(args || '').trim().toLowerCase();
      if (sub === 'on') {
        systems.antilinkOn(jid);
        return await safeReply(sock, jid, '✅ Antilink ON — link invite otomatis dihapus.', m);
      }
      if (sub === 'off') {
        systems.antilinkOff(jid);
        return await safeReply(sock, jid, '✅ Antilink OFF.', m);
      }
      return await safeReply(sock, jid, `Contoh: ${prefix}antilink on / off (saat ini: ${systems.isAntilinkOn(jid) ? 'ON' : 'OFF'})`, m);
    }
    if (cmd === 'badword') {
      const ga = await groupLane.guardAdmin(sock, jid, sender);
      if (ga) return await safeReply(sock, jid, ga, m);
      const [sub, ...rest] = String(args || '').trim().split(/\s+/);
      const word = rest.join(' ').trim();
      if (sub === 'add' && word) {
        const r = systems.addBadword(word);
        return await safeReply(sock, jid, r.msg, m);
      }
      if ((sub === 'del' || sub === 'delete' || sub === 'remove') && word) {
        const r = systems.removeBadword(word);
        return await safeReply(sock, jid, r.msg, m);
      }
      if (sub === 'list' || !sub) {
        const list = systems.listBadword();
        return await safeReply(sock, jid, list.length ? `🚫 *Badword (${list.length}):*\n${list.map((w, i) => `${i + 1}. ${w}`).join('\n')}` : '🚫 Daftar badword masih kosong.', m);
      }
      return await safeReply(sock, jid, `Contoh: ${prefix}badword add <kata> / del <kata> / list`, m);
    }
    if (cmd === 'level' || cmd === 'lvl' || cmd === 'rank') {
      const lv = systems.getLevel(sender);
      return await safeReply(
        sock, jid,
        `⭐ *Level @${String(sender).split('@')[0]}*\nLevel: ${lv.level}\nXP: ${lv.xp}/${systems.requiredXp(lv.level)}`,
        m
      );
    }
    if (cmd === 'leaderboard' || cmd === 'lb' || cmd === 'top') {
      const list = systems.leaderboard(10);
      if (!list.length) return await safeReply(sock, jid, systems.leaderboardText(10), m);
      const ids = list.map((e) => String(e.id));
      await sock.sendMessage(jid, { text: systems.leaderboardText(10), mentions: ids }, { quoted: m });
      return;
    }
    if (cmd === 'limit') {
      const l = systems.getLimit(sender);
      return await safeReply(sock, jid, `⏳ *Limit harian:* ${l.remaining}/${l.max} tersisa.`, m);
    }
    if (cmd === 'dompet' || cmd === 'wallet' || cmd === 'saldo' || cmd === 'balance') {
      const bal = systems.getBalance(sender);
      return await safeReply(sock, jid, `💰 *Dompet @${String(sender).split('@')[0]}:* ${bal} koin.`, m);
    }
    if (cmd === 'transfer' || cmd === 'tf') {
      const targets = groupLane.resolveTargets(m, args);
      const nums = String(args || '').match(/\d+/g) || [];
      const amt = Number(nums[nums.length - 1]);
      if (!targets.length || !Number.isFinite(amt) || amt <= 0) {
        return await safeReply(sock, jid, `Contoh: ${prefix}transfer @user 100`, m);
      }
      const r = systems.transfer(sender, targets[0], amt);
      await sock.sendMessage(jid, { text: r.msg, mentions: [String(sender), String(targets[0])] }, { quoted: m });
      return;
    }
    if (cmd === 'mining' || cmd === 'mine' || cmd === 'nambang') {
      const r = systems.mine(sender);
      if (!r.ok) return await safeReply(sock, jid, r.msg, m);
      return await safeReply(sock, jid, `⛏️ Dapat *${r.reward}* koin! Saldo: ${r.balance}.`, m);
    }
    if (cmd === 'afk') {
      systems.setAfk(sender, args || 'AFK');
      return await safeReply(sock, jid, `💤 @${String(sender).split('@')[0]} sekarang AFK${args ? `: ${args}` : ''}.`, m);
    }

    // ---------- LANE INFO (lib/info.js) ----------
    if (cmd === 'rules') {
      return await safeReply(sock, jid, rulesText(prefix), m);
    }
    if (cmd === 'animesaran' || cmd === 'anime') {
      return await safeReply(sock, jid, animeSaranText(), m);
    }

    // ---------- LANE MEDIA (lib/media-tools.js) ----------
    if (cmd === 'toimg') {
      const quoted = getQuoted(m);
      const inner = quoted?.quotedMessage ? unwrapMessage(quoted.quotedMessage) : null;
      if (!inner?.stickerMessage) {
        return await safeReply(sock, jid, `Reply stiker + ${prefix}toimg untuk mengubahnya jadi gambar.`, m);
      }
      try {
        const buf = await downloadBuffer(wrapQuoted(jid, quoted), sock);
        const jpg = await mediaTools.toimg(buf);
        await sock.sendMessage(jid, { image: jpg, caption: '🖼️ toimg' }, { quoted: m });
      } catch (e) {
        console.error('toimg', e?.message || e);
        return await safeReply(sock, jid, '❌ Gagal mengubah stiker jadi gambar.', m);
      }
      return;
    }
    if (cmd === 'stickerwm' || cmd === 'swm' || cmd === 'wm') {
      const quoted = getQuoted(m);
      const quotedImg = quoted?.quotedMessage?.imageMessage || quoted?.quotedMessage?.stickerMessage;
      const currentImg = m.message?.imageMessage;
      if (!quotedImg && !currentImg) {
        return await safeReply(sock, jid, `Reply gambar + ${prefix}stickerwm <pack>|<author>`, m);
      }
      const [pack, author] = String(args || '').split('|').map((s) => s.trim());
      try {
        const target = quotedImg ? wrapQuoted(jid, quoted) : m;
        const buf = await downloadBuffer(target, sock);
        const signed = await mediaTools.stickerWithWM(buf, pack || 'SONEZZ', author || 'wa-ai-bot-b');
        await sock.sendMessage(jid, { sticker: signed }, { quoted: m });
      } catch (e) {
        console.error('stickerwm', e?.message || e);
        return await safeReply(sock, jid, '❌ Gagal membuat stiker watermark.', m);
      }
      return;
    }
    if (cmd === 'attp' || cmd === 'ttp') {
      if (!args) return await safeReply(sock, jid, `Contoh: ${prefix}${cmd} halo bang`, m);
      try {
        const png = cmd === 'attp' ? await mediaTools.attp(args) : await mediaTools.ttp(args);
        const webp = await mediaTools.stickerWithWM(png, cmd.toUpperCase(), 'wa-ai-bot-b');
        await sock.sendMessage(jid, { sticker: webp }, { quoted: m });
      } catch (e) {
        console.error(cmd, e?.message || e);
        return await safeReply(sock, jid, `❌ Gagal membuat ${cmd}.`, m);
      }
      return;
    }
    if (cmd === 'triggered' || cmd === 'trigger') {
      const quoted = getQuoted(m);
      const quotedImg = quoted?.quotedMessage?.imageMessage;
      const currentImg = m.message?.imageMessage;
      if (!quotedImg && !currentImg) {
        return await safeReply(sock, jid, `Reply gambar + ${prefix}triggered`, m);
      }
      await interim(sock, jid, m, '⚡ Lagi bikin TRIGGERED...');
      try {
        const target = quotedImg ? wrapQuoted(jid, quoted) : m;
        const buf = await downloadBuffer(target, sock);
        const gif = await mediaTools.triggered(buf);
        await sock.sendMessage(jid, { image: gif, caption: '⚡ TRIGGERED' }, { quoted: m });
      } catch (e) {
        console.error('triggered', e?.message || e);
        return await safeReply(sock, jid, '❌ Gagal membuat triggered.', m);
      }
      return;
    }
    if (cmd === 'emoji' || cmd === 'emojipng') {
      if (!args) return await safeReply(sock, jid, `Contoh: ${prefix}emoji 😭`, m);
      try {
        const png = await mediaTools.emojitopng(args);
        await sock.sendMessage(jid, { image: png, caption: `😀 ${args.split(/\s+/)[0]}` }, { quoted: m });
      } catch (e) {
        console.error('emoji', e?.message || e);
        return await safeReply(sock, jid, '❌ Gagal render emoji.', m);
      }
      return;
    }

    // ---------- LANE IQC (lib/iqc.js) ----------
    if (cmd === 'iqc') {
      return await handleIqc(sock, jid, m, args, { quotedText: getQuotedText(m) });
    }

    // ---------- LANE DASH (lib/dash.js — SIG/CERT via env apa adanya) ----------
    if (isDashCommand(cmd)) {
      return await handleDash(sock, jid, m, args);
    }

    // ---------- LANE DOWNLOADER (lib/downloader.js, limit 1/hari per unduhan) ----------
    if (cmd === 'play' || cmd === 'ytmp3' || cmd === 'ytmp4' || cmd === 'tiktok' || cmd === 'tiktoknowm' || cmd === 'fbdl' || cmd === 'igdl') {
      const lim = systems.useLimit(sender, 1);
      if (!lim.ok) {
        return await safeReply(sock, jid, `⏳ Limit downloader habis (${lim.max}/hari). Balik lagi besok ya.`, m);
      }
      if (cmd === 'play') return await dlLane.handlePlay(sock, jid, m, args);
      if (cmd === 'ytmp3') return await dlLane.handleYtmp3(sock, jid, m, args);
      if (cmd === 'ytmp4') return await dlLane.handleYtmp4(sock, jid, m, args);
      if (cmd === 'tiktok' || cmd === 'tiktoknowm') return await dlLane.handleTiktok(sock, jid, m, args);
      if (cmd === 'fbdl') return await dlLane.handleFbdl(sock, jid, m, args);
      if (cmd === 'igdl') return await dlLane.handleIgdl(sock, jid, m, args);
    }

    // ---------- LANE FREEINFO (lib/freeinfo.js) ----------
    if (cmd === 'jadwalsholat' || cmd === 'sholat') {
      return await freeInfo.handleSholat(sock, jid, m, args);
    }
    if (cmd === 'quran' || cmd === 'alquran') {
      return await freeInfo.handleQuran(sock, jid, m, args);
    }
    if (cmd === 'gempa' || cmd === 'infogempa') {
      return await freeInfo.handleGempa(sock, jid, m);
    }
    if (cmd === 'lirik' || cmd === 'lyrics') {
      return await freeInfo.handleLirik(sock, jid, m, args);
    }
    if (cmd === 'shortlink' || cmd === 'short' || cmd === 'shorturl') {
      return await freeInfo.handleShortlink(sock, jid, m, args);
    }
    if (cmd === 'kbbi') {
      return await freeInfo.handleKbbi(sock, jid, m, args);
    }

    // ---------- LANE FUN (lib/fun.js, murni lokal) ----------
    if (cmd === 'truth') return await safeReply(sock, jid, funLane.truth(), m);
    if (cmd === 'dare') return await safeReply(sock, jid, funLane.dare(), m);
    if (cmd === 'tarot') return await safeReply(sock, jid, funLane.tarot(), m);
    if (cmd === 'zodiak') return await safeReply(sock, jid, funLane.zodiak(args), m);
    if (cmd === 'ship') {
      let n1 = '';
      let n2 = '';
      if (String(args || '').includes('|')) {
        const ps = String(args || '').split('|').map((x) => String(x || '').trim()).filter(Boolean);
        n1 = ps[0] || '';
        n2 = ps[1] || '';
      } else {
        const ps = String(args || '').split(/\s+/).filter(Boolean);
        n1 = ps[0] || '';
        n2 = ps[1] || '';
      }
      return await safeReply(sock, jid, funLane.ship(n1, n2), m);
    }
    if (cmd === 'pantun') return await safeReply(sock, jid, funLane.pantun(), m);
    if (cmd === 'weton') return await safeReply(sock, jid, funLane.weton(args), m);
    if (cmd === 'ramal') return await safeReply(sock, jid, funLane.ramal(), m);
    if (cmd === 'keberuntungan' || cmd === 'hoki') return await safeReply(sock, jid, funLane.keberuntungan(args), m);
    if (cmd === 'mimpi') return await safeReply(sock, jid, funLane.mimpi(args), m);
    if (cmd === 'karakter') return await safeReply(sock, jid, funLane.karakter(args), m);
    if (cmd === 'pilih') return await safeReply(sock, jid, funLane.pilih(args), m);
    if (cmd === 'coinflip' || cmd === 'koin') return await safeReply(sock, jid, funLane.coinflip(), m);
    if (cmd === 'dadu') return await safeReply(sock, jid, funLane.dadu(args), m);
    if (cmd === '8ball') return await safeReply(sock, jid, funLane.eightball(args), m);
    if (cmd === 'puji') return await safeReply(sock, jid, funLane.puji(args), m);
    if (cmd === 'quotes' || cmd === 'quote') return await safeReply(sock, jid, funLane.quotes(), m);

    // ---------- LANE NULIS & SSWEB ----------
    if (cmd === 'nulis') {
      return await handleNulis(sock, jid, m, args);
    }
    if (cmd === 'ssweb' || cmd === 'screenshot') {
      const lim = systems.useLimit(sender, 1);
      if (!lim.ok) {
        return await safeReply(sock, jid, `⏳ Limit harian habis (${lim.max}/hari). Balik lagi besok ya.`, m);
      }
      return await handleSsweb(sock, jid, m, args);
    }

    // Chat pribadi: teks bebas tanpa perintah -> langsung jawab AI (ikut mode curhat bila aktif)
    if (!isGroup) {
      try {
        const prompt = buildContextPrompt(jid, withTalkFlag(jid, sender, body));
        const answer = await chatAI(prompt, undefined, undefined, sessionStyle(jid, sender) || config.STYLE);
        pushMessage(jid, 'user', body);
        pushMessage(jid, 'bot', answer);
        return await safeReply(sock, jid, answer, m);
      } catch (e) {
        console.error('freechat', e?.message || e);
        return await safeReply(
          sock, jid,
          '😢 Maaf, AI sedang sibuk. Cek GEMINI_API_KEY / GROQ_API_KEY di file .env lalu coba lagi.',
          m
        );
      }
    }
  } catch (e) {
    console.error('[handler]', e?.message || e);
  }
}

// Sambutan otomatis anggota baru (welcome on/off via lib/systems.js).
// Wiring di index.js (SATU baris, di dalam startBot setelah messages.upsert):
//   sock.ev.on('group-participants.update', (u) => { handleParticipantsUpdate(sock, u).catch(() => {}); });
async function handleParticipantsUpdate(sock, update) {
  try {
    const { id, participants, action } = update || {};
    if (!id || action !== 'add' || !systems.isWelcomeOn(id)) return;
    const arr = (Array.isArray(participants) ? participants : []).map(String).filter(Boolean);
    if (!arr.length) return;
    const text =
      `👋 *Selamat datang!*\n` +
      arr.map((p) => `@${p.split('@')[0]}`).join(' ') +
      `\nJangan lupa baca rules pakai .rules ya!`;
    await sock.sendMessage(id, { text, mentions: arr });
  } catch (e) {
    console.error('[welcome]', e?.message || e);
  }
}

module.exports = { handleMessage, menuText, handleParticipantsUpdate };
