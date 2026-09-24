// src/extensions/safety/anti-link.js (CJS).
// Hapus pesan berisi link invite/channel grup WA atau link Telegram.
// Pola: chat.whatsapp.com, whatsapp.com/channel, t.me/, telegram.me/
// Murni mekanis (cek setting antilink + skip admin/command di safety/index.js).
const LINK_PATTERNS = [
  /chat\.whatsapp\.com/i,
  /whatsapp\.com\/channel/i,
  /t\.me\//i,
  /telegram\.me\//i,
];

function containsBannedLink(text) {
  const s = String(text || '');
  if (!s) return false;
  return LINK_PATTERNS.some((re) => re.test(s));
}

// Kembalikan true bila link terlarang (pesan sudah ditangani: hapus + tegur).
async function checkAntiLink(sock, m, { jid, sender, text }) {
  if (!containsBannedLink(text)) return false;
  try {
    await sock.sendMessage(jid, { delete: m.key });
  } catch {}
  try {
    const tag = String(sender).split('@')[0];
    await sock.sendMessage(jid, {
      text: `🔗 @${tag} link tidak diizinkan di grup ini!`,
      mentions: [String(sender)],
    });
  } catch {}
  return true;
}

module.exports = { LINK_PATTERNS, containsBannedLink, checkAntiLink };
