// handlers/jere-game.js — JERE-GAME/FUN (jawab tetap di games.js spt asli)
// Diekstrak verbatim dari handlers/messages.js; tanpa perubahan perilaku.
// Dipanggil router handlers/messages.js sesuai urutan asli. Return true = tertangani.
const S = require('../../handlers/state');
const {
  systems,
  jereFun,
  jereQuizSessions,
  scopeKey,
  mapSetCapped,
  sendLongText,
  safeReply,
  interim,
  jereErr,
} = S;

async function handleJereGame(ctx) {
  const { sock, m, jid, isGroup, sender, body, cmd, args, prefix, start, unwrapped } = ctx;
    // ===== JERE-GAME/FUN (sesi Jere terpisah; .jawab digabung di atas) =====
    if (cmd === 'jkuislist') {
      await safeReply(sock, jid, `🎮 *Kuis Jere (23):*\n${jereFun.listGames().join(', ')}\n\nContoh: ${prefix}jkuis tebakgambar`, m); return true;
    }
    if (cmd === 'jkuis' || cmd === 'jquiz') {
      const g = String(args || '').trim().split(/\s+/)[0] || '';
      if (!g) { await safeReply(sock, jid, `Contoh: ${prefix}jkuis tebakgambar\nDaftar: ${prefix}jkuislist`, m); return true; }
      await interim(sock, jid, m, '❓ Lagi ambil soal (Jere)...');
      try {
        const soal = await jereFun.fetchSoal(g);
        mapSetCapped(jereQuizSessions, scopeKey(jid, sender), soal);
        setTimeout(() => {
          const cur = jereQuizSessions.get(scopeKey(jid, sender));
          if (cur && cur === soal) jereQuizSessions.delete(scopeKey(jid, sender));
        }, jereFun.GAME_TIMEOUT_MS || 60000).unref?.();
        let txt = `❓ *Kuis Jere [${soal.game}]*\n${soal.soal}`;
        if (soal.clue) txt += `\n💡 Clue: ${soal.clue}`;
        txt += `\n\nJawab pakai ${prefix}jawab <teks> (atau ${prefix}jawab nyerah) • 60 dtk`;
        if (soal.mediaUrl && !soal.isAudio) {
          try {
            await sock.sendMessage(jid, { image: { url: soal.mediaUrl }, caption: txt }, { quoted: m });
            return true;
          } catch { /* fallback teks+audio di bawah */ }
        }
        if (soal.mediaUrl && soal.isAudio) {
          try {
            await sock.sendMessage(jid, { audio: { url: soal.mediaUrl }, mimetype: 'audio/mpeg', ptt: false }, { quoted: m });
          } catch {}
        }
        await safeReply(sock, jid, txt, m); return true;
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
    }
    if (cmd === 'primbonlist') {
      await safeReply(sock, jid, `🔮 *Primbon Jere (11):*\n${jereFun.listPrimbon().join(', ')}\n\nContoh: ${prefix}primbon artinama|Budi`, m); return true;
    }
    if (cmd === 'primbon') {
      if (!args) { await safeReply(sock, jid, `Contoh: ${prefix}primbon artinama|Budi\nDaftar: ${prefix}primbonlist`, m); return true; }
      try {
        const barIdx = String(args).indexOf('|');
        const kind = (barIdx === -1 ? String(args).split(/\s+/)[0] : String(args).slice(0, barIdx)).trim();
        const rest = (barIdx === -1 ? String(args).slice(kind.length) : String(args).slice(barIdx + 1)).trim();
        const parts = rest.split('|').map((x) => String(x || '').trim()).filter((x) => x !== '');
        const sp = rest.split(/\s+/).filter(Boolean);
        const k = String(kind || '').toLowerCase().replace(/[\s_-]+/g, '');
        let params = {};
        if (['artinama', 'nama'].includes(k)) params = { nama: rest };
        else if (['nomorhoki', 'hoki', 'nomor'].includes(k)) params = { nomor: rest.replace(/[^0-9]/g, '') };
        else if (['tafsirmimpi', 'mimpi', 'artimimpi'].includes(k)) params = { mimpi: rest };
        else if (k === 'zodiak') params = { zodiak: rest };
        else if (['kecocokannamapasangan', 'kecocokan_nama_pasangan', 'kecocokannama'].includes(k)) params = { nama1: parts[0] || sp[0] || '', nama2: parts[1] || sp.slice(1).join(' ') || '' };
        else if (['cekpotensipenyakit', 'cek_potensi_penyakit', 'potensipenyakit'].includes(k) || ['rejekihokiweton', 'rejeki_hoki_weton', 'rejekiweton'].includes(k) || ['sifatusahabisnis', 'sifat_usaha_bisnis', 'usahabisnis'].includes(k)) {
          let tgl = parts[0] || '', bln = parts[1] || '', thn = parts[2] || '';
          if (!tgl && sp.length >= 3) { tgl = sp[0]; bln = sp[1]; thn = sp[2]; }
          if (!tgl && /^\d{1,2}-\d{1,2}-\d{4}$/.test(rest)) { const a = rest.split('-'); tgl = a[0]; bln = a[1]; thn = a[2]; }
          params = { tgl, bln, thn };
        } else if (['ramalanjodoh', 'jodoh', 'ramalanjodohbali', 'jodohbali'].includes(k)) {
          params = { nama1: parts[0] || '', tgl1: parts[1] || '', bln1: parts[2] || '', thn1: parts[3] || '', nama2: parts[4] || '', tgl2: parts[5] || '', bln2: parts[6] || '', thn2: parts[7] || '' };
          if (!params.nama1) { await safeReply(sock, jid, `Contoh: ${prefix}primbon ${kind}|nama1|tgl1|bln1|thn1|nama2|tgl2|bln2|thn2`, m); return true; }
        } else {
          params = { text: rest };
        }
        await interim(sock, jid, m, '🔮 Lagi baca primbon (Jere)...');
        const r = await jereFun.primbon(kind, params);
        const out = typeof r === 'string' ? r : JSON.stringify(r, null, 2);
        await sendLongText(sock, jid, `🔮 *Primbon ${kind}*\n\n${String(out).slice(0, 3500)}`, m); return true;
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
    }
    if (cmd === 'animequotes' || cmd === 'janimeq') {
      try {
        const r = await jereFun.animequotes();
        let txt = `💬 *Anime Quotes*\n\n"${r.quote || '-'}"\n\n👤 ${r.character || '-'} • 🎬 ${r.anime || '-'}`;
        if (r.image) {
          try {
            await sock.sendMessage(jid, { image: { url: r.image }, caption: txt }, { quoted: m });
            return true;
          } catch {}
        }
        await safeReply(sock, jid, txt, m); return true;
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
    }
    if (cmd === 'fakta' || cmd === 'jfact') {
      try {
        const r = await jereFun.fakta();
        await safeReply(sock, jid, `🧠 *Fakta Unik:*\n${r.fakta}`, m); return true;
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
    }
    if (cmd === 'alkitab') {
      await interim(sock, jid, m, '📖 Lagi buka Alkitab (Jere)...');
      try {
        const r = await jereFun.alkitab(args || '');
        const out = typeof r === 'string' ? r : JSON.stringify(r, null, 2);
        await sendLongText(sock, jid, `📖 *Alkitab ${args || '—'}*\n\n${String(out).slice(0, 3500)}`, m); return true;
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, jereErr(e), m); return true;
      }
    }
    if (cmd === 'tukar') {
      try {
        const coin = systems.getBalance ? 0 : 0;
        let saldo = 0;
        try { saldo = Number(systems.getBalance(sender) ?? systems.getBalance(sender, jid) ?? 0) || 0; } catch { saldo = 0; }
        if (typeof systems.getBalance === 'function' && systems.getBalance.length >= 1) {
          try { const v = systems.getBalance(sender); if (typeof v === 'number') saldo = v; else if (v && typeof v.balance === 'number') saldo = v.balance; } catch {}
        }
        const calc = jereFun.tukarKoin(saldo, args || '');
        if (calc.needInput) { await safeReply(sock, jid, `Contoh: ${prefix}tukar 5 / ${prefix}tukar all\nKurs: ${calc.rate} koin = 1 limit • Koin kamu: ${calc.coin}`, m); return true; }
        await safeReply(sock, jid, `💱 *Tukar Koin*\n${calc.count} limit ↔ ${calc.cost} koin (kurs ${calc.rate}/limit)\nSisa koin: ${calc.sisa}\n\nCatatan: penambahan limit dilakukan manual oleh sistem economy yang aktif.`, m); return true;
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, `❌ ${String(e?.message || 'Gagal tukar koin.').slice(0, 300)}`, m); return true;
      }
    }

  return false;
}

module.exports = { handleJereGame };
