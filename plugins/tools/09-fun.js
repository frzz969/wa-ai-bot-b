// handlers/fun.js â€” FUN lokal
// Diekstrak verbatim dari handlers/messages.js; tanpa perubahan perilaku.
// Dipanggil router handlers/messages.js sesuai urutan asli. Return true = tertangani.
const S = require('../../handlers/state');
const {
  funLane,
  safeReply,
} = S;

async function handleFun(ctx) {
  const { sock, m, jid, isGroup, sender, body, cmd, args, prefix, start, unwrapped } = ctx;
    // ---------- LANE FUN (lib/fun.js, murni lokal) ----------
    if (cmd === 'truth') { await safeReply(sock, jid, funLane.truth(), m); return true; }
    if (cmd === 'dare') { await safeReply(sock, jid, funLane.dare(), m); return true; }
    if (cmd === 'tarot') { await safeReply(sock, jid, funLane.tarot(), m); return true; }
    if (cmd === 'zodiak') { await safeReply(sock, jid, funLane.zodiak(args), m); return true; }
    if (cmd === 'ship') {
      let n1 = '';
      let n2 = '';
      if (String(args || '').includes('|')) {
        const ps = String(args || '').split('|').map((x) => String(x || '').trim()).filter(Boolean);
        n1 = ps[0] || '';
        n2 = ps[1] || '';
      } else {
        const ps = String(args || '').split(/\s+/).filter(Boolean);
        n1 = ps[0] || '';
        n2 = ps[1] || '';
      }
      await safeReply(sock, jid, funLane.ship(n1, n2), m); return true;
    }
    if (cmd === 'pantun') { await safeReply(sock, jid, funLane.pantun(), m); return true; }
    if (cmd === 'weton') { await safeReply(sock, jid, funLane.weton(args), m); return true; }
    if (cmd === 'ramal') { await safeReply(sock, jid, funLane.ramal(), m); return true; }
    if (cmd === 'keberuntungan' || cmd === 'hoki') { await safeReply(sock, jid, funLane.keberuntungan(args), m); return true; }
    if (cmd === 'mimpi') { await safeReply(sock, jid, funLane.mimpi(args), m); return true; }
    if (cmd === 'karakter') { await safeReply(sock, jid, funLane.karakter(args), m); return true; }
    if (cmd === 'pilih') { await safeReply(sock, jid, funLane.pilih(args), m); return true; }
    if (cmd === 'coinflip' || cmd === 'koin') { await safeReply(sock, jid, funLane.coinflip(), m); return true; }
    if (cmd === 'dadu') { await safeReply(sock, jid, funLane.dadu(args), m); return true; }
    if (cmd === '8ball') { await safeReply(sock, jid, funLane.eightball(args), m); return true; }
    if (cmd === 'puji') { await safeReply(sock, jid, funLane.puji(args), m); return true; }
    if (cmd === 'quotes' || cmd === 'quote') { await safeReply(sock, jid, funLane.quotes(), m); return true; }

  return false;
}

module.exports = { handleFun };
