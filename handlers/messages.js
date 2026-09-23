// handlers/messages.js — router semua perintah bot
const config = require('../config');
const { chatAI, transcribeAudio } = require('../lib/ai');
const { pushMessage, buildContextPrompt, clearMemory, getMemory, countChats } = require('../lib/memory');
const { imageToSticker, textToSticker } = require('../lib/sticker');
const { downloadBuffer, getQuoted, wrapQuoted, unwrapMessage, compressForVision, preprocessForOCR } = require('../lib/media');
const { runSandboxed } = require('../lib/sandbox');
const { ddgSearch, googleNews, getWeather, getLocalTime, wikiSummary } = require('../lib/tools');
const { extractDocText } = require('../lib/files');
const { ttsEdge, googleTTSChunk } = require('../lib/tts');

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

function menuText(prefix) {
  return (
    `🤖 *SONEZZ AI ASSISTANT*\n` +
    `Asisten WhatsApp serba bisa — chat, tools, web, kode, file, voice, dan lainnya.\n\n` +

    `*💬 CHAT*\n` +
    `${prefix}ai <teks> — tanya AI (mengingat 10 pesan)\n` +
    `${prefix}talk [teks] — mode curhat dengan gaya lembut\n` +
    `${prefix}stoptalk — keluar dari mode curhat\n` +
    `${prefix}new — mulai chat baru + sapaan\n` +
    `${prefix}clear — hapus ingatan\n` +
    `${prefix}memory — lihat ingatan\n` +
    `${prefix}model — lihat model aktif\n\n` +

    `*🧠 AI TOOLS*\n` +
    `${prefix}ask <tanya> — tanya apa saja\n` +
    `${prefix}explain <topik> — jelaskan dengan sederhana\n` +
    `${prefix}summarize <teks> — ringkas teks\n` +
    `${prefix}rewrite <teks> — tulis ulang dengan gaya berbeda\n` +
    `${prefix}translate <teks> — terjemahkan ID ⇄ EN\n` +
    `${prefix}ideas <topik> — buat 7 ide\n\n` +

    `*🌐 WEB & INFO*\n` +
    `${prefix}search <q> — cari informasi di web\n` +
    `${prefix}news <topik> — cari berita terbaru\n` +
    `${prefix}weather <kota> — cek cuaca\n` +
    `${prefix}time <kota> — cek waktu lokal\n\n` +

    `*💻 CODE*\n` +
    `${prefix}code <minta> — buatkan kode\n` +
    `${prefix}debug <kode+error> — analisis error\n` +
    `${prefix}fix <kode> — perbaiki kode\n\n` +

    `*👁️ VISION* (reply gambar)\n` +
    `${prefix}ocr — baca teks dari gambar\n` +
    `${prefix}describe — deskripsikan gambar\n` +
    `${prefix}analyze — analisis gambar secara mendalam\n` +
    `kirim gambar + caption ${prefix}ai <tanya> juga bisa\n\n` +

    `*🎨 CREATIVE*\n` +
    `${prefix}img / ${prefix}image <prompt> — buat gambar\n` +
    `${prefix}brat <teks> — buat stiker teks ala brat\n` +
    `${prefix}caption <topik> — buat caption medsos\n` +
    `${prefix}story <tema> — buat cerita pendek\n` +
    `${prefix}prompt <ide> — buat prompt gambar detail\n\n` +

    `*🎙️ VOICE*\n` +
    `reply VN + ${prefix}vn / ${prefix}transcribe — transkrip suara\n` +
    `kirim VN polos (private) — otomatis ditranskrip + dijawab\n` +
    `${prefix}tts <teks> — ubah teks jadi suara (max 300)\n\n` +

    `*📁 FILE*\n` +
    `kirim PDF/DOCX/TXT (max 5MB) — otomatis diringkas\n` +
    `${prefix}summarize (tanpa teks) — ringkas dokumen terakhir\n\n` +

    `*🛠️ UTILITIES*\n` +
    `${prefix}calc <rumus> — hitung cepat\n` +
    `${prefix}convert <tanya> — konversi satuan/mata uang\n` +
    `${prefix}qr <teks> — buat QR dari teks\n` +
    `${prefix}ping — cek respon bot\n\n` +

    `*🤖 BOT*\n` +
    `${prefix}menu / ${prefix}help — tampilkan menu ini\n` +
    `${prefix}about — info tentang bot\n` +
    `${prefix}status — cek status bot\n` +
    `${prefix}run <kode> — eksekusi JS (owner only)\n\n` +

    `*🎭 STIKER*\n` +
    `reply gambar + ${prefix}stiker — gambar jadi stiker\n` +
    `${prefix}stiker <teks> — teks jadi stiker\n\n` +

    `_Private: chat bebas tanpa prefix. Grup: pakai "${prefix}" atau mention bot._`
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
      return await safeReply(sock, jid, menuText(prefix), m);
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
      return await safeReply(
        sock, jid,
        `🤖 *AI Assistant (wa-ai-bot-b)*\n` +
        `Asisten WhatsApp serba bisa: chat AI, gambar, stiker, transkrip VN, baca dokumen, info cuaca/berita, dan banyak lagi.\n\n` +
        `🧩 Model: ${config.GEMINI_MODEL} + ${config.GROQ_CHAT_MODEL}\n` +
        `💸 Fitur web & lokal gratis — AI butuh GEMINI/GROQ_API_KEY di .env.\n` +
        `Ketik ${prefix}menu untuk daftar lengkap.`,
        m
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

module.exports = { handleMessage, menuText };
