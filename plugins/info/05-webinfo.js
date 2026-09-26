// handlers/webinfo.js — WEB & INFO + API PUBLIK gratis + FREEINFO
// Diekstrak verbatim dari handlers/messages.js; tanpa perubahan perilaku.
// Dipanggil router handlers/messages.js sesuai urutan asli. Return true = tertangani.
const S = require('../../handlers/state');
const {
  chatAI,
  pushMessage,
  buildContextPrompt,
  ddgSearch,
  googleNews,
  getWeather,
  getLocalTime,
  wikiSummary,
  publicApi,
  freeInfo,
  sendLongText,
  safeReply,
  interim,
} = S;

async function handleWebinfo(ctx) {
  const { sock, m, jid, isGroup, sender, body, cmd, args, prefix, start, unwrapped } = ctx;
    // ---------- 3. WEB & INFO ----------
    if (cmd === 'search') {
      if (!args) {
        await safeReply(sock, jid, `Contoh: ${prefix}search resep rendang`, m); return true;
      }
      await interim(sock, jid, m, '🔎 Lagi cari di web...');
      // Tahap 1: Wikipedia
      try {
        const w = await wikiSummary(args);
        const out = `📖 *${w.title}*\n${w.extract}${w.url ? `\n🔗 ${w.url}` : ''}`;
        pushMessage(jid, 'user', '.search ' + args);
        pushMessage(jid, 'bot', out.slice(0, 2000));
        await safeReply(sock, jid, `🔎 *Hasil "${args}" (Wikipedia):*\n\n${out}`, m); return true;
      } catch (e) {
        console.error('search-wiki', e?.message || e);
      }
      // Tahap 2: DuckDuckGo
      try {
        const r = await ddgSearch(args);
        const lines = [];
        if (r.abstract) lines.push(`📖 ${r.abstract}`);
        r.topics.forEach((t, i) => lines.push(`${i + 1}. ${t.text}${t.url ? `\n   🔗 ${t.url}` : ''}`));
        if (lines.length === 0) throw new Error('kosong');
        pushMessage(jid, 'user', '.search ' + args);
        pushMessage(jid, 'bot', lines.join('\n\n').slice(0, 2000));
        await safeReply(sock, jid, `🔎 *Hasil "${args}":*\n\n${lines.join('\n\n')}`, m); return true;
      } catch (e) {
        console.error('search', e?.message || e);
      }
      // Tahap 3: AI fallback — jangan pernah balas "web kosong" tanpa jawaban
      try {
        const fb = await chatAI(
          buildContextPrompt(jid, `Jawab berdasarkan pengetahuanmu, awali dengan _(info web tidak tersedia)_: ${args}`)
        );
        pushMessage(jid, 'user', '.search ' + args);
        pushMessage(jid, 'bot', fb);
        await safeReply(sock, jid, fb, m); return true;
      } catch (e) {
        console.error('search', e?.message || e);
        await safeReply(sock, jid, '❌ Pencarian gagal total. Coba kata kunci lain ya.', m); return true;
      }
    }
    if (cmd === 'news' || cmd === 'berita') {
      if (!args) {
        await safeReply(sock, jid, `Contoh: ${prefix}news timnas indonesia`, m); return true;
      }
      await interim(sock, jid, m, '📰 Lagi ambil berita...');
      try {
        const list = await googleNews(args);
        if (list.length === 0) throw new Error('kosong');
        const out = list
          .map((n, i) => `${i + 1}. *${n.title}*\n   🗓️ ${n.pubDate}${n.link ? `\n   🔗 ${n.link}` : ''}`)
          .join('\n\n');
        pushMessage(jid, 'user', '.news ' + args);
        pushMessage(jid, 'bot', out.slice(0, 2000));
        await safeReply(sock, jid, `📰 *Berita "${args}":*\n\n${out}`, m); return true;
      } catch (e) {
        console.error('news', e?.message || e);
        await safeReply(sock, jid, '❌ Gagal ambil berita. Coba topik lain / ulangi sebentar lagi.', m); return true;
      }
    }
    if (cmd === 'weather' || cmd === 'cuaca') {
      if (!args) {
        await safeReply(sock, jid, `Contoh: ${prefix}weather Bandung`, m); return true;
      }
      try {
        const w = await getWeather(args);
        await safeReply(
          sock, jid,
          `🌤️ *Cuaca ${w.name}${w.country ? ', ' + w.country : ''}*\n` +
          `Kondisi: ${w.desc}\n🌡️ Suhu: ${w.temp}°C (min ${w.min}°C / max ${w.max}°C)\n💧 Kelembapan: ${w.humidity}%\n💨 Angin: ${w.wind} km/jam`,
          m
        ); return true;
      } catch (e) {
        console.error('weather', e?.message || e);
        const msg = String((e && e.message) || '');
        if (msg.includes('tidak ditemukan')) {
          await safeReply(sock, jid, `❌ Kota "${args}" tidak ditemukan. Coba nama kota lain ya.`, m); return true;
        }
        await safeReply(sock, jid, '❌ Gagal ambil cuaca. Coba lagi sebentar ya.', m); return true;
      }
    }
    if (cmd === 'time' || cmd === 'jam') {
      if (!args) {
        await safeReply(sock, jid, `Contoh: ${prefix}time Tokyo`, m); return true;
      }
      try {
        const t = await getLocalTime(args);
        if (!t) {
          const fb = await chatAI(`Pengguna tanya jam di "${args}" tapi kotanya tidak ada di daftarku. Jawab semampumu dari pengetahuanmu: sekarang jam berapa di ${args}?`);
          await safeReply(sock, jid, `${fb}`, m); return true;
        }
        const d = new Date(t.datetime);
        const str = t.str || (isNaN(d.getTime())
          ? t.datetime
          : d.toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' }));
        await safeReply(sock, jid, `🕒 *Waktu di ${args}*\n${str}\n(${t.zone}${t.abbrev ? ' • ' + t.abbrev : ''})`, m); return true;
      } catch (e) {
        console.error('time', e?.message || e);
        await safeReply(sock, jid, '❌ Gagal ambil waktu. Coba lagi sebentar ya.', m); return true;
      }
    }

    // ---------- LANE API PUBLIK GRATIS (tanpa key) ----------
    if (cmd === 'aio' || cmd === 'spotify' || cmd === 'gdrive' || cmd === 'deepsearch') {
      if (!args) {
        const examples = {
          aio: 'Contoh: .aio https://www.youtube.com/watch?v=VIDEO_ID',
          spotify: 'Contoh: .spotify https://open.spotify.com/track/TRACK_ID',
          gdrive: 'Contoh: .gdrive https://drive.google.com/file/d/FILE_ID/view',
          deepsearch: 'Contoh: .deepsearch faktor yang memengaruhi GraduationRate',
        };
        await safeReply(sock, jid, examples[cmd] || `Contoh: ${prefix}${cmd} <argumen>`, m); return true;
      }
      const labels = { aio: '⬇️', spotify: '🎵', gdrive: '📁', deepsearch: '🔎' };
      await interim(sock, jid, m, `${labels[cmd]} Memproses lewat API publik gratis...`);
      try {
        if (cmd === 'deepsearch') {
          const result = await publicApi.deepSearch(args);
          await sendLongText(sock, jid, `🔎 *Deep Search*\n\n${String(result || 'Tidak ada hasil.')}`, m); return true;
        }
        if (cmd === 'spotify') {
          const result = await publicApi.spotify(args);
          await sock.sendMessage(jid, { audio: { url: result.url }, mimetype: 'audio/mpeg', caption: `🎵 ${result.title || 'Spotify'}${result.artist ? ` — ${result.artist}` : ''}` }, { quoted: m }); return true;
        }
        if (cmd === 'gdrive') {
          const result = await publicApi.googleDrive(args);
          await sock.sendMessage(jid, { document: { url: result.url }, fileName: result.name || 'google-drive-file', mimetype: 'application/octet-stream', caption: `📁 ${result.name || 'File Google Drive'}` }, { quoted: m }); return true;
        }
        const result = await publicApi.aio(args);
        const media = result.media;
        const caption = result.title ? `🎬 ${result.title}` : '🎬 Hasil download';
        await sock.sendMessage(jid, { video: { url: media.url }, mimetype: media.mimeType || 'video/mp4', caption }, { quoted: m }); return true;
      } catch (e) {
        console.error(`[public-api:${cmd}]`, e?.message || e);
        await safeReply(sock, jid, `❌ ${e?.message || 'API publik sedang tidak tersedia.'}`, m); return true;
      }
    }

    // ---------- LANE FREEINFO (lib/freeinfo.js) ----------
    // 'adwalsholat' = jaring pengaman typo (dulu pernah muncul di menu lokal
    // hasil penyederhanaan awalan 'j' yang salah -> "jadwalsholat" jadi
    // "adwalsholat"). Tetap diarahkan ke perintah yang benar.
    if (cmd === 'jadwalsholat' || cmd === 'sholat' || cmd === 'adwalsholat') {
      await freeInfo.handleSholat(sock, jid, m, args); return true;
    }
    if (cmd === 'quran' || cmd === 'alquran') {
      await freeInfo.handleQuran(sock, jid, m, args); return true;
    }
    if (cmd === 'gempa' || cmd === 'infogempa') {
      await freeInfo.handleGempa(sock, jid, m); return true;
    }
    if (cmd === 'lirik' || cmd === 'lyrics') {
      await freeInfo.handleLirik(sock, jid, m, args); return true;
    }
    if (cmd === 'shortlink' || cmd === 'short' || cmd === 'shorturl') {
      await freeInfo.handleShortlink(sock, jid, m, args); return true;
    }
    if (cmd === 'kbbi') {
      await freeInfo.handleKbbi(sock, jid, m, args); return true;
    }

  return false;
}

module.exports = { handleWebinfo };
