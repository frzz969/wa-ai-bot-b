// plugins/fun/18-anonchat.js — Anonymous chat ala Furina.
// Dipanggil router handlers/messages.js otomatis via lib/plugin-loader.js.
// Kontrak: async (ctx) => boolean. Return true = tertangani.
//
// Commands: `start` (masuk antrean / langsung dijodohkan bila ada yang menunggu),
// `next` (putus + cari pasangan baru), `stop` (keluar), `kirim <teks>` (kirim anonim).
//
// CATATAN RELAY PESAN BIASA (penting):
// Router handlers/messages.js TIDAK meneruskan pesan biasa (non-command) ke plugin:
//   - di GRUP: early-return bila tanpa prefix/mention (messages.js, blok grup guard);
//   - di PRIVATE: pesan biasa langsung dijawab AI (freechat) SEBELUM loop plugin.
// Karena itu auto-relay pesan biasa TIDAK diaktifkan di sini — mengklaimnya akan
// menelan semua pesan / merusak .new/.clear/AI. Yang jalan: sesi + penjodohan +
// relay via `kirim <teks>` (ber-prefix sehingga sampai ke plugin, di grup & private).
// Helper `tryAnonRelay(ctx)` di-export sebagai hook OPT-IN bila suatu saat router
// menyediakan titik interceptor pesan-biasa yang aman (jangan dipanggil membabi buta).
// Contoh hook aman (di messages.js, SEBELUM freechat, hanya bila user berpasangan):
//   const anon = require('../plugins/fun/18-anonchat');
//   if (await anon.tryAnonRelay({ sock, m, jid, sender, body, cmd, args })) return;
// State: in-memory (hilang saat restart), tanpa DB, tanpa dependensi baru.
const S = require('../../handlers/state');
const { safeReply } = S;

const queue = []; // [{ user, room }] antrean menunggu pasangan
const pairs = new Map(); // user -> { partner, room, partnerRoom }

function inQueue(user) {
  return queue.findIndex((q) => q.user === String(user));
}
function leaveQueue(user) {
  const i = inQueue(user);
  if (i !== -1) queue.splice(i, 1);
}
function unpair(user) {
  const p = pairs.get(String(user));
  if (!p) return null;
  pairs.delete(String(user));
  pairs.delete(String(p.partner));
  return p;
}

async function notify(sock, room, text) {
  try {
    await sock.sendMessage(room, { text });
  } catch {}
}

async function matchmake(sock, m, jid, sender, prefix) {
  // Cari penunggu lain (bukan diri sendiri).
  const idx = queue.findIndex((q) => q.user !== String(sender));
  if (idx === -1) {
    queue.push({ user: String(sender), room: String(jid) });
    await safeReply(
      sock, jid,
      `🔎 *Mencari pasangan anonim...*\nTunggu sebentar ya. Ketik ${prefix}stop untuk batalkan.`,
      m
    );
    return true;
  }
  const other = queue.splice(idx, 1)[0];
  pairs.set(String(sender), { partner: other.user, room: String(jid), partnerRoom: other.room });
  pairs.set(other.user, { partner: String(sender), room: other.room, partnerRoom: String(jid) });
  await safeReply(
    sock, jid,
    `✅ *Pasangan ditemukan!* Kamu terhubung secara anonim.\n` +
    `Kirim pesan: \`${prefix}kirim <teks>\`\nGanti pasangan: \`${prefix}next\` • Keluar: \`${prefix}stop\``,
    m
  );
  await notify(
    sock, other.room,
    `✅ *Pasangan ditemukan!* Kamu terhubung secara anonim.\n` +
    `Kirim pesan: \`${prefix}kirim <teks>\`\nGanti pasangan: \`${prefix}next\` • Keluar: \`${prefix}stop\``
  );
  return true;
}

async function handleAnonChat(ctx) {
  const { sock, m, jid, sender, cmd, args, prefix } = ctx;

  if (cmd === 'start') {
    if (pairs.get(String(sender))) {
      await safeReply(sock, jid, `⚠️ Kamu sudah terhubung. Ketik ${prefix}next untuk ganti atau ${prefix}stop untuk keluar.`, m);
      return true;
    }
    if (inQueue(sender) !== -1) {
      await safeReply(sock, jid, `⏳ Kamu masih dalam antrean. Tunggu pasangan ya (atau ${prefix}stop untuk batal).`, m);
      return true;
    }
    return await matchmake(sock, m, jid, sender, prefix);
  }

  if (cmd === 'next') {
    const p = unpair(sender);
    leaveQueue(sender);
    if (p) {
      await notify(sock, p.partnerRoom, `🚪 Pasangan anonim memutus chat. Ketik ${prefix}start untuk mencari lagi.`);
      await safeReply(sock, jid, `🔀 Chat diputus. Mencari pasangan baru...`, m);
    } else {
      await safeReply(sock, jid, `🔀 Mencari pasangan baru...`, m);
    }
    return await matchmake(sock, m, jid, sender, prefix);
  }

  if (cmd === 'stop') {
    const p = unpair(sender);
    leaveQueue(sender);
    if (p) {
      await notify(sock, p.partnerRoom, `🛑 Pasangan anonim keluar dari chat. Ketik ${prefix}start untuk mencari lagi.`);
      await safeReply(sock, jid, `🛑 Kamu keluar dari anonymous chat. Ketik ${prefix}start untuk main lagi.`, m);
      return true;
    }
    await safeReply(sock, jid, `ℹ️ Kamu tidak sedang dalam sesi anon. Ketik ${prefix}start untuk mulai.`, m);
    return true;
  }

  if (cmd === 'kirim') {
    const p = pairs.get(String(sender));
    if (!p) {
      await safeReply(sock, jid, `❌ Kamu belum terhubung. Ketik ${prefix}start dulu.`, m);
      return true;
    }
    const teks = String(args || '').trim();
    if (!teks) {
      await safeReply(sock, jid, `Contoh: ${prefix}kirim halo, apa kabar?`, m);
      return true;
    }
    await notify(sock, p.partnerRoom, `💬 *Pesan anonim:*\n${teks}`);
    await safeReply(sock, jid, `✅ Terkirim!`, m);
    return true;
  }

  return false;
}

// Hook OPT-IN untuk relay pesan biasa (non-command) — lihat catatan di header file.
// Hanya teruskan bila pengirim SEDANG berpasangan; kembalikan false bila bukan,
// sehingga tidak menelan pesan lain (tidak merusak .new/.clear/AI).
// JANGAN dipanggil dari loop plugin biasa; hanya dari interceptor pesan-biasa
// yang aman di router (yang tidak menerima command ber-prefix).
async function tryAnonRelay(ctx) {
  try {
    const { sock, sender, body } = ctx || {};
    if (!sock || !sender) return false;
    const p = pairs.get(String(sender));
    if (!p) return false;
    const teks = String(body || '').trim();
    if (!teks) return false;
    if (/^[.!#/]/.test(teks)) return false; // command ber-prefix: bukan milik relay
    const first = teks.split(/\s+/)[0].toLowerCase();
    const reserved = ['start', 'next', 'stop', 'kirim', 'new', 'clear', 'menu', 'help', 'jawab', 'suit', 'slot'];
    if (reserved.includes(first)) return false;
    await sock.sendMessage(p.partnerRoom, { text: `💬 *Pesan anonim:*\n${teks}` });
    return true;
  } catch {
    return false;
  }
}

module.exports = { handleAnonChat, tryAnonRelay };
