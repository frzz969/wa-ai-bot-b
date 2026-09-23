// lib/media.js — helper download media Baileys
const sharp = require('sharp');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

async function downloadBuffer(targetMsg, sock) {
  // targetMsg = objek pesan lengkap (bisa quotedMessage yang dibungkus)
  return await downloadMediaMessage(targetMsg, 'buffer', {}, {
    logger: sock.logger,
    reuploadRequest: sock.updateMediaMessage,
  });
}

function unwrapMessage(message) {
  let msg = message;
  for (let i = 0; i < 5 && msg; i++) {
    if (msg.ephemeralMessage) msg = msg.ephemeralMessage.message;
    else if (msg.viewOnceMessage) msg = msg.viewOnceMessage.message;
    else if (msg.viewOnceMessageV2) msg = msg.viewOnceMessageV2.message;
    else if (msg.documentWithCaptionMessage) msg = msg.documentWithCaptionMessage.message;
    else break;
  }
  return msg;
}

function getQuoted(msg) {
  const inner = unwrapMessage(msg.message || {}) || {};
  const ctx =
    inner.extendedTextMessage?.contextInfo ||
    inner.imageMessage?.contextInfo ||
    inner.videoMessage?.contextInfo ||
    inner.audioMessage?.contextInfo ||
    inner.documentMessage?.contextInfo ||
    inner.stickerMessage?.contextInfo ||
    null;
  if (!ctx?.quotedMessage) return null;
  return { quotedMessage: ctx.quotedMessage, contextInfo: ctx };
}

// Bungkus quotedMessage jadi struktur "msg" agar bisa di-download
function wrapQuoted(remoteJid, quoted) {
  return {
    key: {
      remoteJid,
      fromMe: false,
      id: quoted.contextInfo?.stanzaId || 'quoted',
      participant: quoted.contextInfo?.participant,
    },
    message: unwrapMessage(quoted.quotedMessage) || quoted.quotedMessage,
  };
}

function isImageMessage(message) {
  return !!message?.imageMessage;
}

function isAudioMessage(message) {
  // VN = audioMessage dengan ptt:true (tidak ada tipe pttMessage)
  return !!message?.audioMessage;
}

// Kompres gambar untuk API vision: sisi terpanjang maks 1024px, JPEG q70.
// Gambar kecil (kedua sisi <=1024) dipakai apa adanya. Buffer asli tak diubah.
async function compressForVision(buffer, mime) {
  try {
    const meta = await sharp(buffer).metadata();
    const w = meta.width || 0;
    const h = meta.height || 0;
    if (w > 0 && h > 0 && w <= 1024 && h <= 1024) return { buffer, mime };
    const out = await sharp(buffer)
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
    return { buffer: out, mime: 'image/jpeg' };
  } catch {
    return { buffer, mime }; // gagal kompres: pakai asli
  }
}

// Preprocess untuk OCR/tulisan tangan: grayscale -> normalize -> sharpen ringan
// -> upscale bila sisi terpanjang <1500px (aspect kept) -> clamp ≤1024px JPEG q70.
async function preprocessForOCR(buffer) {
  try {
    const meta = await sharp(buffer).metadata();
    const longest = Math.max(meta.width || 0, meta.height || 0);
    let cur = buffer;
    if (longest > 0 && longest < 1500) {
      cur = await sharp(buffer)
        .resize(1500, 1500, { fit: 'inside', withoutEnlargement: false })
        .toBuffer();
    }
    const out = await sharp(cur)
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1 })
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
    return { buffer: out, mime: 'image/jpeg' };
  } catch {
    return { buffer, mime: 'image/jpeg' };
  }
}

module.exports = { downloadBuffer, getQuoted, wrapQuoted, unwrapMessage, isImageMessage, isAudioMessage, compressForVision, preprocessForOCR };
