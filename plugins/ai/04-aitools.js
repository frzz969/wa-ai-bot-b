// handlers/aitools.js — AI TOOLS + CODE + CREATIVE-teks + VOICE tts + UTIL calc/convert/qr
// Diekstrak verbatim dari handlers/messages.js; tanpa perubahan perilaku.
// Dipanggil router handlers/messages.js sesuai urutan asli. Return true = tertangani.
const S = require('../../handlers/state');
const {
  chatAI,
  pushMessage,
  buildContextPrompt,
  textToSticker,
  ttsEdge,
  googleTTSChunk,
  toolsLocal,
  lastDoc,
  scopeKey,
  MAX_DOCUMENT_CHUNKS,
  chunkDocument,
  summarizeDocument,
  retrieveDocChunks,
  sendLongText,
  safeReply,
  interim,
  chunkText,
  aiWrap,
} = S;

async function handleAitools(ctx) {
  const { sock, m, jid, isGroup, sender, body, cmd, args, prefix, start, unwrapped } = ctx;
    // ---------- 2. AI TOOLS ----------
    if (cmd === 'ask') {
      if (!args) {
        await safeReply(sock, jid, `Contoh: ${prefix}ask Apa itu fotosintesis?`, m); return true;
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
          await safeReply(sock, jid, answer, m); return true;
        }
        const prompt = buildContextPrompt(jid, args);
        const answer = await chatAI(prompt);
        pushMessage(jid, 'user', args);
        pushMessage(jid, 'bot', answer);
        await safeReply(sock, jid, answer, m); return true;
      } catch (e) {
        console.error('ask', e?.message || e);
        await safeReply(sock, jid, '😢 Maaf, AI sedang sibuk. Coba lagi sebentar ya.', m); return true;
      }
    }
    if (cmd === 'explain') {
      await aiWrap(sock, jid, m, args, 'Jelaskan secara sederhana dan mudah dipahami: ', `Contoh: ${prefix}explain gravitasi`, 'explain'); return true;
    }
    if (cmd === 'summarize' || cmd === 'ringkas') {
      if (args) {
        await aiWrap(sock, jid, m, args, 'Ringkas teks berikut secara singkat dan jelas: ', '', 'summarize'); return true;
      }
      const doc = lastDoc.get(scopeKey(jid, sender));
      if (doc) {
        if (chunkDocument(doc.text).length > MAX_DOCUMENT_CHUNKS) {
          await safeReply(sock, jid, `📄 Dokumennya terlalu panjang untuk diringkas sekaligus (melebihi ${MAX_DOCUMENT_CHUNKS} bagian). Coba kirim file yang lebih pendek / bagi menjadi beberapa file ya.`, m); return true;
        }
        await interim(sock, jid, m, '📝 Lagi membaca dan menyusun ringkasan lengkap...');
        try {
          const summary = await summarizeDocument(doc.text, doc.name);
          pushMessage(jid, 'user', `[summarize: ${doc.name}]`);
          pushMessage(jid, 'bot', summary);
          await sendLongText(sock, jid, `📝 *Ringkasan ${doc.name}:*\n${summary}`, m); return true;
        } catch (e) {
          if (e && e.code === 'TOO_LONG') {
            await safeReply(sock, jid, `📄 Dokumennya terlalu panjang untuk diringkas sekaligus (melebihi ${MAX_DOCUMENT_CHUNKS} bagian). Coba kirim file yang lebih pendek / bagi menjadi beberapa file ya.`, m); return true;
          }
          console.error('summarize', e?.message || e);
          await safeReply(sock, jid, '😢 Maaf, AI sedang sibuk. Coba lagi sebentar ya.', m); return true;
        }
      }
      await safeReply(sock, jid, `Contoh: ${prefix}summarize <teks panjang> — atau kirim dokumen dulu lalu ${prefix}summarize`, m); return true;
    }
    if (cmd === 'rewrite') {
      await aiWrap(sock, jid, m, args, 'Tulis ulang teks berikut dengan gaya yang berbeda tapi makna tetap sama: ', `Contoh: ${prefix}rewrite <teks>`, 'rewrite'); return true;
    }
    if (cmd === 'translate') {
      await aiWrap(sock, jid, m, args, 'Terjemahkan ke Bahasa Indonesia, jika teks sudah Bahasa Indonesia terjemahkan ke Bahasa Inggris: ', `Contoh: ${prefix}translate good morning`, 'translate'); return true;
    }
    if (cmd === 'ideas' || cmd === 'ide') {
      await aiWrap(sock, jid, m, args, 'Beri 7 ide kreatif tentang: ', `Contoh: ${prefix}ideas usaha kopi modal kecil`, 'ideas'); return true;
    }

    // ---------- 4. CODE ----------
    if (cmd === 'code') {
      await aiWrap(sock, jid, m, args, 'Buatkan kode yang rapi beserta penjelasan singkat. Permintaan: ', `Contoh: ${prefix}code fungsi fibonacci python`, 'code'); return true;
    }
    if (cmd === 'debug') {
      await aiWrap(sock, jid, m, args, 'Analisa error pada kode berikut, jelaskan penyebabnya dan solusinya: ', `Contoh: ${prefix}debug <tempel kode + pesan error>`, 'debug'); return true;
    }
    if (cmd === 'fix') {
      await aiWrap(sock, jid, m, args, 'Perbaiki kode berikut agar berjalan benar, tampilkan kode hasil perbaikan + penjelasan singkat perubahannya: ', `Contoh: ${prefix}fix <tempel kode>`, 'fix'); return true;
    }

    // ---------- 6. CREATIVE ----------
    if (cmd === 'caption') {
      await aiWrap(sock, jid, m, args, 'Buatkan 3 pilihan caption media sosial yang catchy lengkap dengan hashtag untuk topik: ', `Contoh: ${prefix}caption liburan ke pantai`, 'caption'); return true;
    }
    if (cmd === 'story' || cmd === 'cerita') {
      await aiWrap(sock, jid, m, args, 'Buatkan cerita pendek yang menarik tentang: ', `Contoh: ${prefix}story robot penjaga hutan`, 'story'); return true;
    }
    if (cmd === 'prompt') {
      await aiWrap(sock, jid, m, args, 'Buatkan prompt gambar AI yang sangat detail (gaya, objek, lighting, komposisi) untuk ide: ', `Contoh: ${prefix}prompt istana di awan saat senja`, 'prompt'); return true;
    }

    // ---------- .brat (stiker teks ala brat, render lokal) ----------
    if (cmd === 'brat') {
      if (!args) {
        await safeReply(sock, jid, `Contoh: ${prefix}brat i don't know what to say`, m); return true;
      }
      try {
        const webp = await textToSticker(args);
        pushMessage(jid, 'user', '.brat ' + args);
        pushMessage(jid, 'bot', '[mengirim stiker brat]');
        await sock.sendMessage(jid, { sticker: webp }, { quoted: m });
      } catch (e) {
        console.error('brat', e?.message || e);
        await safeReply(sock, jid, '❌ Gagal membuat stiker brat. Coba teks lain ya.', m); return true;
      }
      return true;
    }

    // ---------- 7. VOICE: tts (chunk ≤200 char, kirim berurutan) ----------
    if (cmd === 'tts') {
      if (!args) {
        await safeReply(sock, jid, `Contoh: ${prefix}tts Halo, selamat pagi semuanya`, m); return true;
      }
      if (args.length > 300) {
        await safeReply(sock, jid, '❌ Teks terlalu panjang (max 300 karakter). Pendekkan dulu ya.', m); return true;
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
        await safeReply(sock, jid, '🙏 Maaf, fitur TTS sedang gagal diproses. Silakan coba lagi beberapa saat lagi. Fitur ini sedang dalam perbaikan. Hubungi admin jika masih gagal.', m); return true;
      }
      return true;
    }

    // ---------- 9. UTILITIES ----------
    // .calc via lib/tools-local.js (eval tersanitasi + dukung sin/cos/×÷π^).
    if (cmd === 'calc' || cmd === 'hitung') {
      try {
        if (!args) {
          await safeReply(sock, jid, `Contoh: ${prefix}calc 12*8+5`, m); return true;
        }
        await safeReply(sock, jid, toolsLocal.handleCalc(args), m); return true;
      } catch (e) {
        console.error('calc', e?.message || e);
        await safeReply(sock, jid, '❌ Rumus tidak valid. Contoh: .calc (12+8)*2', m); return true;
      }
    }
    if (cmd === 'convert' || cmd === 'konversi') {
      await aiWrap(sock, jid, m, args, 'Jawab konversi berikut dengan tepat (satuan, mata uang pakai kurs umum, jelaskan singkat cara hitungnya): ', `Contoh: ${prefix}convert 100 USD ke rupiah`, 'convert'); return true;
    }
    if (cmd === 'qr') {
      if (!args) {
        await safeReply(sock, jid, `Contoh: ${prefix}qr https://google.com`, m); return true;
      }
      if (args.length > 500) {
        await safeReply(sock, jid, '❌ Teks terlalu panjang (max 500 karakter).', m); return true;
      }
      try {
        const QRCode = require('qrcode');
        const buf = await QRCode.toBuffer(args, { type: 'png', width: 512, margin: 1 });
        await sock.sendMessage(jid, { image: buf, caption: `🔳 QR: ${args}` }, { quoted: m });
      } catch (e) {
        console.error('qr', e?.message || e);
        await safeReply(sock, jid, '❌ Gagal membuat QR. Coba teks lain ya.', m); return true;
      }
      return true;
    }

  return false;
}

module.exports = { handleAitools };
