// lib/iqc.js — command .iqc (iPhone Quoted Chat) via API gratis brat.siputzx (tanpa key)
// CommonJS. Pola pakai mengikuti handlers/messages.js:
//   const { handleIqc } = require('../lib/iqc');
//   if (cmd === 'iqc') return await handleIqc(sock, jid, m, args);
// Isi args = teks quote (boleh reply pesan: teks reply dipakai bila args kosong).

const IQC_BASE = 'https://brat.siputzx.my.id/iphone-quoted';
const IQC_DEFAULTS = {
  carrierName: 'INDOSAT',
  signalStrength: 4,
  emojiStyle: 'apple',
};

// Jam gaya iPhone "9.41" dalam WIB (UTC+7). cth: "09.41" -> "9.41".
function getWibTime(d) {
  const date = d instanceof Date ? d : new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  }).format(date);
  return parts.replace(':', '.');
}

function randomBattery() {
  return 15 + Math.floor(Math.random() * 86); // 15..100
}

// Ambil teks quote: args join (sudah di-join router) atau teks pesan yang di-reply.
function resolveIqcText(argsText, quotedText) {
  const a = String(argsText || '').trim();
  if (a) return a;
  const q = String(quotedText || '').trim();
  return q;
}

function buildIqcUrl(messageText, opts) {
  const o = Object.assign({}, IQC_DEFAULTS, opts || {});
  const battery = o.batteryPercentage == null ? randomBattery() : o.batteryPercentage;
  const time = o.time || getWibTime();
  const qs =
    'time=' + encodeURIComponent(time) +
    '&messageText=' + encodeURIComponent(String(messageText || '...')) +
    '&carrierName=' + encodeURIComponent(o.carrierName) +
    '&batteryPercentage=' + encodeURIComponent(battery) +
    '&signalStrength=' + encodeURIComponent(o.signalStrength) +
    '&emojiStyle=' + encodeURIComponent(o.emojiStyle);
  return IQC_BASE + '?' + qs;
}

// GET API -> Buffer image (png/jpg).
async function fetchIqcBuffer(messageText, opts) {
  const url = buildIqcUrl(messageText, opts);
  const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error('IQC HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error('IQC respons terlalu kecil');
  return buf;
}

// Handler siap tempel di router (tanpa edit file lain):
//   if (cmd === 'iqc') return await handleIqc(sock, jid, m, args);
// Opsi: handleIqc(sock, jid, m, args, { quotedText, carrierName, time })
async function handleIqc(sock, jid, m, argsText, opts) {
  const text = resolveIqcText(argsText, opts && opts.quotedText);
  if (!text) {
    return await sock.sendMessage(
      jid,
      { text: 'Contoh: .iqc halo, apa kabar? (bisa juga reply pesan + .iqc)' },
      { quoted: m }
    );
  }
  try {
    await sock.sendMessage(jid, { text: '📱 Lagi bikin iqc...' }, { quoted: m }).catch(() => {});
  } catch {}
  try {
    const buf = await fetchIqcBuffer(text, opts);
    await sock.sendMessage(jid, { image: buf, caption: '📱 *' + text + '*' }, { quoted: m });
  } catch (e) {
    console.error('iqc', (e && e.message) || e);
    await sock.sendMessage(jid, { text: '❌ Gagal membuat iqc. Coba lagi sebentar ya.' }, { quoted: m });
  }
}

module.exports = {
  IQC_BASE,
  getWibTime,
  randomBattery,
  resolveIqcText,
  buildIqcUrl,
  fetchIqcBuffer,
  handleIqc,
};
