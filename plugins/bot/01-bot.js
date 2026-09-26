// handlers/bot.js — BOT: menu/help, ping, about, status, run (owner), rules & anime saran
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
  isOwnerAsync,
  getDisplayName,
  safeReply,
  sendMenuWithHeader,
} = S;

async function handleBot(ctx) {
  const { sock, m, jid, isGroup, sender, body, cmd, args, prefix, start, unwrapped } = ctx;
    // ---------- MENU ----------
    // .menu / .help        ? ringkasan + navigasi
    // .menu all            ? semua command per kategori
    // .menu list           ? daftar kategori
    // .menu <kategori>     ? isi satu kategori
    if (cmd === 'menu' || cmd === 'help' || cmd === 'cmd') {
      // Nama tampilan: pushName -> nomor pengirim -> "user" (dulu jatuh ke "kak"
      // sehingga kolom name selalu kosong di private chat).
      const rawName = String(getDisplayName(m) || '').trim();
      const number = String(sender || '').split('@')[0].replace(/\D/g, '');
      const who = rawName || number || 'user';
      const teks = menuText(who, prefix, args, {
        isOwner: await isOwnerAsync(sock, m.key.participant, jid, sender),
      });
      const bagian = splitMessage(teks, 3900);
      if (bagian.length === 1) {
        await sendMenuWithHeader(sock, jid, m, bagian[0]);
      } else {
        // Menu panjang: kirim LANGSUNG di chat, dipecah berurutan.
        // (Dulu優先 jadi file .txt - padahal user lebih suka baca di chat.)
        for (let i = 0; i < bagian.length; i++) {
          const suffix = bagian.length > 1 ? `\n\n_(lanjutan ${i + 1}/${bagian.length})_` : '';
          await safeReply(sock, jid, bagian[i] + suffix, m);
        }
      }
      return true;
    }

    if (cmd === 'ping') {
      await safeReply(sock, jid, `🏓 Pong! ${Date.now() - start} ms`, m); return true;
    }

    // ---------- 10. BOT: about / status ----------
    if (cmd === 'about') {
      await sendMenuWithHeader(
        sock, jid, m,
        `🤖 *SONEZZ AI ASSISTANT*\n\n` +
        `*SONEZZ* adalah WhatsApp AI Assistant yang menggabungkan AI, utility, media, downloader, game, dan berbagai fitur lainnya dalam satu bot.\n\n` +
        `*✦ FEATURES*\n\n` +
        `💬 *AI Chat* — ngobrol, tanya jawab, curhat, dan memory\n` +
        `🧠 *AI Tools* — explain, summarize, rewrite, translate, dan ideas\n` +
        `💻 *Coding* — generate, debug, dan fix kode\n` +
        `🌐 *Web & Info* — search, news, weather, dan berbagai utility\n` +
        `🎨 *Creative* — generate gambar dan bantu membuat konten\n` +
        `👁️ *Vision & Voice* — OCR, analisis gambar, transcribe, dan TTS\n` +
        `📥 *Downloader* — download berbagai media\n` +
        `🎲 *Fun & RPG* — game, random tools, quest, dan leaderboard\n` +
        `💰 *Economy* — daily, work, bank, transfer, mining, dan progression\n` +
        `👥 *Group Tools* — moderation dan pengaturan grup\n\n` +
        `*✦ ABOUT*\n\n` +
        `SONEZZ dikembangkan sebagai project WhatsApp bot dengan berbagai fitur yang bisa digunakan langsung dari chat.\n\n` +
        `Setiap fitur dibuat untuk kebutuhan yang berbeda, mulai dari ngobrol dengan AI, mencari informasi, mengolah media dan dokumen, sampai bermain dan mengelola grup.\n\n` +
        `Ketik ${prefix}menu untuk melihat seluruh command yang tersedia.\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `*SONEZZ AI ASSISTANT*\n` +
        `_WhatsApp AI · Utility · Media · Fun_`
      ); return true;
    }
    if (cmd === 'status') {
      const up = Math.floor(process.uptime());
      const h = Math.floor(up / 3600);
      const mi = Math.floor((up % 3600) / 60);
      const s = up % 60;
      await safeReply(
        sock, jid,
        `📊 *Status Bot*\n` +
        `• Uptime: ${h}j ${mi}m ${s}d\n` +
        `• Model: ${config.GEMINI_MODEL} + ${config.GROQ_CHAT_MODEL}\n` +
        `• Chat di memory: ${countChats()} jid\n` +
        `• Dokumen tersimpan: ${lastDoc.size} chat`,
        m
      ); return true;
    }

    // ---------- .run (eksekusi JS aman, OWNER ONLY) ----------
    if (cmd === 'run') {
      if (!isOwner(m.key.participant, m.key.remoteJid)) {
        await safeReply(sock, jid, '⛔ Hanya owner yang bisa pakai perintah ini.', m); return true;
      }
      const lastRun = runCooldown.get(sender) || 0;
      if (Date.now() - lastRun < 5000) {
        await safeReply(sock, jid, '⏳ Cooldown .run 5 detik, tunggu sebentar.', m); return true;
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
        await safeReply(sock, jid, `💻 *Hasil:*\n${out}`, m); return true;
      } catch (e) {
        console.error('run', e?.message || e);
        const msg = String((e && e.message) || e || 'Error').slice(0, 500);
        await safeReply(sock, jid, `❌ Error:\n${msg}`, m); return true;
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
