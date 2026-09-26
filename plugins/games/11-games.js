// handlers/games.js â€” RPG dash (broad-match, disjoint) + MINI-GAME ttt/kuis/jawab (jawab gabungan lokal+Jere spt asli)
// Diekstrak verbatim dari handlers/messages.js; tanpa perubahan perilaku.
// Dipanggil router handlers/messages.js sesuai urutan asli. Return true = tertangani.
const S = require('../../handlers/state');
const {
  isDashCommand,
  handleDash,
  games,
  quizSessions,
  jereFun,
  jereQuizSessions,
  scopeKey,
  mapSetCapped,
  safeReply,
} = S;

async function handleGames(ctx) {
  const { sock, m, jid, isGroup, sender, body, cmd, args, prefix, start, unwrapped } = ctx;
    // ---------- LANE DASH (lib/dash.js â€” SIG/CERT via env apa adanya) ----------
    if (isDashCommand(cmd)) {
      await handleDash(sock, jid, m, args); return true;
    }

    // ---------- LANE MINI-GAME (lib/games.js, offline) ----------
    if (cmd === 'ttt' || cmd === 'tictactoe') {
      try {
        const id = scopeKey(jid, sender);
        const sub = String(args || '').trim().toLowerCase();
        if (!sub || sub === 'new' || sub === 'start' || sub === 'mulai') {
          games.newGame(id);
          await safeReply(
            sock, jid,
            `â­• *TicTacToe* (kamu âŒ, bot â­•)\n${games.renderText(id)}\n\nKetik ${prefix}ttt <1-9> untuk jalan, ${prefix}ttt nyerah untuk menyerah.`,
            m
          ); return true;
        }
        if (sub === 'nyerah' || sub === 'surrender' || sub === 'stop' || sub === 'end') {
          if (!games.getGame(id)) {
            await safeReply(sock, jid, `Belum ada game. Mulai dulu pakai ${prefix}ttt`, m); return true;
          }
          games.endGame(id);
          await safeReply(sock, jid, `ðŸ³ï¸ Kamu menyerah, bot menang! Main lagi pakai ${prefix}ttt`, m); return true;
        }
        const pos = Number(sub);
        if (!Number.isInteger(pos) || pos < 1 || pos > 9) {
          await safeReply(sock, jid, `Contoh: ${prefix}ttt new lalu ${prefix}ttt 5 (posisi 1-9).`, m); return true;
        }
        if (!games.getGame(id)) games.newGame(id);
        const r = games.move(id, pos, 'X');
        if (!r.ok) {
          const msg = r.reason === 'occupied'
            ? `âŒ Kotak ${pos} sudah terisi, pilih nomor lain.\n${games.renderText(id)}`
            : `âŒ Langkah tidak valid.\n${games.renderText(id)}`;
          await safeReply(sock, jid, msg, m); return true;
        }
        let st = games.checkWin(id);
        if (st.winner === 'X') {
          const b = games.renderText(id);
          games.endGame(id);
          await safeReply(sock, jid, `ðŸŽ‰ Kamu menang!\n${b}\n\nMain lagi pakai ${prefix}ttt`, m); return true;
        }
        if (st.winner === 'D') {
          const b = games.renderText(id);
          games.endGame(id);
          await safeReply(sock, jid, `ðŸ¤ Seri!\n${b}\n\nMain lagi pakai ${prefix}ttt`, m); return true;
        }
        games.botMove(id, { bot: 'O' });
        st = games.checkWin(id);
        const board = games.renderText(id);
        if (st.winner === 'O') {
          games.endGame(id);
          await safeReply(sock, jid, `ðŸ¤– Bot menang!\n${board}\n\nMain lagi pakai ${prefix}ttt`, m); return true;
        }
        if (st.winner === 'D') {
          games.endGame(id);
          await safeReply(sock, jid, `ðŸ¤ Seri!\n${board}\n\nMain lagi pakai ${prefix}ttt`, m); return true;
        }
        await safeReply(sock, jid, `${board}\n\nGiliranmu! Ketik ${prefix}ttt <1-9>`, m); return true;
      } catch (e) {
        console.error('ttt', e?.message || e);
        await safeReply(sock, jid, 'âŒ Game error. Mulai ulang pakai .ttt ya.', m); return true;
      }
    }
    if (cmd === 'kuis' || cmd === 'quiz') {
      try {
        const cats = games.listCategories();
        const cat = String(args || '').trim().toLowerCase() || 'caklontong';
        let q;
        try {
          q = games.randomQuiz(cat);
        } catch {
          await safeReply(sock, jid, `âŒ Kategori tidak ada. Pilihan: ${cats.join(', ') || '-'}\nContoh: ${prefix}kuis caklontong`, m); return true;
        }
        mapSetCapped(quizSessions, scopeKey(jid, sender), { jawaban: q.jawaban, kategori: q.kategori, soal: q.soal });
        await safeReply(sock, jid, `â“ *Kuis [${q.kategori}]*\n${q.soal}\n\nJawab pakai ${prefix}jawab <teks>`, m); return true;
      } catch (e) {
        console.error('kuis', e?.message || e);
        await safeReply(sock, jid, 'âŒ Gagal ambil soal. Coba lagi ya.', m); return true;
      }
    }
    if (cmd === 'jawab') {
      try {
        if (!args) {
          await safeReply(sock, jid, `Contoh: ${prefix}jawab <jawabanmu>`, m); return true;
        }
        // 1) Sesi kuis lokal dulu (lib/games.js) â€” perilaku lama dipertahankan.
        const s = quizSessions.get(scopeKey(jid, sender));
        if (s) {
          const r = games.checkAnswer(s.jawaban, args);
          if (r.correct) {
            quizSessions.delete(scopeKey(jid, sender));
            await safeReply(sock, jid, `âœ… Benar! Jawabannya: *${r.expected}*\n\nSoal baru? Ketik ${prefix}kuis`, m); return true;
          }
          await safeReply(sock, jid, `âŒ Kurang tepat, coba lagi! (jawab pakai ${prefix}jawab <teks>)`, m); return true;
        }
        // 2) Sesi kuis Jere terpisah (lib/jere-fun.js) â€” tidak bentrok dengan kuis lokal.
        const js = jereQuizSessions.get(scopeKey(jid, sender));
        if (js) {
          const r = jereFun.checkJawaban(args, js.jawabanList && js.jawabanList.length ? js.jawabanList : js.jawaban);
          if (r.surrender) {
            jereQuizSessions.delete(scopeKey(jid, sender));
            await safeReply(sock, jid, `ðŸ³ï¸ Menyerah! Jawabannya: *${jereFun.formatJawaban(js.jawabanList && js.jawabanList.length ? js.jawabanList : js.jawaban)}*\n\nSoal baru? Ketik ${prefix}jkuis ${js.game || ''}`.trim(), m); return true;
          }
          if (r.correct) {
            jereQuizSessions.delete(scopeKey(jid, sender));
            await safeReply(sock, jid, `âœ… Benar! Jawabannya: *${jereFun.formatJawaban(js.jawabanList && js.jawabanList.length ? js.jawabanList : js.jawaban)}*\n\nSoal baru? Ketik ${prefix}jkuis ${js.game || ''}`.trim(), m); return true;
          }
          if (r.close) {
            await safeReply(sock, jid, `ðŸ˜¿ Dikit lagi! Coba lagi ya (jawab pakai ${prefix}jawab <teks>, atau ${prefix}jawab nyerah untuk menyerah).`, m); return true;
          }
          await safeReply(sock, jid, `âŒ Kurang tepat, coba lagi! (jawab pakai ${prefix}jawab <teks>)`, m); return true;
        }
        await safeReply(sock, jid, `Belum ada soal aktif. Mulai dulu pakai ${prefix}kuis atau ${prefix}jkuis <game>`, m); return true;
      } catch (e) {
        console.error('jawab', e?.message || e);
        await safeReply(sock, jid, 'âŒ Gagal cek jawaban. Coba lagi ya.', m); return true;
      }
    }

  return false;
}

module.exports = { handleGames };
