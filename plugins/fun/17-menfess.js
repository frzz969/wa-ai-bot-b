// plugins/fun/17-menfess.js — Menfess (pesan rahasia satu arah + balasan via ID)
// Dipanggil router handlers/messages.js otomatis via lib/plugin-loader.js. Return true = tertangani.
// Kontrak: async (ctx) => boolean, ctx = { sock, m, jid, sender, cmd, args, prefix }
// State in-memory (hilang saat restart), konsisten dengan pendingGmail di plugins/tools/11-am.js.
const S = require('../../handlers/state');
const { safeReply } = S;

// id (#XXXXXX) -> { a: senderA_JID, b: targetB_JID, active: true }
const menfessMap = new Map();

// Alfabet tanpa yang ambigu (tanpa 0/O, 1/I)
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genId() {
  let id;
  do {
    let s = '';
    for (let i = 0; i < 6; i++) {
      s += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
    }
    id = '#' + s;
  } while (menfessMap.has(id));
  return id;
}

function normId(raw) {
  const s = String(raw || '').trim().toUpperCase().replace(/^#/, '');
  if (!/^[A-Z2-9]{6}$/.test(s)) return null;
  return '#' + s;
}

function senderNum(sender) {
  return String(sender || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function normTarget(numRaw) {
  let d = String(numRaw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = '62' + d.slice(1);
  return d;
}

async function handleMenfess(ctx) {
  const { sock, m, jid, sender, cmd, args, prefix } = ctx;

  if (cmd === 'menfess') {
    const raw = String(args || '').trim();
    const sep = raw.indexOf('|');
    const numRaw = sep === -1 ? '' : raw.slice(0, sep).trim();
    const pesan = sep === -1 ? '' : raw.slice(sep + 1).trim();
    if (sep === -1 || !numRaw || !pesan) {
      await safeReply(
        sock, jid,
        `❌ Format salah.\nContoh: ${prefix}menfess 62812xxxxxxx|pesan rahasia kamu\n\n` +
        `▸ pisahkan nomor dan pesan dengan \`|\`\n` +
        `▸ pesan tidak boleh kosong`,
        m
      );
      return true;
    }
    const targetNum = normTarget(numRaw);
    if (!targetNum || targetNum.length < 9) {
      await safeReply(sock, jid, `❌ Nomor tujuan tidak valid.\nContoh: ${prefix}menfess 62812xxxxxxx|halo`, m);
      return true;
    }
    if (targetNum === senderNum(sender)) {
      await safeReply(sock, jid, `❌ Tidak bisa kirim menfess ke diri sendiri.`, m);
      return true;
    }
    const id = genId();
    const targetJid = `${targetNum}@s.whatsapp.net`;
    menfessMap.set(id, { a: String(sender), b: targetJid, active: true });
    try {
      await sock.sendMessage(
        targetJid,
        { text:
          `💌 *Kamu dapat menfess!* (${id})\n\n` +
          `"${pesan}"\n\n` +
          `—\n` +
          `Balas: \`${prefix}balasmenfess ${id}|balasan kamu\`\n` +
          `_Thread bisa ditutup pengirim sewaktu-waktu._`
        }
      );
    } catch (e) {
      menfessMap.delete(id);
      console.error('menfess kirim', e?.message || e);
      await safeReply(sock, jid, `❌ Gagal mengirim menfess. Nomor mungkin tidak terdaftar di WhatsApp.`, m);
      return true;
    }
    await safeReply(
      sock, jid,
      `✅ Menfess (${id}) terkirim! Balasan akan diteruskan ke sini. Tutup: \`${prefix}stopmenfess ${id}\``,
      m
    );
    return true;
  }

  if (cmd === 'balasmenfess') {
    const raw = String(args || '').trim();
    const sep = raw.indexOf('|');
    const idRaw = sep === -1 ? raw.trim() : raw.slice(0, sep).trim();
    const balasan = sep === -1 ? '' : raw.slice(sep + 1).trim();
    const id = normId(idRaw);
    if (!id || !balasan) {
      await safeReply(
        sock, jid,
        `❌ Format salah.\nContoh: ${prefix}balasmenfess ${idRaw || '#XXXXXX'}|balasan kamu`,
        m
      );
      return true;
    }
    const th = menfessMap.get(id);
    if (!th || !th.active) {
      await safeReply(sock, jid, `❌ ID tidak dikenal / sudah ditutup.`, m);
      return true;
    }
    const me = String(sender);
    let lawan = null;
    if (me === th.a) lawan = th.b;
    else if (me === th.b) lawan = th.a;
    else {
      await safeReply(sock, jid, `❌ ID tidak dikenal / sudah ditutup.`, m);
      return true;
    }
    if (!balasan) {
      await safeReply(sock, jid, `❌ Balasan tidak boleh kosong.`, m);
      return true;
    }
    try {
      await sock.sendMessage(
        lawan,
        { text:
          `💬 *Balasan menfess* (${id})\n\n` +
          `"${balasan}"\n\n` +
          `Balas lagi: \`${prefix}balasmenfess ${id}|...\``
        }
      );
    } catch (e) {
      console.error('balasmenfess kirim', e?.message || e);
      await safeReply(sock, jid, `❌ Gagal meneruskan balasan. Coba lagi sebentar ya.`, m);
      return true;
    }
    await safeReply(sock, jid, `✅ Balasan (${id}) diteruskan!`, m);
    return true;
  }

  if (cmd === 'stopmenfess') {
    const id = normId(String(args || '').trim().split(/\s+/)[0] || '');
    if (!id) {
      await safeReply(sock, jid, `❌ Format salah.\nContoh: ${prefix}stopmenfess #XXXXXX`, m);
      return true;
    }
    const th = menfessMap.get(id);
    if (!th || !th.active) {
      await safeReply(sock, jid, `❌ ID tidak dikenal / sudah ditutup.`, m);
      return true;
    }
    if (String(sender) !== th.a) {
      await safeReply(sock, jid, `❌ Hanya pengirim awal yang bisa menutup thread ini.`, m);
      return true;
    }
    th.active = false;
    menfessMap.delete(id);
    await safeReply(sock, jid, `🛑 Menfess (${id}) ditutup.`, m);
    try {
      await sock.sendMessage(
        th.b,
        { text: `🛑 Thread menfess (${id}) ditutup pengirim. Balasan berikutnya tidak akan diteruskan.` }
      );
    } catch {}
    return true;
  }

  return false;
}

module.exports = { handleMenfess };
