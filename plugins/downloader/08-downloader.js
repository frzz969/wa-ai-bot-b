// handlers/downloader.js — DOWNLOADER: play/ytmp3/ytmp4/tiktok/fbdl/igdl
// Diekstrak verbatim dari handlers/messages.js; tanpa perubahan perilaku.
// Dipanggil router handlers/messages.js sesuai urutan asli. Return true = tertangani.
const S = require('../../handlers/state');
const {
  systems,
  dlLane,
  safeReply,
} = S;

async function handleDownloader(ctx) {
  const { sock, m, jid, isGroup, sender, body, cmd, args, prefix, start, unwrapped } = ctx;
    // ---------- LANE DOWNLOADER (lib/downloader.js, limit 1/hari per unduhan) ----------
    if (cmd === 'play' || cmd === 'ytmp3' || cmd === 'ytmp4' || cmd === 'tiktok' || cmd === 'tiktoknowm' || cmd === 'fbdl' || cmd === 'igdl') {
      const lim = systems.useLimit(sender, 1);
      if (!lim.ok) {
        await safeReply(sock, jid, `⏳ Limit downloader habis (${lim.max}/hari). Balik lagi besok ya.`, m); return true;
      }
      if (cmd === 'play') { await dlLane.handlePlay(sock, jid, m, args); return true; }
      if (cmd === 'ytmp3') { await dlLane.handleYtmp3(sock, jid, m, args); return true; }
      if (cmd === 'ytmp4') { await dlLane.handleYtmp4(sock, jid, m, args); return true; }
      if (cmd === 'tiktok' || cmd === 'tiktoknowm') { await dlLane.handleTiktok(sock, jid, m, args); return true; }
      if (cmd === 'fbdl') { await dlLane.handleFbdl(sock, jid, m, args); return true; }
      if (cmd === 'igdl') { await dlLane.handleIgdl(sock, jid, m, args); return true; }
    }

  return false;
}

module.exports = { handleDownloader };
