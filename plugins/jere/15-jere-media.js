// handlers/jere-media.js — JERE-MEDIA
// Diekstrak verbatim dari handlers/messages.js; tanpa perubahan perilaku.
// Dipanggil router handlers/messages.js sesuai urutan asli. Return true = tertangani.
const S = require('../../handlers/state');
const {
  downloadBuffer,
  getQuoted,
  wrapQuoted,
  toolsRemote,
  jereMedia,
  sendLongText,
  getDisplayName,
  safeReply,
  interim,
  jereErr,
  jereFirstUrl,
} = S;

async function handleJereMedia(ctx) {
  const { sock, m, jid, isGroup, sender, body, cmd, args, prefix, start, unwrapped } = ctx;
    // ===== JERE-MEDIA (qc/meme/fake/anime/komik/movie/stalk) =====
    if (cmd === 'qc') {
      if (!args) { await safeReply(sock, jid, `Contoh: ${prefix}qc halo dunia|<nama>`, m); return true; }
      await interim(sock, jid, m, '💬 Lagi bikin quote ...');
      try {
        const parts = String(args).split('|').map((x) => String(x || '').trim());
        const text = parts[0] || '';
        const username = parts[1] || getDisplayName(m) || 'User';
        const buf = await jereMedia.jereQcWa(text, username, '', '');
        await sock.sendMessage(jid, { image: buf, caption: '💬 qc ' }, { quoted: m });
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
      return true;
    }
    if (cmd === 'drake') {
      const parts = String(args || '').split('|').map((x) => String(x || '').trim());
      if (!parts[0] || !parts[1]) { await safeReply(sock, jid, `Contoh: ${prefix}drake <atas>|<bawah>`, m); return true; }
      await interim(sock, jid, m, '🎭 Lagi bikin meme ...');
      try {
        const buf = await jereMedia.jereDrake(parts[0], parts[1]);
        await sock.sendMessage(jid, { image: buf, caption: '🎭 drake ' }, { quoted: m });
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
      return true;
    }
    if (cmd === 'smeme') {
      const parts = String(args || '').split('|').map((x) => String(x || '').trim());
      if (!parts[0]) { await safeReply(sock, jid, `Contoh: ${prefix}smeme <atas>|<bawah> (reply gambar atau sertakan URL: teks|teks|url)`, m); return true; }
      await interim(sock, jid, m, '🎭 Lagi bikin meme ...');
      try {
        let imageUrl = parts[2] || '';
        if (!imageUrl) {
          const quoted = getQuoted(m);
          const quotedImg = quoted?.quotedMessage?.imageMessage;
          const currentImg = m.message?.imageMessage;
          if (quotedImg || currentImg) {
            const target = quotedImg ? wrapQuoted(jid, quoted) : m;
            const buf = await downloadBuffer(target, sock);
            imageUrl = await toolsRemote.tourl(buf, 'smeme.jpg');
          }
        }
        if (!imageUrl) { await safeReply(sock, jid, `Sertakan gambar: reply gambar atau ${prefix}smeme <atas>|<bawah>|<url-gambar>`, m); return true; }
        const buf = await jereMedia.jereSmeme(parts[0], parts[1] || '_', imageUrl);
        await sock.sendMessage(jid, { image: buf, caption: '🎭 smeme ' }, { quoted: m });
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
      return true;
    }
    if (cmd === 'fakewa') {
      const parts = String(args || '').split('|').map((x) => String(x || '').trim());
      if (parts.length < 3) { await safeReply(sock, jid, `Contoh: ${prefix}fakewa <nama>|<tentang>|<nomor>`, m); return true; }
      await interim(sock, jid, m, '🎭 Lagi bikin fake WA ...');
      try {
        const buf = await jereMedia.jereFakeWa(parts[0], parts[1], parts[2], parts[3] || '');
        await sock.sendMessage(jid, { image: buf, caption: '🎭 fake WA ' }, { quoted: m });
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
      return true;
    }
    if (cmd === 'fakecall') {
      const parts = String(args || '').split('|').map((x) => String(x || '').trim());
      if (parts.length < 2) { await safeReply(sock, jid, `Contoh: ${prefix}fakecall <nama>|<durasi cth. 01:23:45>`, m); return true; }
      await interim(sock, jid, m, '📱 Lagi bikin fake call ...');
      try {
        const buf = await jereMedia.jereFakeCallIos(parts[0], parts[1], parts[2] || '');
        await sock.sendMessage(jid, { image: buf, caption: '📱 fake call ' }, { quoted: m });
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
      return true;
    }
    if (cmd === 'otaku') {
      if (!args) { await safeReply(sock, jid, `Contoh: ${prefix}otaku naruto`, m); return true; }
      await interim(sock, jid, m, '🎌 Lagi cari anime ...');
      try {
        const r = await jereMedia.jereOtakudesuSearch(args);
        const txt = jereMedia.formatOtakudesuSearch ? jereMedia.formatOtakudesuSearch(r, args) : JSON.stringify(r).slice(0, 3000);
        await sendLongText(sock, jid, String(txt).slice(0, 3500), m); return true;
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
    }
    if (cmd === 'otakudet') {
      if (!args) { await safeReply(sock, jid, `Contoh: ${prefix}otakudet <slug>`, m); return true; }
      await interim(sock, jid, m, '🎌 Lagi ambil detail anime ...');
      try {
        const r = await jereMedia.jereOtakudesuDetail(jereFirstUrl(args));
        const txt = jereMedia.formatOtakudesuDetail ? jereMedia.formatOtakudesuDetail(r) : JSON.stringify(r).slice(0, 3000);
        await sendLongText(sock, jid, String(txt).slice(0, 3500), m); return true;
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
    }
    if (cmd === 'komik') {
      if (!args) { await safeReply(sock, jid, `Contoh: ${prefix}komik solo leveling`, m); return true; }
      await interim(sock, jid, m, '📚 Lagi cari komik ...');
      try {
        const r = await jereMedia.jereKomikindoSearch(args);
        const txt = jereMedia.formatKomikindoSearch ? jereMedia.formatKomikindoSearch(r, args) : JSON.stringify(r).slice(0, 3000);
        await sendLongText(sock, jid, String(txt).slice(0, 3500), m); return true;
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
    }
    if (cmd === 'movie') {
      if (!args) { await safeReply(sock, jid, `Contoh: ${prefix}movie avengers`, m); return true; }
      await interim(sock, jid, m, '🎬 Lagi cari film ...');
      try {
        const r = await jereMedia.jereMovieboxSearch(args);
        const txt = jereMedia.formatMovieResult ? jereMedia.formatMovieResult(r, args) : JSON.stringify(r).slice(0, 3000);
        await sendLongText(sock, jid, String(txt).slice(0, 3500), m); return true;
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
    }
    if (cmd === 'viu') {
      if (!args) { await safeReply(sock, jid, `Contoh: ${prefix}viu <judul drama>`, m); return true; }
      await interim(sock, jid, m, '🎬 Lagi cari drama Viu ...');
      try {
        const r = await jereMedia.jereViu(args);
        const txt = jereMedia.formatMovieResult ? jereMedia.formatMovieResult(r, args) : JSON.stringify(r).slice(0, 3000);
        await sendLongText(sock, jid, String(txt).slice(0, 3500), m); return true;
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
    }
    if (cmd === 'igstalk' || cmd === 'ttstalk' || cmd === 'ytstalk' || cmd === 'ghstalk' || cmd === 'robstalk') {
      if (!args) { await safeReply(sock, jid, `Contoh: ${prefix}${cmd} <username>`, m); return true; }
      await interim(sock, jid, m, '🔍 Lagi stalk ...');
      try {
        const q = jereFirstUrl(args);
        if (cmd === 'igstalk') {
          const r = await jereMedia.jereIgStalk(q);
          await sendLongText(sock, jid, jereMedia.formatIgStalk(r, q).slice(0, 3500), m); return true;
        }
        if (cmd === 'ttstalk') {
          const r = await jereMedia.jereTiktokStalk(q);
          const txt = jereMedia.formatTiktokStalk ? jereMedia.formatTiktokStalk(r, q) : JSON.stringify(r).slice(0, 3000);
          await sendLongText(sock, jid, String(txt).slice(0, 3500), m); return true;
        }
        if (cmd === 'ytstalk') {
          const r = await jereMedia.jereYtStalk(q);
          const txt = jereMedia.formatYtStalk ? jereMedia.formatYtStalk(r, q) : JSON.stringify(r).slice(0, 3000);
          await sendLongText(sock, jid, String(txt).slice(0, 3500), m); return true;
        }
        if (cmd === 'ghstalk') {
          const r = await jereMedia.jereGithub(q);
          const txt = jereMedia.formatGithub ? jereMedia.formatGithub(r, q) : JSON.stringify(r).slice(0, 3000);
          await sendLongText(sock, jid, String(txt).slice(0, 3500), m); return true;
        }
        const r = await jereMedia.jereRoblox(q);
        const txt = jereMedia.formatRoblox ? jereMedia.formatRoblox(r, q) : JSON.stringify(r).slice(0, 3000);
        await sendLongText(sock, jid, String(txt).slice(0, 3500), m); return true;
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
    }

  return false;
}

module.exports = { handleJereMedia };
