// handlers/messages.js — router tipis: preamble (guard/VN/dokumen/freechat) + delegasi kategori.
// Direfaktor dari monolit tanpa perubahan perilaku: state & helper di ./state, menu di ./menu,
// perintah per kategori di ./<kategori>.js. Urutan pengecekan dipertahankan.
const config = require('../config');
const S = require('./state');
const {
  chatAI,
  pushMessage,
  buildContextPrompt,
  downloadBuffer,
  unwrapMessage,
  extractDocText,
  groupLane,
  systems,
  registry,
  trySafety,
  tryNewRouter,
  lastDoc,
  scopeKey,
  sessionStyle,
  withTalkFlag,
  mapSetCapped,
  MAX_DOCUMENT_CHUNKS,
  chunkDocument,
  summarizeDocument,
  sendLongText,
  extractText,
  getSender,
  getMentionList,
  isMentionToBot,
  safeReply,
  interim,
  withTimeout,
  handleVN,
} = S;
const { menuText } = require('./menu');
const { loadPlugins } = require('../lib/plugin-loader');

// Plugin di plugins/<tema>/ dimuat otomatis oleh lib/plugin-loader.js.
// CARA TAMBAH COMMAND:taruh file .js baru di plugins/<tema>/, export handler
//   (module.exports = { handleX } atau module.exports = fn), lalu selesai —
//   router di bawah akan otomatis memanggilnya. Urutan = nama file (01-, 02-, ...).
// Kontrak handler: async (ctx) => true bila pesan sudah ditangani.
const plugins = loadPlugins();

async function handleMessage(sock, m) {
  try {
    if (!m?.message || m.key?.fromMe) return;
    const jid = m.key.remoteJid;
    const isGroup = jid.endsWith('@g.us');
    const raw = extractText(m);
    const unwrapped = unwrapMessage(m.message || {}) || {};
    const isDocMsg = !!unwrapped?.documentMessage;
    const audioMeta = unwrapped?.audioMessage;
    const isAudioMsg = !!audioMeta;
    if (!raw && !isDocMsg && !isAudioMsg) return;

    // VN polos di PRIVATE otomatis transkrip + jawab (grup wajib .vn eksplisit).
    // Di atas sebelum guard body kosong: VN polos body='' harus tetap diproses.
    if (!isGroup && audioMeta) {
      const capHasPrefix = String(raw || '').trim().startsWith(config.PREFIX);
      if (!capHasPrefix && !isMentionToBot(m, sock)) {
        await sock.sendPresenceUpdate('composing', jid).catch(() => {});
        return await handleVN(sock, jid, m, m, audioMeta);
      }
    }

    const prefix = config.PREFIX;
    const hasPrefix = raw.startsWith(prefix);
    const mentioned = isMentionToBot(m, sock);

    // ---------- FASE 2 SAFETY: anti-flood/anti-link/mute SEBELUM router (toleran-gagal) ----------
    // Wajib SEBELUM early-return grup non-prefix di bawah agar spam teks biasa ikut dicek.
    // trySafety true -> pesan sudah ditangani (hapus/warn), stop di sini.
    try {
      if (isGroup && trySafety && await trySafety(sock, m, { jid, sender: getSender(m), text: raw })) return;
    } catch (e) {
      console.error('[safety]', e?.message || e);
    }

    // Grup: hanya respon jika prefix / mention bot (dokumen ikut aturan yang sama)
    if (isGroup && !hasPrefix && !mentioned) {
      if (!isDocMsg) return;
      const cap = unwrapped?.documentMessage?.caption || '';
      if (!cap.startsWith(prefix)) return;
    }

    // Strip prefix; di grup tanpa prefix tapi mention -> pakai raw
    let body = hasPrefix ? raw.slice(prefix.length).trim() : raw.trim();
    // Bersihkan mention "@bot" di awal body (jika via mention tanpa prefix)
    body = body.replace(/^@\S+\s+/, '').trim();
    // Grup mention+prefix ganda ("@bot .ai halo"): strip prefix sekali lagi
    if (body.startsWith(prefix)) body = body.slice(prefix.length).trim();
    if (!body) return;

    const parts = body.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ').trim();

    const sender = getSender(m);
    const start = Date.now(); // untuk .ping (RTT)

    await sock.sendPresenceUpdate('composing', jid).catch(() => {});

    // ---------- FASE 1 ROUTER: registry baru dulu, fallback handler lama ----------
    // Hanya prefix [. ! #] + command terdaftar yang diambil alih; sisanya jatuh ke logika lama.
    try {
      if (await tryNewRouter(sock, m, jid, isGroup, sender, raw)) return;
    } catch (e) {
      console.error('[router]', e?.message || e);
    }

    // ---------- XP OTOMATIS 5-10 per pesan (non-fatal, tak ganggu flow AI) ----------
    try {
      const lv = systems.addXp(sender, 5 + Math.floor(Math.random() * 6));
      if (lv && lv.leveledUp) {
        await sock.sendMessage(
          jid,
          { text: `🎉 @${String(sender).split('@')[0]} naik ke *Lv.${lv.level}!*`, mentions: [String(sender)] },
          { quoted: m }
        ).catch(() => {});
      }
    } catch {}

    // ---------- AUTO-MODERASI GRUP: AFK / antilink / badword (non-fatal) ----------
    // Dilewati untuk command (ber-prefix) agar .badword/.linkgc tak kena hapus.
    if (isGroup && !hasPrefix) {
      try {
        // AFK: pengirim kembali → hapus status + kabari.
        if (systems.getAfk(sender)) {
          systems.clearAfk(sender);
          await sock.sendMessage(
            jid,
            { text: `👋 @${String(sender).split('@')[0]} sudah kembali dari AFK.` },
            { quoted: m }
          ).catch(() => {});
        }
        // AFK: mention user yang sedang AFK → notifikasi.
        const afkHit = systems.checkAfk(getMentionList(m));
        if (afkHit.length) {
          const lines = afkHit.map((a) => `• @${String(a.id).split('@')[0]} AFK: ${a.reason}`).join('\n');
          await sock.sendMessage(jid, { text: `💤 *AFK:*\n${lines}` }, { quoted: m }).catch(() => {});
        }
        // Antilink + badword: lewati admin grup.
        let senderIsAdmin = false;
        try {
          senderIsAdmin = await groupLane.isAdmin(sock, jid, sender);
        } catch {}
        if (!senderIsAdmin) {
          if (systems.isAntilinkOn(jid) && systems.containsInviteLink(raw)) {
            try {
              await sock.sendMessage(jid, { delete: m.key }).catch(() => {});
            } catch {}
            await safeReply(sock, jid, `🔗 @${String(sender).split('@')[0]} link invite grup tidak diizinkan di sini!`, m);
            return;
          }
          const bw = systems.containsBadword(raw);
          if (bw) {
            try {
              await sock.sendMessage(jid, { delete: m.key }).catch(() => {});
            } catch {}
            await safeReply(sock, jid, `🚫 Kata "${bw}" tidak diizinkan di grup ini!`, m);
            return;
          }
        }
      } catch {}
    }

    // ---------- FILE: dokumen otomatis (pdf/docx/txt, max ~5MB) ----------
    if (isDocMsg) {
      const doc = unwrapped.documentMessage;
      const fileLen = Number(doc.fileLength || 0);
      if (fileLen > 5 * 1024 * 1024) {
        return await safeReply(sock, jid, '❌ File terlalu besar (max ~5MB). Kirim file yang lebih kecil ya.', m);
      }
      const dName = String(doc.fileName || '').toLowerCase();
      const dMime = String(doc.mimetype || '').toLowerCase();
      const dOk =
        dName.endsWith('.pdf') || dName.endsWith('.docx') || dName.endsWith('.txt') ||
        dMime.includes('pdf') || dMime.includes('officedocument.wordprocessingml') ||
        dMime === 'text/plain' || dMime.startsWith('text/plain;');
      if (!dOk) {
        return await safeReply(sock, jid, '❌ Format tidak didukung. Kirim file .pdf / .docx / .txt ya (max 5MB). File .doc lama belum didukung — save as .docx dulu.', m);
      }
      try {
        await interim(sock, jid, m, '📄 Dokumen diterima, lagi dibaca...');
        const buf = await withTimeout(downloadBuffer(m, sock), 15000, 'Download dokumen');
        if (buf.length > 5 * 1024 * 1024) {
          return await safeReply(sock, jid, '❌ File terlalu besar (max ~5MB). Kirim file yang lebih kecil ya.', m);
        }
        const text = await extractDocText(buf, doc.fileName || '', doc.mimetype || '');
        const isPdfFile = dName.endsWith('.pdf') || dMime.includes('pdf');
        if ((!text || text.length < 20) && isPdfFile) {
          // PDF scan/foto: hemat token, jangan panggil AI — arahkan ke .ai vision
          return await safeReply(sock, jid, '📄 File ini kayaknya hasil scan/foto (tidak ada teks terbaca). Kirim foto halamannya langsung ke chat + caption .ai ya, nanti aku bacakan.', m);
        }
        if (!text || text.length < 20) {
          return await safeReply(sock, jid, '❌ Gagal membaca isi dokumen. Pastikan file PDF/DOCX/TXT tidak kosong/rusak.', m);
        }
        mapSetCapped(lastDoc, scopeKey(jid, sender), { name: doc.fileName || 'dokumen', text, at: Date.now() });
        if (chunkDocument(text).length > MAX_DOCUMENT_CHUNKS) {
          return await safeReply(sock, jid, `📄 Dokumennya terlalu panjang untuk diringkas sekaligus (melebihi ${MAX_DOCUMENT_CHUNKS} bagian). Coba kirim file yang lebih pendek / bagi menjadi beberapa file ya.`, m);
        }
        await interim(sock, jid, m, '📝 Lagi membaca dan menyusun ringkasan lengkap...');
        let summary;
        try {
          summary = await summarizeDocument(text, doc.fileName || 'dokumen');
        } catch (e) {
          if (e && e.code === 'TOO_LONG') {
            return await safeReply(sock, jid, `📄 Dokumennya terlalu panjang untuk diringkas sekaligus (melebihi ${MAX_DOCUMENT_CHUNKS} bagian). Coba kirim file yang lebih pendek / bagi menjadi beberapa file ya.`, m);
          }
          console.error('doc', e?.message || e);
          return await safeReply(
            sock, jid,
            `📄 *${doc.fileName || 'Dokumen'} tersimpan!* Tapi AI sedang sibuk, coba ${prefix}summarize sebentar lagi ya.`,
            m
          );
        }
        pushMessage(jid, 'user', `[dokumen: ${doc.fileName || 'dokumen'}]`);
        pushMessage(jid, 'bot', summary);
        return await sendLongText(
          sock, jid,
          `📄 *${doc.fileName || 'Dokumen'} tersimpan!*\n\n📝 *Ringkasan:*\n${summary}\n\n_Tanya isinya pakai ${prefix}ask ..._`,
          m
        );
      } catch (e) {
        console.error('doc', e?.message || e);
        return await safeReply(sock, jid, '❌ Gagal memproses dokumen. Coba file PDF/DOCX/TXT lain (max 5MB).', m);
      }
    }

    // Private tanpa prefix/mention = chat bebas, JANGAN dianggap command
    if (!isGroup && !hasPrefix && !mentioned) {
      try {
        const prompt = buildContextPrompt(jid, withTalkFlag(jid, sender, body));
        const answer = await chatAI(prompt, undefined, undefined, sessionStyle(jid, sender) || config.STYLE);
        pushMessage(jid, 'user', body);
        pushMessage(jid, 'bot', answer);
        return await safeReply(sock, jid, answer, m);
      } catch (e) {
        console.error('freechat', e?.message || e);
        return await safeReply(
          sock, jid,
          '😢 Maaf, AI sedang sibuk. Cek GEMINI_API_KEY / GROQ_API_KEY di file .env lalu coba lagi.',
          m
        );
      }
    }
    // ---------- Router plugin (plugins/<tema>/*.js, urutan nama file) ----------
    const ctx = { sock, m, jid, isGroup, sender, body, cmd, args, prefix, start, unwrapped };
    for (const plugin of plugins) {
      try {
        if (await plugin.handler(ctx)) return;
      } catch (e) {
        console.error('[plugin]', plugin.name, e?.message || e);
      }
    }

    // Chat pribadi: teks bebas tanpa perintah -> langsung jawab AI (ikut mode curhat bila aktif)
    if (!isGroup) {
      try {
        const prompt = buildContextPrompt(jid, withTalkFlag(jid, sender, body));
        const answer = await chatAI(prompt, undefined, undefined, sessionStyle(jid, sender) || config.STYLE);
        pushMessage(jid, 'user', body);
        pushMessage(jid, 'bot', answer);
        return await safeReply(sock, jid, answer, m);
      } catch (e) {
        console.error('freechat', e?.message || e);
        return await safeReply(
          sock, jid,
          '😢 Maaf, AI sedang sibuk. Cek GEMINI_API_KEY / GROQ_API_KEY di file .env lalu coba lagi.',
          m
        );
      }
    }
  } catch (e) {
    console.error('[handler]', e?.message || e);
  }
}

// Sambutan otomatis anggota baru (welcome on/off via lib/systems.js).
// Wiring di index.js (SATU baris, di dalam startBot setelah messages.upsert):
//   sock.ev.on('group-participants.update', (u) => { handleParticipantsUpdate(sock, u).catch(() => {}); });
async function handleParticipantsUpdate(sock, update) {
  try {
    const { id, participants, action } = update || {};
    if (!id || action !== 'add' || !systems.isWelcomeOn(id)) return;
    const arr = (Array.isArray(participants) ? participants : []).map(String).filter(Boolean);
    if (!arr.length) return;
    const text =
      `👋 *Selamat datang!*\n` +
      arr.map((p) => `@${p.split('@')[0]}`).join(' ') +
      `\nJangan lupa baca rules pakai .rules ya!`;
    await sock.sendMessage(id, { text, mentions: arr });
  } catch (e) {
    console.error('[welcome]', e?.message || e);
  }
}

module.exports = { handleMessage, menuText, handleParticipantsUpdate };
