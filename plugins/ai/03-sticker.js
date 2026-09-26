// handlers/sticker.js â€” STICKER & MEDIA + VISION + CREATIVE-media: img, stiker, ocr/describe/analyze, toimg, stickerwm, attp/ttp, triggered, emoji, iqc, nulis
// Diekstrak verbatim dari handlers/messages.js; tanpa perubahan perilaku.
// Dipanggil router handlers/messages.js sesuai urutan asli. Return true = tertangani.
const S = require('../../handlers/state');
const {
  pushMessage,
  imageToSticker,
  textToSticker,
  downloadBuffer,
  getQuoted,
  wrapQuoted,
  unwrapMessage,
  mediaTools,
  handleIqc,
  jereIqc,
  handleNulis,
  toolsRemote,
  lastBotImage,
  scopeKey,
  mapSetCapped,
  getQuotedText,
  safeReply,
  interim,
  visionWrap,
} = S;

async function handleSticker(ctx) {
  const { sock, m, jid, isGroup, sender, body, cmd, args, prefix, start, unwrapped } = ctx;
    // ---------- .img ----------
    if (cmd === 'img' || cmd === 'image' || cmd === 'gambar') {
      if (!args) {
        await safeReply(sock, jid, `Contoh: ${prefix}img kucing astronot di bulan, ultra detail`, m); return true;
      }
      await interim(sock, jid, m, 'ðŸŽ¨ Lagi digambar...');
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
          { image: buf, caption: `ðŸŽ¨ *${args}*` },
          { quoted: m }
        );
      } catch (e) {
        console.error('img', e?.message || e);
        await safeReply(sock, jid, 'âŒ Gagal membuat gambar setelah 2x coba. Coba prompt lain / ulangi sebentar lagi ya.', m); return true;
      }
      return true;
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
          await safeReply(sock, jid, 'âŒ Gagal membuat stiker dari gambar. Coba gambar lain.', m);
        }
        return true;
      }

      // B. Teks -> stiker (.stiker <teks>)
      if (args) {
        try {
          const webp = await textToSticker(args);
          await sock.sendMessage(jid, { sticker: webp }, { quoted: m });
        } catch (e) {
          console.error('stiker', e?.message || e);
          await safeReply(sock, jid, 'âŒ Gagal membuat stiker teks.', m);
        }
        return true;
      }

      // C. Berurutan: .img lalu .stiker (pakai gambar terakhir pengirim di chat ini)
      const prevImg = lastBotImage.get(scopeKey(jid, sender));
      if (prevImg) {
        try {
          const webp = await imageToSticker(prevImg);
          await sock.sendMessage(jid, { sticker: webp }, { quoted: m });
        } catch (e) {
          console.error('stiker', e?.message || e);
          await safeReply(sock, jid, 'âŒ Gagal membuat stiker dari gambar terakhir.', m);
        }
        return true;
      }

      await safeReply(
        sock, jid,
        `Cara pakai:\nâ€¢ reply gambar + ${prefix}stiker\nâ€¢ ${prefix}stiker <teks>\nâ€¢ ${prefix}img <prompt> lalu ${prefix}stiker`,
        m
      ); return true;
    }

    // ---------- 5. VISION (reply gambar) ----------
    // .ocr via API remote (lib/tools-remote.js). AI vision tetap via .describe/.analyze/.ai.
    if (cmd === 'ocr') {
      try {
        const quoted = getQuoted(m);
        const quotedImg = quoted?.quotedMessage?.imageMessage;
        const currentImg = m.message?.imageMessage;
        if (!quotedImg && !currentImg) {
          await safeReply(sock, jid, `Reply gambar + ${prefix}ocr untuk membaca teks di gambar.`, m); return true;
        }
        await interim(sock, jid, m, 'ðŸ“ Lagi membaca teks di gambar...');
        const target = quotedImg ? wrapQuoted(jid, quoted) : m;
        const buf = await downloadBuffer(target, sock);
        const text = await toolsRemote.ocrImage(buf);
        await safeReply(sock, jid, `ðŸ“ *Hasil OCR:*\n${text}`, m); return true;
      } catch (e) {
        console.error('ocr', e?.message || e);
        await safeReply(sock, jid, 'âŒ OCR gagal. Coba gambar lain yang tulisannya jelas ya.', m); return true;
      }
    }
    if (cmd === 'describe' || cmd === 'deskripsi') {
      await visionWrap(sock, jid, m, 'Deskripsikan gambar ini secara detail: objek, warna, suasana, dan hal menarik lainnya.', `Reply gambar + ${prefix}describe untuk mendeskripsikan gambar.`, 'describe'); return true;
    }
    if (cmd === 'analyze' || cmd === 'analisis') {
      await visionWrap(sock, jid, m, 'Analisis gambar ini secara mendalam: isi, konteks, makna, dan hal penting yang perlu diketahui.', `Reply gambar + ${prefix}analyze untuk menganalisis gambar.`, 'analyze'); return true;
    }

    // ---------- LANE MEDIA (lib/media-tools.js) ----------
    if (cmd === 'toimg') {
      const quoted = getQuoted(m);
      const inner = quoted?.quotedMessage ? unwrapMessage(quoted.quotedMessage) : null;
      if (!inner?.stickerMessage) {
        await safeReply(sock, jid, `Reply stiker + ${prefix}toimg untuk mengubahnya jadi gambar.`, m); return true;
      }
      try {
        const buf = await downloadBuffer(wrapQuoted(jid, quoted), sock);
        const jpg = await mediaTools.toimg(buf);
        await sock.sendMessage(jid, { image: jpg, caption: 'ðŸ–¼ï¸ toimg' }, { quoted: m });
      } catch (e) {
        console.error('toimg', e?.message || e);
        await safeReply(sock, jid, 'âŒ Gagal mengubah stiker jadi gambar.', m); return true;
      }
      return true;
    }
    if (cmd === 'stickerwm' || cmd === 'swm' || cmd === 'wm') {
      const quoted = getQuoted(m);
      const quotedImg = quoted?.quotedMessage?.imageMessage || quoted?.quotedMessage?.stickerMessage;
      const currentImg = m.message?.imageMessage;
      if (!quotedImg && !currentImg) {
        await safeReply(sock, jid, `Reply gambar + ${prefix}stickerwm <pack>|<author>`, m); return true;
      }
      const [pack, author] = String(args || '').split('|').map((s) => s.trim());
      try {
        const target = quotedImg ? wrapQuoted(jid, quoted) : m;
        const buf = await downloadBuffer(target, sock);
        const signed = await mediaTools.stickerWithWM(buf, pack || 'SONEZZ', author || 'wa-ai-bot-b');
        await sock.sendMessage(jid, { sticker: signed }, { quoted: m });
      } catch (e) {
        console.error('stickerwm', e?.message || e);
        await safeReply(sock, jid, 'âŒ Gagal membuat stiker watermark.', m); return true;
      }
      return true;
    }
    if (cmd === 'attp' || cmd === 'ttp') {
      if (!args) { await safeReply(sock, jid, `Contoh: ${prefix}${cmd} halo bang`, m); return true; }
      try {
        const png = cmd === 'attp' ? await mediaTools.attp(args) : await mediaTools.ttp(args);
        const webp = await mediaTools.stickerWithWM(png, cmd.toUpperCase(), 'wa-ai-bot-b');
        await sock.sendMessage(jid, { sticker: webp }, { quoted: m });
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, `âŒ Gagal membuat ${cmd}.`, m); return true;
      }
      return true;
    }
    if (cmd === 'triggered' || cmd === 'trigger') {
      const quoted = getQuoted(m);
      const quotedImg = quoted?.quotedMessage?.imageMessage;
      const currentImg = m.message?.imageMessage;
      if (!quotedImg && !currentImg) {
        await safeReply(sock, jid, `Reply gambar + ${prefix}triggered`, m); return true;
      }
      await interim(sock, jid, m, 'âš¡ Lagi bikin TRIGGERED...');
      try {
        const target = quotedImg ? wrapQuoted(jid, quoted) : m;
        const buf = await downloadBuffer(target, sock);
        const gif = await mediaTools.triggered(buf);
        await sock.sendMessage(jid, { image: gif, caption: 'âš¡ TRIGGERED' }, { quoted: m });
      } catch (e) {
        console.error('triggered', e?.message || e);
        await safeReply(sock, jid, 'âŒ Gagal membuat triggered.', m); return true;
      }
      return true;
    }
    if (cmd === 'emoji' || cmd === 'emojipng') {
      if (!args) { await safeReply(sock, jid, `Contoh: ${prefix}emoji ðŸ˜­`, m); return true; }
      try {
        const png = await mediaTools.emojitopng(args);
        await sock.sendMessage(jid, { image: png, caption: `ðŸ˜€ ${args.split(/\s+/)[0]}` }, { quoted: m });
      } catch (e) {
        console.error('emoji', e?.message || e);
        await safeReply(sock, jid, 'âŒ Gagal render emoji.', m); return true;
      }
      return true;
    }

    // ---------- LANE IQC LOKAL (lib/iqc.js, render offline) ----------
    if (cmd === 'iqclocal') {
      await handleIqc(sock, jid, m, args, { quotedText: getQuotedText(m) }); return true;
    }

    // ---------- LANE IQC ONLINE (lib/jere-api.js -> Jere API tema online) ----------
    if (cmd === 'iqc' || cmd === 'iphone-qc') {
      const input = String(args || '').trim() || getQuotedText(m);
      if (!input) {
        await safeReply(sock, jid, `Contoh: ${prefix}iqc halo|light (tema: light/dark, bisa juga reply pesan + ${prefix}iqc)`, m); return true;
      }
      await interim(sock, jid, m, 'ðŸ“± Lagi bikin iqc online...');
      try {
        const buf = await jereIqc(input);
        const label = String(input).split('|')[0].trim() || input;
        await sock.sendMessage(jid, { image: buf, caption: `ðŸ“± *${label}*` }, { quoted: m });
      } catch (e) {
        console.error('iqc', e?.message || e);
        await safeReply(sock, jid, `âŒ ${e?.message || 'Gagal membuat IQC online.'} Coba lagi atau pakai ${prefix}iqclocal.`, m); return true;
      }
      return true;
    }

    // ---------- LANE NULIS ----------
    if (cmd === 'nulis') {
      await handleNulis(sock, jid, m, args); return true;
    }

  return false;
}

module.exports = { handleSticker };
