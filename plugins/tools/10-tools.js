// handlers/tools.js — TOOLS lokal & remote
// Diekstrak verbatim dari handlers/messages.js; tanpa perubahan perilaku.
// Dipanggil router handlers/messages.js sesuai urutan asli. Return true = tertangani.
const S = require('../../handlers/state');
const {
  downloadBuffer,
  getQuoted,
  wrapQuoted,
  unwrapMessage,
  toolsLocal,
  toolsRemote,
  safeReply,
  interim,
} = S;

async function handleTools(ctx) {
  const { sock, m, jid, isGroup, sender, body, cmd, args, prefix, start, unwrapped } = ctx;
    // ---------- LANE TOOLS LOKAL (lib/tools-local.js, offline) ----------
    if (cmd === 'morse' || cmd === 'dmorse') {
      try {
        if (!args) {
          await safeReply(sock, jid, `Contoh: ${prefix}${cmd} ${cmd === 'morse' ? 'halo dunia' : '•••• •-••'}\n`, m); return true;
        }
        await safeReply(sock, jid, toolsLocal.handleMorse(cmd, args), m); return true;
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, '❌ Gagal memproses morse. Coba lagi ya.', m); return true;
      }
    }
    if (cmd === 'toaudio' || cmd === 'tovn') {
      try {
        const quoted = getQuoted(m);
        const qInner = quoted?.quotedMessage ? unwrapMessage(quoted.quotedMessage) : null;
        const qAV = qInner?.audioMessage || qInner?.videoMessage;
        const cAV = unwrapped?.audioMessage || unwrapped?.videoMessage;
        if (!qAV && !cAV) {
          await safeReply(sock, jid, `Reply audio/video + ${prefix}${cmd} untuk mengubahnya jadi voice note.`, m); return true;
        }
        await interim(sock, jid, m, '🎧 Lagi konversi ke audio...');
        const target = qAV ? wrapQuoted(jid, quoted) : m;
        const buf = await downloadBuffer(target, sock);
        const out = toolsLocal.toAudioHelp(buf, (qAV || cAV)?.mimetype, cmd === 'tovn');
        await sock.sendMessage(jid, { audio: out.data, mimetype: out.mimetype, ptt: out.ptt }, { quoted: m });
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, '❌ Gagal mengubah jadi audio. Coba file lain ya.', m); return true;
      }
      return true;
    }
    if (cmd === 'toimage') {
      try {
        const quoted = getQuoted(m);
        const qInner = quoted?.quotedMessage ? unwrapMessage(quoted.quotedMessage) : null;
        const quotedMedia = qInner?.imageMessage || qInner?.stickerMessage;
        const currentMedia = m.message?.imageMessage || unwrapped?.stickerMessage;
        if (!quotedMedia && !currentMedia) {
          await safeReply(sock, jid, `Reply gambar + ${prefix}toimage untuk resize ke 512px.`, m); return true;
        }
        await interim(sock, jid, m, '🖼️ Lagi resize gambar...');
        const target = quotedMedia ? wrapQuoted(jid, quoted) : m;
        const buf = await downloadBuffer(target, sock);
        const png = await toolsLocal.toImage(buf);
        await sock.sendMessage(jid, { image: png, caption: '🖼️ toimage (512px)' }, { quoted: m });
      } catch (e) {
        console.error('toimage', e?.message || e);
        await safeReply(sock, jid, '❌ Gagal mengubah gambar. Coba gambar lain ya.', m); return true;
      }
      return true;
    }

    // ---------- LANE TOOLS REMOTE (lib/tools-remote.js, API publik) ----------
    if (cmd === 'tourl') {
      try {
        const quoted = getQuoted(m);
        const qInner = quoted?.quotedMessage ? unwrapMessage(quoted.quotedMessage) : null;
        const qMedia = qInner?.imageMessage || qInner?.videoMessage || qInner?.audioMessage || qInner?.stickerMessage || qInner?.documentMessage;
        const cMedia = unwrapped?.imageMessage || unwrapped?.videoMessage || unwrapped?.audioMessage || unwrapped?.stickerMessage || unwrapped?.documentMessage;
        if (!qMedia && !cMedia) {
          await safeReply(sock, jid, `Reply gambar/video/audio/dokumen + ${prefix}tourl untuk upload jadi link.`, m); return true;
        }
        await interim(sock, jid, m, '⬆️ Lagi upload...');
        const target = qMedia ? wrapQuoted(jid, quoted) : m;
        const buf = await downloadBuffer(target, sock);
        const fname = (qMedia || cMedia)?.fileName || qInner?.documentMessage?.fileName || 'file.bin';
        const url = await toolsRemote.tourl(buf, String(fname));
        await safeReply(sock, jid, `🔗 *URL:*\n${url}`, m); return true;
      } catch (e) {
        console.error('tourl', e?.message || e);
        await safeReply(sock, jid, '❌ Upload gagal, layanan upload sedang offline. Coba lagi nanti ya.', m); return true;
      }
    }
    if (cmd === 'removebg') {
      try {
        const quoted = getQuoted(m);
        const quotedImg = quoted?.quotedMessage?.imageMessage;
        const currentImg = m.message?.imageMessage;
        if (!quotedImg && !currentImg) {
          await safeReply(sock, jid, `Reply gambar + ${prefix}removebg untuk hapus background.`, m); return true;
        }
        await interim(sock, jid, m, '✂️ Lagi hapus background...');
        const target = quotedImg ? wrapQuoted(jid, quoted) : m;
        const buf = await downloadBuffer(target, sock);
        const out = await toolsRemote.removebg(buf);
        await sock.sendMessage(jid, { image: out, caption: '✂️ removebg' }, { quoted: m });
      } catch (e) {
        console.error('removebg', e?.message || e);
        await safeReply(sock, jid, '❌ Removebg gagal, layanannya sedang offline. Coba lagi nanti ya.', m); return true;
      }
      return true;
    }
    if (cmd === 'hd') {
      try {
        const quoted = getQuoted(m);
        const quotedImg = quoted?.quotedMessage?.imageMessage;
        const currentImg = m.message?.imageMessage;
        if (!quotedImg && !currentImg) {
          await safeReply(sock, jid, `Reply gambar + ${prefix}hd untuk HD-kan gambar.`, m); return true;
        }
        await interim(sock, jid, m, '✨ Lagi HD-kan gambar...');
        const target = quotedImg ? wrapQuoted(jid, quoted) : m;
        const buf = await downloadBuffer(target, sock);
        const out = await toolsRemote.hdImage(buf);
        await sock.sendMessage(jid, { image: out, caption: '✨ HD' }, { quoted: m });
      } catch (e) {
        console.error('hd', e?.message || e);
        await safeReply(sock, jid, '❌ HD gagal, layanannya sedang offline. Coba lagi nanti ya.', m); return true;
      }
      return true;
    }
    if (cmd === 'qrdetect') {
      try {
        const quoted = getQuoted(m);
        const quotedImg = quoted?.quotedMessage?.imageMessage;
        const currentImg = m.message?.imageMessage;
        if (!quotedImg && !currentImg) {
          await safeReply(sock, jid, `Reply gambar berisi QR + ${prefix}qrdetect untuk membaca isinya.`, m); return true;
        }
        await interim(sock, jid, m, '🔳 Lagi membaca QR...');
        const target = quotedImg ? wrapQuoted(jid, quoted) : m;
        const buf = await downloadBuffer(target, sock);
        const text = await toolsRemote.qrDetect(buf);
        await safeReply(sock, jid, `🔳 *Isi QR:*\n${text}`, m); return true;
      } catch (e) {
        console.error('qrdetect', e?.message || e);
        await safeReply(sock, jid, '❌ Gagal membaca QR. Pastikan gambar berisi QR yang jelas ya.', m); return true;
      }
    }
    if (cmd === 'blurface') {
      try {
        const quoted = getQuoted(m);
        const quotedImg = quoted?.quotedMessage?.imageMessage;
        const currentImg = m.message?.imageMessage;
        if (!quotedImg && !currentImg) {
          await safeReply(sock, jid, `Reply gambar + ${prefix}blurface untuk blur wajah.`, m); return true;
        }
        await interim(sock, jid, m, '🫣 Lagi blur wajah...');
        const target = quotedImg ? wrapQuoted(jid, quoted) : m;
        const buf = await downloadBuffer(target, sock);
        const out = await toolsRemote.blurface(buf);
        await sock.sendMessage(jid, { image: out, caption: '🫣 blurface' }, { quoted: m });
      } catch (e) {
        console.error('blurface', e?.message || e);
        await safeReply(sock, jid, '❌ Blurface gagal, layanannya sedang offline. Coba lagi nanti ya.', m); return true;
      }
      return true;
    }

  return false;
}

module.exports = { handleTools };
