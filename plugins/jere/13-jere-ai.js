// handlers/jere-ai.js — JERE-AI
// Diekstrak verbatim dari handlers/messages.js; tanpa perubahan perilaku.
// Dipanggil router handlers/messages.js sesuai urutan asli. Return true = tertangani.
const S = require('../../handlers/state');
const {
  downloadBuffer,
  getQuoted,
  wrapQuoted,
  unwrapMessage,
  jereAi,
  sendLongText,
  safeReply,
  interim,
  jereErr,
} = S;

async function handleJereAi(ctx) {
  const { sock, m, jid, isGroup, sender, body, cmd, args, prefix, start, unwrapped } = ctx;
    // ===== JERE-AI (10 fungsi; media via Buffer, teks via reply) =====
    if (cmd === 'jtxt2img' || cmd === 'jimg') {
      if (!args) { await safeReply(sock, jid, `Contoh: ${prefix}jtxt2img kucing astronot di bulan`, m); return true; }
      await interim(sock, jid, m, '🎨 Lagi generate gambar (Jere)...');
      try {
        const buf = await jereAi.txt2img(args);
        await sock.sendMessage(jid, { image: buf, caption: `🎨 ${args.slice(0, 200)}` }, { quoted: m });
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
      return true;
    }
    if (cmd === 'jtxt2vid' || cmd === 'jvideo') {
      if (!args) { await safeReply(sock, jid, `Contoh: ${prefix}jtxt2vid sunset di neo tokyo`, m); return true; }
      await interim(sock, jid, m, '🎬 Lagi generate video (Jere, bisa 1-3 menit)...');
      try {
        const buf = await jereAi.txt2video(args);
        await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption: `🎬 ${args.slice(0, 200)}` }, { quoted: m });
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
      return true;
    }
    if (cmd === 'jsora') {
      if (!args) { await safeReply(sock, jid, `Contoh: ${prefix}jsora drone di atas hutan purba`, m); return true; }
      await interim(sock, jid, m, '🎬 Lagi generate video Sora (Jere, bisa lama)...');
      try {
        const buf = await jereAi.sora(args);
        await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption: `🎬 ${args.slice(0, 200)}` }, { quoted: m });
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
      return true;
    }
    if (cmd === 'jsuno' || cmd === 'jlagu') {
      if (!args) { await safeReply(sock, jid, `Contoh: ${prefix}jsuno lagu pop ceria tentang kopi pagi\nFormat opsional: ${prefix}jsuno <prompt> | <judul> | <style>`, m); return true; }
      await interim(sock, jid, m, '🎵 Lagi bikin lagu (Jere, bisa 2-4 menit)...');
      try {
        const parts = String(args).split('|').map((x) => String(x || '').trim()).filter(Boolean);
        const prompt = parts[0] || args;
        const opts = {};
        if (parts[1]) opts.title = parts[1].slice(0, 80);
        if (parts[2]) opts.style = parts[2].slice(0, 40);
        const buf = await jereAi.suno(prompt, opts);
        await sock.sendMessage(jid, { audio: buf, mimetype: 'audio/mpeg', ptt: false }, { quoted: m });
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
      return true;
    }
    if (cmd === 'jchat') {
      if (!args) { await safeReply(sock, jid, `Contoh: ${prefix}jchat halo, siapa kamu?`, m); return true; }
      await interim(sock, jid, m, '💬 Lagi mikir (Jere)...');
      try {
        const out = await jereAi.chatAlt(args);
        await sendLongText(sock, jid, String(out).slice(0, 3500), m); return true;
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
    }
    if (cmd === 'jimg2vid') {
      const quoted = getQuoted(m);
      const quotedImg = quoted?.quotedMessage?.imageMessage;
      const currentImg = m.message?.imageMessage;
      if (!quotedImg && !currentImg) { await safeReply(sock, jid, `Reply gambar + ${prefix}jimg2vid [prompt animasi]`, m); return true; }
      await interim(sock, jid, m, '🎬 Lagi animasikan gambar (Jere, bisa lama)...');
      try {
        const target = quotedImg ? wrapQuoted(jid, quoted) : m;
        const buf = await downloadBuffer(target, sock);
        const out = await jereAi.img2video(buf, args || '');
        await sock.sendMessage(jid, { video: out, mimetype: 'video/mp4', caption: '🎬 img2video (Jere)' }, { quoted: m });
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
      return true;
    }
    if (cmd === 'jupscale' || cmd === 'jhd') {
      const quoted = getQuoted(m);
      const quotedImg = quoted?.quotedMessage?.imageMessage;
      const currentImg = m.message?.imageMessage;
      if (!quotedImg && !currentImg) { await safeReply(sock, jid, `Reply gambar + ${prefix}jupscale untuk HD-kan (Jere).`, m); return true; }
      await interim(sock, jid, m, '✨ Lagi upscale gambar (Jere)...');
      try {
        const target = quotedImg ? wrapQuoted(jid, quoted) : m;
        const buf = await downloadBuffer(target, sock);
        const out = await jereAi.upscale(buf);
        await sock.sendMessage(jid, { image: out, caption: '✨ upscale (Jere)' }, { quoted: m });
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
      return true;
    }
    if (cmd === 'jtoanime') {
      const quoted = getQuoted(m);
      const quotedImg = quoted?.quotedMessage?.imageMessage;
      const currentImg = m.message?.imageMessage;
      if (!quotedImg && !currentImg) { await safeReply(sock, jid, `Reply gambar + ${prefix}jtoanime [style] untuk ubah jadi anime.`, m); return true; }
      await interim(sock, jid, m, '🎨 Lagi ubah jadi anime (Jere)...');
      try {
        const target = quotedImg ? wrapQuoted(jid, quoted) : m;
        const buf = await downloadBuffer(target, sock);
        const out = await jereAi.toanime(buf, args || 'Japanese Anime');
        await sock.sendMessage(jid, { image: out, caption: '🎨 toanime (Jere)' }, { quoted: m });
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
      return true;
    }
    if (cmd === 'jclone') {
      const quoted = getQuoted(m);
      const qInner = quoted?.quotedMessage ? unwrapMessage(quoted.quotedMessage) : null;
      const qAudio = qInner?.audioMessage;
      const cAudio = unwrapped?.audioMessage;
      if ((!qAudio && !cAudio) || !args) { await safeReply(sock, jid, `Reply VN/audio + ${prefix}jclone <teks> untuk tiru suara.`, m); return true; }
      await interim(sock, jid, m, '🎙️ Lagi clone suara (Jere)...');
      try {
        const target = qAudio ? wrapQuoted(jid, quoted) : m;
        const buf = await downloadBuffer(target, sock);
        const out = await jereAi.voiceclone(buf, args);
        await sock.sendMessage(jid, { audio: out, mimetype: 'audio/mpeg', ptt: true }, { quoted: m });
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
      return true;
    }
    if (cmd === 'jswap') {
      const quoted = getQuoted(m);
      const quotedImg = quoted?.quotedMessage?.imageMessage;
      const currentImg = m.message?.imageMessage;
      if (!quotedImg || !currentImg) { await safeReply(sock, jid, `Kirim gambar + reply gambar lain + caption ${prefix}jswap (butuh 2 wajah).`, m); return true; }
      await interim(sock, jid, m, '🔄 Lagi faceswap (Jere)...');
      try {
        const buf1 = await downloadBuffer(m, sock);
        const buf2 = await downloadBuffer(wrapQuoted(jid, quoted), sock);
        const out = await jereAi.faceswap(buf1, buf2);
        await sock.sendMessage(jid, { image: out, caption: '🔄 faceswap (Jere)' }, { quoted: m });
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
      return true;
    }

  return false;
}

module.exports = { handleJereAi };
