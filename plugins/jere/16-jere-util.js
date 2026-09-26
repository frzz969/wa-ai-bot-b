// handlers/jere-util.js — JERE-UTIL
// Diekstrak verbatim dari handlers/messages.js; tanpa perubahan perilaku.
// Dipanggil router handlers/messages.js sesuai urutan asli. Return true = tertangani.
const S = require('../../handlers/state');
const {
  fs,
  path,
  jereUtil,
  sendLongText,
  isOwner,
  getDisplayName,
  safeReply,
  interim,
  jereErr,
  jereFirstUrl,
} = S;

async function handleJereUtil(ctx) {
  const { sock, m, jid, isGroup, sender, body, cmd, args, prefix, start, unwrapped } = ctx;
    // ===== JERE-UTIL (yts/pin/wallpaper/libur/style/genius/mlbb/ff/info + owner aman) =====
    // CATATAN: jspotify, jcuaca, jbmkg/bmkg, jnews, jshort, jspeed/jping DIHAPUS
    //   karena dobel dengan lane bot sendiri:
    //   .spotify/.weather plugins/info/05-webinfo.js, .news plugins/info/05-webinfo.js,
    //   .shortlink plugins/info/05-webinfo.js, .ping + .status plugins/bot/01-bot.js.
    // Alias "j*" lain juga dibuang supaya tiap fitur cuma punya satu nama.
    if (cmd === 'yts') {
      if (!args) { await safeReply(sock, jid, `Contoh: ${prefix}yts <kata kunci youtube>`, m); return true; }
      await interim(sock, jid, m, '🔍 Lagi search YouTube ...');
      try {
        const vids = await jereUtil.jereYts(args, 7);
        await sendLongText(sock, jid, jereUtil.formatYtsCaption(args, vids).slice(0, 3500), m); return true;
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
    }
    if (cmd === 'pin') {
      if (!args) { await safeReply(sock, jid, `Contoh: ${prefix}pin <kata kunci pinterest>`, m); return true; }
      await interim(sock, jid, m, '📌 Lagi search Pinterest ...');
      try {
        const pins = await jereUtil.jerePinSearch(args, 5);
        const img = jereUtil.pickFirstImageUrl ? jereUtil.pickFirstImageUrl(pins) : '';
        if (img) {
          await sock.sendMessage(jid, { image: { url: img }, caption: `📌 Pinterest: ${args.slice(0, 150)}` }, { quoted: m });
          return true;
        }
        await sendLongText(sock, jid, `📌 *Pinterest: ${args}*\n\n${JSON.stringify(pins.slice(0, 3), null, 2).slice(0, 3000)}`, m); return true;
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
    }
    if (cmd === 'wallpaper') {
      if (!args) { await safeReply(sock, jid, `Contoh: ${prefix}wallpaper anime`, m); return true; }
      await interim(sock, jid, m, '🖼️ Lagi cari wallpaper ...');
      try {
        const w = await jereUtil.jereWallpaper(args);
        const u = typeof w === 'string' ? w : (w.url || w.image || w.thumbnail || '');
        if (!u) throw new Error('Wallpaper tidak ditemukan.');
        await sock.sendMessage(jid, { image: { url: u }, caption: `🖼️ Wallpaper: ${args.slice(0, 150)}` }, { quoted: m });
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
      return true;
    }
    if (cmd === 'libur') {
      await interim(sock, jid, m, '🗓️ Lagi cek hari libur ...');
      try {
        const r = await jereUtil.jereHariLibur(args || String(new Date().getFullYear()));
        await sendLongText(sock, jid, jereUtil.formatHariLiburCaption(r.tahun, r.total, r.list).slice(0, 3500), m); return true;
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
    }
    if (cmd === 'style') {
      if (!args) { await safeReply(sock, jid, `Contoh: ${prefix}style halo dunia`, m); return true; }
      try {
        const styles = jereUtil.styleTextLocal(args, 12);
        await safeReply(sock, jid, jereUtil.formatStyleTextCaption(styles).slice(0, 3500), m); return true;
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, `❌ ${String(e?.message || 'Gagal style teks.').slice(0, 200)}`, m); return true;
      }
    }
    if (cmd === 'genius') {
      if (!args) { await safeReply(sock, jid, `Contoh: ${prefix}genius <judul lagu>`, m); return true; }
      await interim(sock, jid, m, '🎵 Lagi cari di Genius ...');
      try {
        const songs = await jereUtil.jereGenius(args, 5);
        const txt = jereUtil.formatGeniusCaption ? jereUtil.formatGeniusCaption(args, songs) : JSON.stringify(songs).slice(0, 3000);
        await sendLongText(sock, jid, String(txt).slice(0, 3500), m); return true;
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
    }
    if (cmd === 'mlbb') {
      if (!args) { await safeReply(sock, jid, `Contoh: ${prefix}mlbb fanny`, m); return true; }
      await interim(sock, jid, m, '⚔️ Lagi ambil build MLBB ...');
      try {
        const build = await jereUtil.jereMlbbBuild(args);
        await sendLongText(sock, jid, jereUtil.formatMlbbBuildCaption(build).slice(0, 3500), m); return true;
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
    }
    if (cmd === 'mlbbtier') {
      await interim(sock, jid, m, '⚔️ Lagi ambil tier MLBB ...');
      try {
        const tier = await jereUtil.jereMlbbTier();
        const top = (Array.isArray(tier) ? tier : []).slice(0, 15).map((h, i) => `${i + 1}. ${h.hero_name || h.hero || h.name || '-'} — Tier ${h.tier || '-'}`).join('\n');
        await safeReply(sock, jid, `⚔️ *MLBB Tier (top 15)*\n\n${top || '-'}`, m); return true;
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
    }
    if (cmd === 'ff') {
      if (!args) { await safeReply(sock, jid, `Contoh: ${prefix}ff 417262746`, m); return true; }
      await interim(sock, jid, m, '🎮 Lagi stalk FF ...');
      try {
        const p = await jereUtil.jereFfStalk(args);
        await sendLongText(sock, jid, jereUtil.formatFfStalkCaption(p, String(args).replace(/[^0-9]/g, '')).slice(0, 3500), m); return true;
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
    }
    if (cmd === 'os') {
      try {
        const info = jereUtil.collectOsInfo ? jereUtil.collectOsInfo() : null;
        const cap = jereUtil.formatOsCaption ? jereUtil.formatOsCaption(info) : '💻 Info server tidak tersedia.';
        await sendLongText(sock, jid, String(cap).slice(0, 3500), m); return true;
      } catch (e) {
        await safeReply(sock, jid, '❌ Gagal ambil info server.', m); return true;
      }
    }
    // Owner aman saja (eval/exec/restart TIDAK di-wiring; spam TIDAK ada di lib).
    if (cmd === 'backup') {
      if (!isOwner(sender, jid)) { await safeReply(sock, jid, '🔒 Khusus owner ya.', m); return true; }
      try {
        const dir = path.join(__dirname, '..', 'database');
        let files = [];
        try { files = fs.readdirSync(dir); } catch { files = []; }
        let totalBytes = 0;
        const rows = [];
        for (const f of files.slice(0, 20)) {
          try {
            const st = fs.statSync(path.join(dir, f));
            totalBytes += st.size;
            rows.push(`• ${f} (${(st.size / 1024).toFixed(1)} KB)`);
          } catch {}
        }
        const name = jereUtil.buildBackupDbFileName ? jereUtil.buildBackupDbFileName('database') : `database-${Date.now()}.json`;
        await safeReply(sock, jid, `💾 *Backup DB (ringkasan)*\n📄 Nama: ${name}\n📊 Total: ${(totalBytes / 1024).toFixed(1)} KB\n${rows.join('\n') || '(database kosong)'}`, m); return true;
      } catch (e) {
        await safeReply(sock, jid, `❌ ${String(e?.message || 'Gagal backup.').slice(0, 200)}`, m); return true;
      }
    }
    if (cmd === 'plugins') {
      if (!isOwner(sender, jid)) { await safeReply(sock, jid, '🔒 Khusus owner ya.', m); return true; }
      try {
        const pluginsDir = path.join(__dirname, '..', 'src', 'commands');
        if (args) {
          const content = jereUtil.readPluginFile(pluginsDir, args);
          await sendLongText(sock, jid, `📄 *${args}*\n\n${String(content).slice(0, 3400)}`, m); return true;
        }
        const files = jereUtil.listPluginFiles(pluginsDir);
        await sendLongText(sock, jid, jereUtil.formatPluginListCaption(files.slice(0, 50)).slice(0, 3500), m); return true;
      } catch (e) {
        await safeReply(sock, jid, `❌ ${String(e?.message || 'Gagal baca plugin.').slice(0, 200)}`, m); return true;
      }
    }
    if (cmd === 'join') {
      if (!isOwner(sender, jid)) { await safeReply(sock, jid, '🔒 Khusus owner ya.', m); return true; }
      if (!args) { await safeReply(sock, jid, `Contoh: ${prefix}join <link invite grup>`, m); return true; }
      try {
        const code = jereUtil.parseJoinInviteCode(args);
        await sock.groupAcceptInvite(code);
        await safeReply(sock, jid, '✅ Bot berhasil join grup!', m); return true;
      } catch (e) {
        await safeReply(sock, jid, `❌ Gagal join: ${String(e?.message || 'link salah/kadaluarsa.').slice(0, 200)}`, m); return true;
      }
    }

  return false;
}

module.exports = { handleJereUtil };
