// lib/files.js — ekstrak teks dokumen PDF/DOCX/TXT (max 6000 char)
async function extractDocText(buffer, fileName = '', mime = '') {
  const name = String(fileName || '').toLowerCase();
  const type = String(mime || '').toLowerCase();
  const isPdf = name.endsWith('.pdf') || type.includes('pdf');
  const isDocx =
    name.endsWith('.docx') ||
    type.includes('officedocument.wordprocessingml') ||
    (type.includes('word') && !type.includes('msword'));

  if (isPdf) {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    return String(data.text || '').trim().slice(0, 6000);
  }
  if (isDocx) {
    const mammoth = require('mammoth');
    const data = await mammoth.extractRawText({ buffer });
    return String(data.value || '').trim().slice(0, 6000);
  }
  // txt / lainnya: baca sebagai teks biasa
  return buffer.toString('utf-8').trim().slice(0, 6000);
}

module.exports = { extractDocText };
