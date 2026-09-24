// src/extensions/safety/anti-flood.js (CJS).
// Window: >5 pesan / 10 detik per user per grup -> hapus pesan + tegur (tegur teks sekali per window).
// Murni mekanis (cek setting antiflood dilakukan di safety/index.js). Skip admin/owner di index.js.
const FLOOD_LIMIT = 5;
const WINDOW_MS = 10 * 1000;
const MSGLOG_MAX = 3000;

const msgLog = new Map(); // key `${jid}:${sender}` -> number[] timestamp ms

function track(jid, sender) {
  const key = `${String(jid)}:${String(sender)}`;
  const now = Date.now();
  let arr = msgLog.get(key);
  if (!arr) {
    arr = [];
    msgLog.set(key, arr);
  }
  const cut = now - WINDOW_MS;
  while (arr.length && arr[0] <= cut) arr.shift();
  arr.push(now);
  if (arr.length > FLOOD_LIMIT * 4) arr.splice(0, arr.length - FLOOD_LIMIT * 4);
  return arr.length;
}

// Kembalikan true bila flood (pesan sudah ditangani: hapus, stop pipeline/handler).
async function checkAntiFlood(sock, m, { jid, sender }) {
  const count = track(jid, sender);
  if (count <= FLOOD_LIMIT) return false;
  try {
    await sock.sendMessage(jid, { delete: m.key });
  } catch {}
  // Tegur hanya sekali saat pertama melewati batas (hindari spam teguran).
  if (count === FLOOD_LIMIT + 1) {
    try {
      const tag = String(sender).split('@')[0];
      await sock.sendMessage(jid, {
        text: `⚠️ Jangan flood @${tag}! Pelan-pelan ya, ${FLOOD_LIMIT} pesan per 10 detik.`,
        mentions: [String(sender)],
      });
    } catch {}
  }
  return true;
}

// Dipakai scheduler tiap 10 menit. Kembalikan jumlah key yang dibersihkan.
function cleanupAntiFlood(now = Date.now()) {
  let removed = 0;
  const cut = Number(now) - WINDOW_MS;
  for (const [key, arr] of msgLog) {
    if (!Array.isArray(arr)) { msgLog.delete(key); removed++; continue; }
    while (arr.length && arr[0] <= cut) arr.shift();
    if (!arr.length) { msgLog.delete(key); removed++; }
  }
  if (msgLog.size > MSGLOG_MAX) {
    const iter = msgLog.keys();
    while (msgLog.size > MSGLOG_MAX) {
      const { value, done } = iter.next();
      if (done) break;
      msgLog.delete(value);
      removed++;
    }
  }
  return removed;
}

module.exports = { FLOOD_LIMIT, WINDOW_MS, checkAntiFlood, cleanupAntiFlood, _msgLog: msgLog };
