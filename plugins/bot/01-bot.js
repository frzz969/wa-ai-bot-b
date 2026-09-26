// handlers/bot.js â€” BOT: menu/help, ping, about, status, run (owner), rules & anime saran
// Diekstrak verbatim dari handlers/messages.js; tanpa perubahan perilaku.
// Dipanggil router handlers/messages.js sesuai urutan asli. Return true = tertangani.
const { menuText, splitMessage } = require('../../handlers/menu');
const S = require('../../handlers/state');
const {
  config,
  countChats,
  getQuoted,
  unwrapMessage,
  runSandboxed,
  rulesText,
  animeSaranText,
  runCooldown,
  lastDoc,
  isOwner,
  getDisplayName,
  safeReply,
  sendMenuWithHeader,
} = S;

async function handleBot(ctx) {
  const { sock, m, jid, isGroup, sender, body, cmd, args, prefix, start, unwrapped } = ctx;
    // ---------- MENU ----------
    // .menu / .help        → ringkasan + navigasi
    // .menu all            → semua command per kategori
    // .menu list           → daftar kategori
    // .menu <kategori>     → isi satu kategori
    if (cmd === 'menu' || cmd === 'help' || cmd === 'cmd') {
      const teks = menuText(getDisplayName(m) || 'kak', prefix, args, {
        isOwner: isOwner(m.key.participant || sender, jid),
      });
      const bagian = splitMessage(teks, 3400);
      if (bagian.length === 1) {
        await sendMenuWithHeader(sock, jid, m, bagian[0]);
      } else {
        // Menu panjang: kirim sebagai teks bertahap (header gambar hanya untuk ringkasan).
        for (let i = 0; i < bagian.length; i++) {
          const suffix = bagian.length > 1 ? `\n\n_(bagian ${i + 1}/${bagian.length})_` : '';
          await safeReply(sock, jid, bagian[i] + suffix, m);
        }
      }
      return true;
    }

    if (cmd === 'ping') {
      await safeReply(sock, jid, `ðŸ“ Pong! ${Date.now() - start} ms`, m); return true;
    }

    // ---------- 10. BOT: about / status ----------
    if (cmd === 'about') {
      await sendMenuWithHeader(
        sock, jid, m,
        `ðŸ¤– *SONEZZ AI ASSISTANT*\n\n` +
        `*SONEZZ* adalah WhatsApp AI Assistant yang menggabungkan AI, utility, media, downloader, game, dan berbagai fitur lainnya dalam satu bot.\n\n` +
        `*âœ¦ FEATURES*\n\n` +
        `ðŸ’¬ *AI Chat* â€” ngobrol, tanya jawab, curhat, dan memory\n` +
        `ðŸ§  *AI Tools* â€” explain, summarize, rewrite, translate, dan ideas\n` +
        `ðŸ’» *Coding* â€” generate, debug, dan fix kode\n` +
        `ðŸŒ *Web & Info* â€” search, news, weather, dan berbagai utility\n` +
        `ðŸŽ¨ *Creative* â€” generate gambar dan bantu membuat konten\n` +
        `ðŸ‘ï¸ *Vision & Voice* â€” OCR, analisis gambar, transcribe, dan TTS\n` +
        `ðŸ“¥ *Downloader* â€” download berbagai media\n` +
        `ðŸŽ² *Fun & RPG* â€” game, random tools, quest, dan leaderboard\n` +
        `ðŸ’° *Economy* â€” daily, work, bank, transfer, mining, dan progression\n` +
        `ðŸ‘¥ *Group Tools* â€” moderation dan pengaturan grup\n\n` +
        `*âœ¦ ABOUT*\n\n` +
        `SONEZZ dikembangkan sebagai project WhatsApp bot dengan berbagai fitur yang bisa digunakan langsung dari chat.\n\n` +
        `Setiap fitur dibuat untuk kebutuhan yang berbeda, mulai dari ngobrol dengan AI, mencari informasi, mengolah media dan dokumen, sampai bermain dan mengelola grup.\n\n` +
        `Ketik ${prefix}menu untuk melihat seluruh command yang tersedia.\n\n` +
        `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”\n` +
        `*SONEZZ AI ASSISTANT*\n` +
        `_WhatsApp AI Â· Utility Â· Media Â· Fun_`
      ); return true;
    }
    if (cmd === 'status') {
      const up = Math.floor(process.uptime());
      const h = Math.floor(up / 3600);
      const mi = Math.floor((up % 3600) / 60);
      const s = up % 60;
      await safeReply(
        sock, jid,
        `ðŸ“Š *Status Bot*\n` +
        `â€¢ Uptime: ${h}j ${mi}m ${s}d\n` +
        `â€¢ Model: ${config.GEMINI_MODEL} + ${config.GROQ_CHAT_MODEL}\n` +
        `â€¢ Chat di memory: ${countChats()} jid\n` +
        `â€¢ Dokumen tersimpan: ${lastDoc.size} chat`,
        m
      ); return true;
    }

    // ---------- .run (eksekusi JS aman, OWNER ONLY) ----------
    if (cmd === 'run') {
      if (!isOwner(m.key.participant, m.key.remoteJid)) {
        await safeReply(sock, jid, 'â›” Hanya owner yang bisa pakai perintah ini.', m); return true;
      }
      const lastRun = runCooldown.get(sender) || 0;
      if (Date.now() - lastRun < 5000) {
        await safeReply(sock, jid, 'â³ Cooldown .run 5 detik, tunggu sebentar.', m); return true;
      }

      // Ambil kode: argumen langsung, atau reply ke pesan berisi kode
      let code = args;
      if (!code) {
        const qRaw = getQuoted(m)?.quotedMessage;
        const q = qRaw ? unwrapMessage(qRaw) : null;
        code = (q?.conversation || q?.extendedTextMessage?.text || '').trim();
      }
      if (!code) {
        await safeReply(sock, jid, `Contoh: ${prefix}run 2+2*10`, m); return true;
      }
      runCooldown.set(sender, Date.now());

      console.log(`[RUN] ${sender} :: ${code.slice(0, 200)}`);
      try {
        const out = await runSandboxed(code);
        await safeReply(sock, jid, `ðŸ’» *Hasil:*\n${out}`, m); return true;
      } catch (e) {
        console.error('run', e?.message || e);
        const msg = String((e && e.message) || e || 'Error').slice(0, 500);
        await safeReply(sock, jid, `âŒ Error:\n${msg}`, m); return true;
      }
    }

    // ---------- LANE INFO (lib/info.js) ----------
    if (cmd === 'rules') {
      await safeReply(sock, jid, rulesText(prefix), m); return true;
    }
    if (cmd === 'animesaran' || cmd === 'anime') {
      await safeReply(sock, jid, animeSaranText(), m); return true;
    }

  return false;
}

module.exports = { handleBot };
