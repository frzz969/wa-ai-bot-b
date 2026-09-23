// lib/sticker.js — Gambar -> stiker & Teks -> stiker (sharp, tanpa ffmpeg)
const sharp = require('sharp');
const { renderBrat } = require('./brat');

// Gambar (buffer jpg/png) -> webp 512x512 siap kirim as sticker
async function imageToSticker(buffer) {
  return await sharp(buffer)
    .resize(512, 512, {
      fit: 'cover',
      position: 'centre',
    })
    .webp({ quality: 90, effort: 6 })
    .toBuffer();
}

// Teks -> stiker: render via engine brat (size 512), convert PNG -> webp
async function textToSticker(text) {
  const png = await renderBrat(text || '...', 512);
  return await sharp(png).webp({ quality: 90, effort: 6 }).toBuffer();
}

module.exports = { imageToSticker, textToSticker };
