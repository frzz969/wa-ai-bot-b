// handlers/jere-dl.js â€” JERE-DL
// Diekstrak verbatim dari handlers/messages.js; tanpa perubahan perilaku.
// Dipanggil router handlers/messages.js sesuai urutan asli. Return true = tertangani.
const S = require('../../handlers/state');
const {
  jereDl,
  safeReply,
  interim,
  jereErr,
  jereFirstUrl,
} = S;

async function handleJereDl(ctx) {
  const { sock, m, jid, isGroup, sender, body, cmd, args, prefix, start, unwrapped } = ctx;
    // ===== JERE-DL (nama dl* deskriptif, tanpa tabrakan: tiktok/ytmp3/ytmp4/fbdl/igdl/spotify/aio tetap milik lane lama) =====
    if (cmd === 'dlcapcut' || cmd === 'dlmediafire' || cmd === 'dlmf' || cmd === 'dlterabox' || cmd === 'dltb' ||
        cmd === 'dlsfile' || cmd === 'dldouyin' || cmd === 'dlsnack' || cmd === 'dltwitter' || cmd === 'dlx' ||
        cmd === 'dlsound' || cmd === 'dlapple' || cmd === 'dlpin' || cmd === 'dlthreads' || cmd === 'dltele' ||
        cmd === 'dlaio' || cmd === 'dlfast' || cmd === 'dltt' || cmd === 'dlytmp3' || cmd === 'dlytmp4' ||
        cmd === 'dlig' || cmd === 'dlfb' || cmd === 'dlspot') {
      const url = jereFirstUrl(args);
      const usage = {
        dlcapcut: 'dlcapcut <link capcut>', dlmediafire: 'dlmediafire <link mediafire>', dlmf: 'dlmf <link mediafire>',
        dlterabox: 'dlterabox <link terabox>', dltb: 'dltb <link terabox>', dlsfile: 'dlsfile <link sfile>',
        dldouyin: 'dldouyin <link douyin>', dlsnack: 'dlsnack <link snackvideo>', dltwitter: 'dltwitter <link x/twitter>',
        dlx: 'dlx <link x/twitter>', dlsound: 'dlsound <link soundcloud>', dlapple: 'dlapple <link apple-music>',
        dlpin: 'dlpin <link pinterest>', dlthreads: 'dlthreads <link threads>', dltele: 'dltele <link stiker-telegram>',
        dlaio: 'dlaio <link multi-platform>', dlfast: 'dlfast <link multi-platform>', dltt: 'dltt <link tiktok>',
        dlytmp3: 'dlytmp3 <link youtube>', dlytmp4: 'dlytmp4 <link youtube>', dlig: 'dlig <link instagram>',
        dlfb: 'dlfb <link facebook>', dlspot: 'dlspot <link spotify>',
      }[cmd] || `${cmd} <link>`;
      if (!url) { await safeReply(sock, jid, `Contoh: ${prefix}${usage}`, m); return true; }
      await interim(sock, jid, m, 'â¬‡ï¸ Lagi download via Jere...');
      try {
        // --- File (kirim sebagai dokumen) ---
        if (cmd === 'dlmediafire' || cmd === 'dlmf') {
          const r = await jereDl.jereMediafire(url);
          await sock.sendMessage(jid, { document: { url: r.url }, fileName: String(r.title || 'mediafire_file').slice(0, 100), mimetype: 'application/octet-stream', caption: `ðŸ“ ${r.title || 'MediaFire'}\nðŸ“¦ ${((r.meta || {}).filesize) || '-'}` }, { quoted: m }); return true;
        }
        if (cmd === 'dlterabox' || cmd === 'dltb') {
          const r = await jereDl.jereTerabox(url);
          await sock.sendMessage(jid, { document: { url: r.url }, fileName: String(r.title || 'terabox_file').slice(0, 100), mimetype: 'application/octet-stream', caption: `ðŸ“¦ ${r.title || 'TeraBox'}\nðŸ“ ${((r.meta || {}).size) || '-'}` }, { quoted: m }); return true;
        }
        if (cmd === 'dlsfile') {
          const r = await jereDl.jereSfile(url);
          const fileUrl = r.url || r.download || r.downloadUrl || '';
          const name = r.title || r.filename || 'sfile_download';
          if (!fileUrl) throw new Error('Jere API tidak mengembalikan link file SFile.');
          await sock.sendMessage(jid, { document: { url: fileUrl }, fileName: String(name).slice(0, 100), mimetype: 'application/octet-stream', caption: `ðŸ“ ${name}` }, { quoted: m }); return true;
        }
        // --- Audio (kirim sebagai audio) ---
        if (cmd === 'dlsound') {
          const r = await jereDl.jereSoundcloud(url);
          await sock.sendMessage(jid, { audio: { url: r.url }, mimetype: 'audio/mpeg', ptt: false }, { quoted: m }); return true;
        }
        if (cmd === 'dlapple') {
          const r = await jereDl.jereAppleMusic(url);
          await sock.sendMessage(jid, { audio: { url: r.url }, mimetype: 'audio/mpeg', ptt: false }, { quoted: m }); return true;
        }
        if (cmd === 'dlytmp3') {
          const r = await jereDl.jereYtmp3(url);
          await sock.sendMessage(jid, { audio: { url: r.url }, mimetype: 'audio/mpeg', ptt: false }, { quoted: m }); return true;
        }
        if (cmd === 'dlspot') {
          const r = await jereDl.jereSpotify(url);
          await sock.sendMessage(jid, { audio: { url: r.url }, mimetype: 'audio/mpeg', ptt: false }, { quoted: m }); return true;
        }
        // --- Video generik ---
        if (cmd === 'dlcapcut') {
          const r = await jereDl.jereCapcut(url);
          await sock.sendMessage(jid, { video: { url: r.url }, mimetype: 'video/mp4', caption: `âœ‚ï¸ ${r.title || 'CapCut'}` }, { quoted: m }); return true;
        }
        if (cmd === 'dldouyin') {
          const r = await jereDl.jereDouyin(url);
          const v = r.url || r.video || r.videoUrl || r.download || '';
          if (!v) throw new Error('Jere API tidak mengembalikan link video Douyin.');
          await sock.sendMessage(jid, { video: { url: v }, mimetype: 'video/mp4', caption: `ðŸŽ¬ ${r.title || 'Douyin'}` }, { quoted: m }); return true;
        }
        if (cmd === 'dlsnack') {
          const r = await jereDl.jereSnackVideo(url);
          const v = r.url || r.video || r.download || '';
          if (!v) throw new Error('Jere API tidak mengembalikan link video SnackVideo.');
          await sock.sendMessage(jid, { video: { url: v }, mimetype: 'video/mp4', caption: `ðŸŽ¬ ${r.title || 'SnackVideo'}` }, { quoted: m }); return true;
        }
        if (cmd === 'dltwitter' || cmd === 'dlx') {
          const r = await jereDl.jereTwitter(url);
          const v = r.url || r.video || r.download || '';
          if (!v) throw new Error('Jere API tidak mengembalikan link video X/Twitter.');
          await sock.sendMessage(jid, { video: { url: v }, mimetype: 'video/mp4', caption: `ðŸ¦ ${r.title || 'X/Twitter'}` }, { quoted: m }); return true;
        }
        if (cmd === 'dlthreads') {
          const r = await jereDl.jereThreads(url);
          const list = Array.isArray(r.media) ? r.media : (r.url ? [r.url] : []);
          const first = list[0];
          const v = typeof first === 'string' ? first : (first && (first.url || first.download)) || '';
          if (!v) throw new Error('Jere API tidak mengembalikan media Threads.');
          await sock.sendMessage(jid, { video: { url: v }, mimetype: 'video/mp4', caption: `ðŸ§µ ${r.title || 'Threads'}` }, { quoted: m }); return true;
        }
        if (cmd === 'dlytmp4') {
          const r = await jereDl.jereYtmp4(url);
          await sock.sendMessage(jid, { video: { url: r.url }, mimetype: 'video/mp4', caption: `ðŸŽ¬ ${r.title || 'YouTube'}` }, { quoted: m }); return true;
        }
        if (cmd === 'dlig') {
          const r = await jereDl.jereInstagram(url);
          const u = Array.isArray(r.url) ? r.url[0] : r.url;
          if (!u) throw new Error('Jere API tidak mengembalikan media Instagram.');
          await sock.sendMessage(jid, { video: { url: u }, mimetype: 'video/mp4', caption: `ðŸ“¸ ${r.title || 'Instagram'}` }, { quoted: m }); return true;
        }
        if (cmd === 'dlfb') {
          const r = await jereDl.jereFacebook(url);
          await sock.sendMessage(jid, { video: { url: r.url }, mimetype: 'video/mp4', caption: `ðŸ“˜ ${r.title || 'Facebook'}` }, { quoted: m }); return true;
        }
        if (cmd === 'dltt') {
          const r = await jereDl.jereTiktok(url);
          if (Array.isArray(r.url)) {
            for (const img of r.url.slice(0, 5)) {
              await sock.sendMessage(jid, { image: { url: img }, caption: `ðŸŽµ ${r.title || 'TikTok'}` }, { quoted: m });
            }
            return true;
          }
          await sock.sendMessage(jid, { video: { url: r.url }, mimetype: 'video/mp4', caption: `ðŸŽµ ${r.title || 'TikTok'}` }, { quoted: m }); return true;
        }
        // --- Pinterest / Telegram / AIO generik ---
        if (cmd === 'dlpin') {
          const r = await jereDl.jerePinterest(url);
          const u = r.url || r.image || r.video || r.download || '';
          if (!u) throw new Error('Jere API tidak mengembalikan media Pinterest.');
          if (/\.(mp4|mov|webm)($|\?)/i.test(String(u))) {
            await sock.sendMessage(jid, { video: { url: u }, mimetype: 'video/mp4', caption: `ðŸ“Œ ${r.title || 'Pinterest'}` }, { quoted: m }); return true;
          }
          await sock.sendMessage(jid, { image: { url: u }, caption: `ðŸ“Œ ${r.title || 'Pinterest'}` }, { quoted: m }); return true;
        }
        if (cmd === 'dltele') {
          const r = await jereDl.jereStickerTele(url);
          const list = Array.isArray(r.stickers) ? r.stickers : (Array.isArray(r.result) ? r.result : []);
          const first = list[0] || r.url;
          const u = typeof first === 'string' ? first : (first && (first.url || first.image)) || '';
          if (!u) throw new Error('Jere API tidak mengembalikan stiker Telegram.');
          await sock.sendMessage(jid, { image: { url: u }, caption: `ðŸŽ­ Stiker Telegram: ${r.title || '-'}` }, { quoted: m }); return true;
        }
        // dlaio / dlfast
        const r = cmd === 'dlfast' ? await jereDl.jereFastDl(url) : await jereDl.jereAio(url);
        const medias = Array.isArray(r.medias) ? r.medias : (Array.isArray(r.result) ? r.result : (r.url ? [{ url: r.url }] : []));
        const first = medias[0];
        const u = typeof first === 'string' ? first : (first && (first.url || first.download)) || r.url || '';
        if (!u) throw new Error('Jere API tidak mengembalikan media.');
        if (/\.(mp3|ogg|m4a|wav)($|\?)/i.test(String(u))) {
          await sock.sendMessage(jid, { audio: { url: u }, mimetype: 'audio/mpeg', ptt: false }, { quoted: m }); return true;
        }
        await sock.sendMessage(jid, { video: { url: u }, mimetype: 'video/mp4', caption: `ðŸŽ¬ ${r.title || 'Download'}` }, { quoted: m }); return true;
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
    }

  return false;
}

module.exports = { handleJereDl };
