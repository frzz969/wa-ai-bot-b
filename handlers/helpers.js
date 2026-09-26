// handlers/helpers.js - helper umum (murni, tanpa state sesi).
//
// Dipisah dari state.js supaya isinya jelas: ini fungsi reusable lintas
// kategori, bukan penyimpanan state. Tidak menyentuh Map sesi maupun
// dependensi lib, jadi aman dipindah kapan saja.
//
// Semua plugin tetap require("./state") seperti sebelumnya - state.js
// meng-export ulang (re-export) semua fungsi di bawah ini.
const config = require('../config');

// Kunci per chat+pengirim agar user A tidak memakai data user B.
function scopeKey(jid, sender) {
  return `${jid}|${sender}`;
}

// Isi Map dengan batas maksimum (buang entri tertua saat penuh).
function mapSetCapped(map, k, v, max = 100) {
  map.set(k, v);
  while (map.size > max) {
    map.delete(map.keys().next().value); // hapus entri tertua
  }
}

// Ambil hanya digit nomor dari jid (buang @... dan :device).
function normalizeNum(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
}

// Owner dicocokkan dari participant DAN remoteJid (Baileys baru kirim @lid di grup).
function isOwner(participant, remoteJid) {
  if (!config.OWNER_NUMBER) return false;
  // Baileys baru kirim @lid di grup: cocokkan participant DAN remoteJid
  return [normalizeNum(participant), normalizeNum(remoteJid)].some(
    (n) => n !== '' && n === config.OWNER_NUMBER
  );
}

// Nomor bot sendiri, tanpa @ dan :device.
function botJidNormalized(sock) {
  const id = sock.user?.id || '';
  return id.split(':')[0].split('@')[0];
}

// Batasi janji dengan timeout (untuk API/download tanpa signal).
function withTimeout(promise, ms, label) {
  let t;
  const to = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error((label || 'Timeout') + ' ' + ms + 'ms')), ms);
  });
  return Promise.race([promise.finally(() => clearTimeout(t)), to]);
}

// Potong teks panjang jadi chunk <= n char per batas kata (untuk TTS).
function chunkText(s, n = 200) {
  const words = String(s || '').split(/\s+/).filter(Boolean);
  const parts = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > n) {
      parts.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts.length ? parts : ['...'];
}

module.exports = {
  scopeKey,
  mapSetCapped,
  normalizeNum,
  isOwner,
  botJidNormalized,
  withTimeout,
  chunkText,
};
