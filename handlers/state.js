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
const { jereIqc } = require('../lib/jere-api');
const { isDashCommand, handleDash } = require('../lib/dash');
const dlLane = require('../lib/downloader');
const publicApi = require('../lib/public-api');
const freeInfo = require('../lib/freeinfo');
const funLane = require('../lib/fun');
const { handleNulis } = require('../lib/nulis');
// ---------- TOOLS LOKAL / REMOTE / MINI-GAME (lib teruji, tanpa dep baru) ----------
const toolsLocal = require('../lib/tools-local');
const toolsRemote = require('../lib/tools-remote');
const games = require('../lib/games');
const quizSessions = new Map(); // scopeKey(jid,sender) -> { jawaban, kategori, soal } (maks 100)
// ---------- LANE JERE (lib/jere-* lolos syntax, wiring di bawah, tanpa lib lain) ----------
const jereDl = require('../lib/jere-dl');
const jereAi = require('../lib/jere-ai');
const jereFun = require('../lib/jere-fun');
const jereMedia = require('../lib/jere-media');
const jereUtil = require('../lib/jere-util');
const jereQuizSessions = new Map(); // scopeKey(jid,sender) -> soal Jere { game, soal, jawabanList, ... } (maks 100)
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
      await ctx.reply('🙏 Maaf, fitur ini sedang dalam perbaikan atau belum tersedia di server ini. Silakan hubungi admin.');
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

// ---------- Helper JERE (dipindah verbatim dari dalam handleMessage; dipakai semua lane jere-*) ----------
const jereErr = (e) => {
  const msg = String((e && e.message) || 'Gagal memproses. Coba lagi ya.');
  if (/key|kuota|quota|apikey|api key|unauthor|forbidden|401|403|limit/i.test(msg) && /jere|key|kuota|quota|401|403|unauthor|forbidden/i.test(msg)) {
    return '⚠️ Fitur Jere butuh key valid (cek JERE_API_KEY / kuota habis). Coba lagi nanti ya.';
  }
  if (/tidak mengembalikan|status gagal|http 4|http 5/i.test(msg)) {
    return `❌ Layanan Jere sedang sibuk. Coba lagi nanti ya. (${msg.slice(0, 120)})`;
  }
  return `❌ ${msg.slice(0, 300)}`;
};
const jereFirstUrl = (t) => String(t || '').split(/\s+/).filter(Boolean)[0] || '';

module.exports = {
  fs,
  path,
  config,
  chatAI,
  transcribeAudio,
  pushMessage,
  buildContextPrompt,
  clearMemory,
  getMemory,
  countChats,
  imageToSticker,
  textToSticker,
  downloadBuffer,
  getQuoted,
  wrapQuoted,
  unwrapMessage,
  compressForVision,
  preprocessForOCR,
  runSandboxed,
  ddgSearch,
  googleNews,
  getWeather,
  getLocalTime,
  wikiSummary,
  extractDocText,
  ttsEdge,
  googleTTSChunk,
  groupLane,
  systems,
  rulesText,
  animeSaranText,
  mediaTools,
  handleIqc,
  jereIqc,
  isDashCommand,
  handleDash,
  dlLane,
  publicApi,
  freeInfo,
  funLane,
  handleNulis,
  toolsLocal,
  toolsRemote,
  games,
  quizSessions,
  jereDl,
  jereAi,
  jereFun,
  jereMedia,
  jereUtil,
  jereQuizSessions,
  registry,
  runPipeline,
  trySafety,
  ROUTER_PREFIXES,
  buildCommandCtx,
  tryNewRouter,
  runCooldown,
  lastBotImage,
  lastDoc,
  talkSessions,
  scopeKey,
  talkOn,
  sessionStyle,
  withTalkFlag,
  mapSetCapped,
  MAX_DOCUMENT_CHUNKS,
  chunkDocument,
  summarizeDocument,
  retrieveDocChunks,
  sendLongText,
  normalizeNum,
  isOwner,
  extractText,
  getSender,
  getDisplayName,
  getQuotedText,
  getMentionList,
  groupSenderOpts,
  botJidNormalized,
  isMentionToBot,
  safeReply,
  interim,
  sendMenuWithHeader,
  withTimeout,
  chunkText,
  aiWrap,
  OCR_SUFFIX,
  visionWrap,
  handleVN,
  jereErr,
  jereFirstUrl,
};
