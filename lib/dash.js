// lib/dash.js — LANE GAME: SPEEDY DASH v4 (forward signed + fallback document)
// Pola tempel di router TANPA mengedit handlers/messages.js saat ini —
// file ini standalone; router cukup require saat mau dipakai:
//   const { isDashCommand, handleDash } = require('../lib/dash');
//   if (isDashCommand(cmd)) return await handleDash(sock, jid, m, args);
// Command: dash | sonic | speedy | speeddash

const fs = require('fs');
const path = require('path');

// Kredensial forward-signed dari script user.
// TODO: ganti nilai placeholder di bawah dengan SIG/CERT1/CERT2 asli dari
// script user bila sudah tersedia (format tetap: string).
const SIG = process.env.DASH_SIG || 'DASH-SIG-PLACEHOLDER';
const CERT1 = process.env.DASH_CERT1 || 'DASH-CERT1-PLACEHOLDER';
const CERT2 = process.env.DASH_CERT2 || 'DASH-CERT2-PLACEHOLDER';

const DASH_COMMANDS = ['dash', 'sonic', 'speedy', 'speeddash'];
const DASH_FILE = path.join(__dirname, '..', 'games', 'dash.html');

function isDashCommand(cmd) {
  return DASH_COMMANDS.includes(String(cmd || '').toLowerCase());
}

// Kirim pesan game dengan penanda forward-signed (newsletter) + jejak
// SIG/CERT1/CERT2, persis pola script user: relayMessage richResponseMessage.
// Bila relay gagal (proto tidak didukung / error), FALLBACK: kirim
// games/dash.html sebagai document agar game tetap sampai.
async function kirimForwardSigned(sock, jid, quoted, opts) {
  const o = opts || {};
  const title = o.title || '🎮 SPEEDY DASH v4';
  const body =
    o.body ||
    `${title}\nGame lari cepat! Ketik *dash* untuk main.\n` +
    `File game juga terlampir bila tombol di bawah tidak tampil di HP kamu.`;
  const newsletterJid = o.newsletterJid || process.env.DASH_NEWSLETTER_JID || '120363000000000000@newsletter';

  try {
    const content = {
      richResponseMessage: {
        message: { conversation: body },
        messageSecret: String(SIG),
        contextInfo: {
          forwardingScore: 999,
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid,
            serverMessageId: 1,
            newsletterName: 'SPEEDY DASH',
            contentType: 1,
            signature: String(SIG),
          },
        },
        // Rantai sertifikat penanda (dipakai klien yang mendukung).
        trustedHeaders: {
          cert1: String(CERT1),
          cert2: String(CERT2),
        },
      },
    };
    return await sock.relayMessage(jid, content, { messageId: o.messageId });
  } catch (e) {
    console.error('dash-relay', (e && e.message) || e);
    return await kirimDashDocument(sock, jid, quoted, o);
  }
}

// Fallback: kirim games/dash.html sebagai document.
async function kirimDashDocument(sock, jid, quoted, opts) {
  const buf = fs.readFileSync(DASH_FILE);
  return await sock.sendMessage(
    jid,
    {
      document: buf,
      mimetype: 'text/html',
      fileName: 'speedy-dash-v4.html',
      caption:
        '🎮 *SPEEDY DASH v4*\nBuka file HTML ini di browser untuk main. ' +
        'Ketik *dash* kapan saja untuk memunculkannya lagi.',
    },
    { quoted }
  );
}

async function handleDash(sock, jid, m, args) {
  void args;
  try {
    await sock.sendMessage(jid, { text: '🎮 Membuka SPEEDY DASH v4...' }, { quoted: m }).catch(() => {});
  } catch {}
  return await kirimForwardSigned(sock, jid, m, {});
}

module.exports = {
  SIG,
  CERT1,
  CERT2,
  DASH_COMMANDS,
  DASH_FILE,
  isDashCommand,
  kirimForwardSigned,
  kirimDashDocument,
  handleDash,
};
