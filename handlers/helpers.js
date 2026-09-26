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

// Semua nomor owner dari config. OWNER_NUMBER boleh berisi beberapa nomor,
// dipisah koma/spasi (mis. "628123,628456").
function ownerNumbers() {
  return String(config.OWNER_NUMBER || '')
    .split(/[,\s]+/)
    .map((n) => n.replace(/[^0-9]/g, ''))
    .filter((n) => n.length >= 6);
}

// Cocokkan satu kandidat (participant / remoteJid / sender) ke daftar owner.
// WA sekarang mengirim @lid (bukan nomor HP) di grup, jadi cocokkan:
//   1. digit penuh sama persis
//   2. 10 digit terakhir sama (menutup beda kode negara / leading 0)
function matchesOwner(candidate, owners) {
  const c = normalizeNum(candidate);
  if (!c) return false;
  for (const o of owners) {
    if (c === o) return true;
    if (c.length >= 10 && o.length >= 10 && c.slice(-10) === o.slice(-10)) return true;
  }
  return false;
}

// Owner dicek dari participant, remoteJid, dan sender sekaligus.
function isOwner(participant, remoteJid, sender) {
  const owners = ownerNumbers();
  if (!owners.length) return false;
  return [participant, remoteJid, sender].some((c) => matchesOwner(c, owners));
}

// Di grup, WhatsApp kini mengirim "@lid" (bukan nomor HP) sebagai participant,
// jadi Owner tidak bisa dicocokkan dari angka. Coba resolusi LID -> nomor HP
// lewat signalRepository Baileys. Kalau gagal, apa adanya (tidak error).
async function isOwnerAsync(sock, participant, remoteJid, sender) {
  if (isOwner(participant, remoteJid, sender)) return true;
  const owners = ownerNumbers();
  if (!owners.length) return false;

  const lids = [participant, sender]
    .map((x) => String(x || ''))
    .filter((x) => x.includes('@lid'));
  if (!lids.length) return false;

  const map = sock?.signalRepository?.lidMapping;
  if (!map || typeof map.getPNForLID !== 'function') return false;

  for (const lid of lids) {
    try {
      const pn = await Promise.race([
        map.getPNForLID(lid),
        new Promise((r) => setTimeout(() => r(null), 3000)),
      ]);
      if (pn && matchesOwner(String(pn).replace(/:\d+@/, '@'), owners)) return true;
    } catch {
      // abaikan: mapping LID sering gagal, tidak boleh menggagalkan menu
    }
  }
  return false;
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
  ownerNumbers,
  matchesOwner,
  isOwner,
  isOwnerAsync,
  botJidNormalized,
  withTimeout,
  chunkText,
};
