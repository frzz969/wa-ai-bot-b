// lib/nulis.js — tulis tangan di buku (lokal, SVG + sharp, tanpa API/trial)
// Render teks ke PNG gaya buku tulis: kertas putih, garis biru, margin merah.
// Contoh router:
//   const { handleNulis } = require('../lib/nulis');
//   if (cmd === 'nulis') return await handleNulis(sock, jid, m, args);

const sharp = require('sharp');

function escapeXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Potong teks jadi baris-baris ≤ maxChars (potong per kata).
function wrapNulis(text, maxChars) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? cur + ' ' + w : w;
    if (trial.length <= maxChars) {
      cur = trial;
    } else {
      if (cur) lines.push(cur);
      cur = w.length > maxChars ? w.slice(0, maxChars) : w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : ['...'];
}

// Teks → PNG buku. Opsi: { width, fontSize, maxChars, maxLines }.
async function nulis(text, opts) {
  const o = Object.assign({ width: 800, fontSize: 30, maxChars: 42, maxLines: 30 }, opts || {});
  const raw = String(text || '').trim();
  if (!raw) throw new Error('Contoh: .nulis halo dunia');
  const lines = wrapNulis(raw, o.maxChars).slice(0, o.maxLines);
  const lh = Math.round(o.fontSize * 1.9); // spasi antar garis buku
  const padTop = 40;
  const height = padTop * 2 + lines.length * lh;
  const leftMargin = 70;

  const rules = lines
    .map((_, i) => {
      const y = padTop + i * lh + Math.round(o.fontSize * 1.15);
      return '<line x1="0" y1="' + y + '" x2="' + o.width + '" y2="' + y + '" stroke="#9ec5fe" stroke-width="1.5"/>';
    })
    .join('');

  const texts = lines
    .map((ln, i) => {
      const y = padTop + i * lh + Math.round(o.fontSize * 0.95);
      return (
        '<text x="' + (leftMargin + 14) + '" y="' + y + '" font-family="\'Segoe Script\',\'Comic Sans MS\',cursive" ' +
        'font-size="' + o.fontSize + '" font-style="italic" fill="#1a3a8f">' + escapeXml(ln) + '</text>'
      );
    })
    .join('');

  const svg =
    '<svg width="' + o.width + '" height="' + height + '" xmlns="http://www.w3.org/2000/svg">' +
    '<rect width="' + o.width + '" height="' + height + '" fill="#ffffff"/>' +
    rules +
    '<line x1="' + leftMargin + '" y1="0" x2="' + leftMargin + '" y2="' + height + '" stroke="#f28b82" stroke-width="2"/>' +
    texts +
    '</svg>';
  return await sharp(Buffer.from(svg)).png().toBuffer();
}

async function handleNulis(sock, jid, m, args) {
  if (!args) return await sock.sendMessage(jid, { text: 'Contoh: .nulis halo dunia' }, { quoted: m });
  if (String(args).length > 1500) return await sock.sendMessage(jid, { text: '❌ Teks max 1500 karakter.' }, { quoted: m });
  try {
    await sock.sendMessage(jid, { text: '✏️ Lagi nulis...' }, { quoted: m }).catch(() => {});
  } catch {}
  try {
    const png = await nulis(args);
    await sock.sendMessage(jid, { image: png, caption: '✏️ *Nulis:*\n' + String(args).slice(0, 300) }, { quoted: m });
  } catch (e) {
    console.error('nulis', (e && e.message) || e);
    await sock.sendMessage(jid, { text: '❌ Gagal nulis. Coba teks lain.' }, { quoted: m });
  }
}

module.exports = { nulis, handleNulis };
