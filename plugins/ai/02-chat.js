// handlers/chat.js — CHAT: ai, talk/curhat, stoptalk, vn/transcribe, new/clear/memory/model
// Diekstrak verbatim dari handlers/messages.js; tanpa perubahan perilaku.
// Dipanggil router handlers/messages.js sesuai urutan asli. Return true = tertangani.
const S = require('../../handlers/state');
const {
  config,
  chatAI,
  pushMessage,
  buildContextPrompt,
  clearMemory,
  getMemory,
  downloadBuffer,
  getQuoted,
  wrapQuoted,
  compressForVision,
  preprocessForOCR,
  talkSessions,
  scopeKey,
  sessionStyle,
  withTalkFlag,
  mapSetCapped,
  groupSenderOpts,
  safeReply,
  interim,
  OCR_SUFFIX,
  handleVN,
} = S;

async function handleChat(ctx) {
  const { sock, m, jid, isGroup, sender, body, cmd, args, prefix, start, unwrapped } = ctx;
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
          await safeReply(sock, jid, '❌ Gagal mengunduh gambar. Coba kirim ulang gambarnya.', m); return true;
        }
        const v = await compressForVision(buf, imgMsg.mimetype || 'image/jpeg');
        const p = await preprocessForOCR(v.buffer);
        const base64 = p.buffer.toString('base64');
        const mime = p.mime;
        try {
          const answer = await chatAI(question + OCR_SUFFIX, base64, mime);
          pushMessage(jid, 'user', question + ' [gambar]');
          pushMessage(jid, 'bot', answer);
          await safeReply(sock, jid, answer, m); return true;
        } catch (e) {
          console.error('ai', e?.message || e);
          await safeReply(
            sock, jid,
            '😢 Maaf, AI gambar sedang sibuk/gagal. Coba lagi sebentar ya, pastikan GEMINI_API_KEY terisi.',
            m
          ); return true;
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
          await safeReply(sock, jid, '❌ Gagal mengunduh gambar yang di-reply.', m); return true;
        }
        try {
          const v = await compressForVision(buf, quotedImg.mimetype || 'image/jpeg');
          const p = await preprocessForOCR(v.buffer);
          const answer = await chatAI(args + OCR_SUFFIX, p.buffer.toString('base64'), p.mime);
          pushMessage(jid, 'user', args + ' [gambar reply]');
          pushMessage(jid, 'bot', answer);
          await safeReply(sock, jid, answer, m); return true;
        } catch (e) {
          console.error('ai', e?.message || e);
          await safeReply(sock, jid, '😢 Maaf, AI gambar sedang sibuk/gagal. Coba lagi sebentar ya.', m); return true;
        }
      }

      // Kasus 3: chat teks biasa (dengan memory; ikut mode curhat bila aktif)
      if (!args) {
        await safeReply(sock, jid, `Contoh: ${prefix}ai Halo, apa kabar?`, m); return true;
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
          await safeReply(sock, jid, answer, m); return true;
        }
        const prompt = buildContextPrompt(jid, withTalkFlag(jid, sender, args));
        const answer = await chatAI(prompt, undefined, undefined, sessionStyle(jid, sender) || config.STYLE);
        pushMessage(jid, 'user', args);
        pushMessage(jid, 'bot', answer);
        await safeReply(sock, jid, answer, m); return true;
      } catch (e) {
        console.error('ai', e?.message || e);
        await safeReply(
          sock, jid,
          '😢 Maaf, AI sedang sibuk. Cek GEMINI_API_KEY / GROQ_API_KEY di file .env lalu coba lagi.',
          m
        ); return true;
      }
    }

    // ---------- .talk (masuk SESI curhat) / .stoptalk (keluar sesi) ----------
    if (cmd === 'talk' || cmd === 'curhat') {
      mapSetCapped(talkSessions, scopeKey(jid, sender), true);
      if (!args) {
        pushMessage(jid, 'user', '.talk (masuk mode curhat)');
        pushMessage(jid, 'bot', '[masuk mode curhat]');
        await safeReply(
          sock, jid,
          `bolehh sini cerita pelan-pelan yaa, aku bakal dengerin kok \n\n_(mode curhat aktif - sampai kamu ketik ${prefix}stoptalk)_`,
          m
        ); return true;
      }
      try {
        const prompt = buildContextPrompt(jid, withTalkFlag(jid, sender, args));
        const answer = await chatAI(prompt, undefined, undefined, config.TALK_STYLE);
        pushMessage(jid, 'user', args);
        pushMessage(jid, 'bot', answer);
        await safeReply(sock, jid, `${answer}\n\n_(mode curhat aktif sampai ${prefix}stoptalk)_`, m); return true;
      } catch (e) {
        console.error('talk', e?.message || e);
        await safeReply(sock, jid, '😢 Maaf, AI sedang sibuk. Coba lagi sebentar ya.', m); return true;
      }
    }
    if (cmd === 'stoptalk' || cmd === 'stopcurhat') {
      talkSessions.delete(scopeKey(jid, sender));
      pushMessage(jid, 'user', '.stoptalk (keluar mode curhat)');
      pushMessage(jid, 'bot', '[keluar mode curhat]');
      await safeReply(
        sock, jid,
        'okeyy, mode curhatnya aku matiin ya. makasih udah mau ceritaa, kamu hebat kok udah berani ngomongin inii.. \n\nmau lanjut ngobrol biasa atau tanya-tanya, gas ajaa!',
        m
      ); return true;
    }

    // ---------- .vn / .transcribe (transkrip voice note) ----------
    if (cmd === 'vn' || cmd === 'transkrip' || cmd === 'transcribe') {
      const quoted = getQuoted(m);
      const quotedAudio = quoted?.quotedMessage?.audioMessage;
      const currentAudio = m.message?.audioMessage;

      const target = quotedAudio ? wrapQuoted(jid, quoted) : currentAudio ? m : null;
      if (!target) {
        await safeReply(sock, jid, `Reply VN dengan ${prefix}vn, atau kirim VN dengan caption ${prefix}vn`, m); return true;
      }
      await handleVN(sock, jid, m, target, quotedAudio || currentAudio); return true;
    }

    // ---------- 1. CHAT: new / clear / memory / model ----------
    if (cmd === 'new') {
      clearMemory(jid);
      talkSessions.delete(scopeKey(jid, sender));
      await safeReply(sock, jid, '✨ Oke, kita mulai baru! Ingatanku sudah kuhapus. Mau tanya apa?', m); return true;
    }
    if (cmd === 'clear') {
      clearMemory(jid);
      talkSessions.delete(scopeKey(jid, sender));
      await safeReply(sock, jid, '🧹 Ingatan chat dihapus. Sampai jumpa lagi!', m); return true;
    }
    if (cmd === 'memory') {
      const hist = getMemory(jid);
      if (hist.length === 0) {
        await safeReply(sock, jid, '🧠 Belum ada pesan tersimpan. Ngobrol dulu yuk pakai .ai!', m); return true;
      }
      const last3 = hist
        .slice(-3)
        .map((h) => `• [${h.role}] ${String(h.content).slice(0, 120)}`)
        .join('\n');
      await safeReply(
        sock, jid,
        `🧠 *Memory:* ${hist.length} pesan tersimpan.\n\n${last3}`,
        m
      ); return true;
    }
    if (cmd === 'model') {
      await safeReply(
        sock, jid,
        `🧩 *Model aktif:*\n• Gemini: ${config.GEMINI_MODEL}\n• Groq: ${config.GROQ_CHAT_MODEL}`,
        m
      ); return true;
    }

  return false;
}

module.exports = { handleChat };
