// handlers/messages.js — router tipis: preamble (guard/VN/dokumen/freechat) + delegasi kategori.
// Direfaktor dari monolit tanpa perubahan perilaku: state & helper di ./state, menu di ./menu,
// perintah per kategori di ./<kategori>.js. Urutan pengecekan dipertahankan.
const config = require('../config');
const S = require('./state');
const { chatAIWithTools } = require('../lib/ai');
const capabilities = require('../lib/capabilities');
const toolRouter = require('../lib/tool-router');
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
  setSummary,
  getMentionList,
  isMentionToBot,
  safeReply,
  interim,
  withTimeout,
  handleVN,
} = S;
const { menuText } = require('./menu');
const { loadPlugins } = require('../lib/plugin-loader');
// Fase 2A (C1): guard ban/rate-limit untuk command yang tidak lewat registry baru.
// tryNewRouter sudah menjalankan pipeline penuh untuk 13 command registry-nya;
// guard di bawah HANYA dipakai untuk command yang jatuh ke plugin loop.
const guards = require('../src/guards');

// Plugin di plugins/<tema>/ dimuat otomatis oleh lib/plugin-loader.js.
// CARA TAMBAH COMMAND:taruh file .js baru di plugins/<tema>/, export handler
//   (module.exports = { handleX } atau module.exports = fn), lalu selesai —
//   router di bawah akan otomatis memanggilnya. Urutan = nama file (01-, 02-, ...).
// Kontrak handler: async (ctx) => true bila pesan sudah ditangani.
const plugins = loadPlugins();

// ================= FASE 5: natural-language -> tool -> plugin =================

// System prompt tambahan yang mengajarkan AI memakai tool `sonezz_run`.
// Dipakai HANYA di freechat private; jalur grup/command tidak berubah.
const TOOL_SYSTEM_PROMPT =
  'Kamu bisa menjalankan fitur bot WhatsApp lewat tool `sonezz_run`. ' +
  'Gunakan tool bila user meminta aksi konkret: download, buat stiker, cari info, ' +
  'main game, cek saldo, dan sejenisnya. Jangan mengarang command — hanya pakai ' +
  'command yang ada di daftar tool. Bila parameter penting kurang (mis. nama lagu, ' +
  'link, atau target), tanya user dulu lewat jawaban teks biasa, jangan panggil tool. ' +
  'Untuk pertanyaan/ngobrol biasa, jawab seperti biasa tanpa tool. ' +
  'Selalu jawab dalam Bahasa Indonesia yang santai dan singkat.';

// Jalankan plugin loop yang SUDAH ADA dengan ctx sintetis. Dipakai ulang oleh
// executeCommandAs agar tidak ada logika eksekusi baru / sock langsung.
async function runPluginLoop(ctx) {
  let pluginError = null;
  for (const plugin of plugins) {
    try {
      if (await plugin.handler(ctx)) return { handled: true, error: null };
    } catch (e) {
      pluginError = `${plugin.name}: ${e?.message || e}`;
      console.error('[plugin]', plugin.name, e?.message || e);
    }
  }
  return { handled: false, error: pluginError };
}

// Eksekusi command hasil tool lewat plugin loop. Flag __fromTool mencegah
// natural-language routing memproses ulang (anti-rekursi).
async function executeCommandAs(baseCtx, command, args) {
  const cmd = String(command || '').toLowerCase().replace(/^\.+/, '').trim();
  const a = String(args || '').trim();
  const body = a ? `${cmd} ${a}` : cmd;
  const syntheticCtx = {
    ...baseCtx,
    m: baseCtx.m,
    body,
    cmd,
    args: a,
    __fromTool: true,
  };
  try { syntheticCtx.m.__fromTool = true; } catch {}

  // Guard ban/rate-limit tetap berlaku (logika Fase 2A yang sudah ada).
  // Owner sudah divalidasi tool-router; di sini hanya ban + rate-limit.
  try {
    const sender = syntheticCtx.sender;
    let isOwner = false;
    try {
      isOwner = !!(await S.isOwnerAsync(syntheticCtx.sock, sender, syntheticCtx.jid, sender));
    } catch {}
    const guardCtx = {
      sender,
      isOwner,
      reply: (text) => safeReply(syntheticCtx.sock, syntheticCtx.jid, text, syntheticCtx.m),
    };
    const allowed = await guards.runPipeline(guardCtx, {});
    if (!allowed) return { handled: true, blocked: true };
  } catch (e) {
    console.error('[tool-guard]', e?.message || e);
    return { handled: true, blocked: true };
  }

  const res = await runPluginLoop(syntheticCtx);
  if (!res.handled && res.error) {
    await safeReply(
      syntheticCtx.sock,
      syntheticCtx.jid,
      `⚠️ Fitur \`.${cmd}\` gagal dijalankan.\n_${res.error}_`,
      syntheticCtx.m
    ).catch(() => {});
  } else if (!res.handled) {
    await safeReply(
      syntheticCtx.sock,
      syntheticCtx.jid,
      `⚠️ Fitur \`.${cmd}\` belum bisa dijalankan lewat AI. Coba ketik \`.${cmd}\` langsung ya.`,
      syntheticCtx.m
    ).catch(() => {});
  }
  return res;
}

// Ringkasan otomatis tiap 10 giliran freechat (bukan tiap pesan).
const summaryCounters = new Map();
async function maybeSummarize(jid, sender) {
  try {
    const key = scopeKey(jid, sender);
    const n = (summaryCounters.get(key) || 0) + 1;
    summaryCounters.set(key, n);
    if (n % 10 !== 0) return;
    const hist = S.getMemory(jid, { sender }) || [];
    if (!hist.length) return;
    const recent = hist.slice(-10).map((h) =>
      `${h.role === 'user' ? 'User' : 'Bot'}: ${String(h.content || '').slice(0, 300)}`
    );
    const summary = recent.join('\n').slice(0, 1500);
    await setSummary(jid, summary, { sender });
  } catch (e) {
    console.error('[summary]', e?.message || e);
  }
}

// Routing bahasa alami di freechat private. Mengembalikan true bila pesan sudah
// ditangani (tool dijalankan / konfirmasi / penolakan), false bila harus dijawab
// AI biasa.
async function tryToolRouting(sock, m, jid, sender, body) {
  // (a) Balasan konfirmasi (iya/batal) SPRINT dicegat tanpa memanggil AI.
  const conf = toolRouter.confirmPending({ jid, sender }, body);
  if (conf) {
    if (conf.ok && conf.synthetic) {
      await safeReply(sock, jid, conf.message, m).catch(() => {});
      await executeCommandAs({ sock, m, jid, isGroup: false, sender }, conf.synthetic.cmd, conf.synthetic.args);
    } else if (conf.message) {
      await safeReply(sock, jid, conf.message, m).catch(() => {});
    }
    return true;
  }

  // (b) Tanya AI dengan tool. Katalog diambil otomatis oleh chatAIWithTools.
  //     Bila tool-calling gagal total, kembalikan false agar jalur AI biasa
  //     (race Gemini+Groq) tetap jalan — tidak mengubah perilaku lama.
  let result;
  try {
    const style =
      TOOL_SYSTEM_PROMPT + '\n\n' + (sessionStyle(jid, sender) || config.STYLE);
    const prompt = buildContextPrompt(jid, withTalkFlag(jid, sender, body), { sender });
    result = await chatAIWithTools(prompt, capabilities.toFunctionDeclarations(), style);
  } catch (e) {
    console.error('[tool-routing]', e?.message || e);
    return false;
  }

  if (result && result.type === 'tool' && result.call) {
    const ctx = {
      jid,
      sender,
      reply: (text) => safeReply(sock, jid, text, m),
      isOwnerAsync: async () => {
        try { return !!(await S.isOwnerAsync(sock, sender, jid, sender)); } catch { return false; }
      },
    };
    const r = await toolRouter.dispatchToolCall(ctx, result.call);
    if (r.needConfirm) {
      await safeReply(sock, jid, r.prompt, m);
      return true;
    }
    if (r.rejected) {
      // Pesan penolakan sudah dikirim via ctx.reply di tool-router.
      return true;
    }
    if (r.ok && r.synthetic) {
      await executeCommandAs({ sock, m, jid, isGroup: false, sender }, r.synthetic.cmd, r.synthetic.args);
      return true;
    }
    if (r.message) {
      await safeReply(sock, jid, r.message, m);
      return true;
    }
  }

  // (c) Tidak ada function call: kembalikan teks untuk dijawab AI biasa.
  if (result && result.type === 'text' && result.text) {
    return { text: result.text };
  }
  return false;
}

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
        // Fase 5: coba routing tool (bahasa alami -> sonezz_run -> plugin).
        // Flag anti-rekursi: hasil eksekusi tool tidak masuk jalur ini lagi.
        if (!m?.__fromTool) {
          const routed = await tryToolRouting(sock, m, jid, sender, body);
          if (routed === true) return; // tool dijalankan / konfirmasi / penolakan
          const answer = routed && routed.text ? routed.text : null;
          if (answer) {
            pushMessage(jid, 'user', body, { sender });
            pushMessage(jid, 'bot', answer, { sender });
            await maybeSummarize(jid, sender);
            return await safeReply(sock, jid, answer, m);
          }
        }
        // Fallback AI biasa (tool tidak tersedia / API menolak tools).
        const prompt = buildContextPrompt(jid, withTalkFlag(jid, sender, body), { sender });
        const answer = await chatAI(prompt, undefined, undefined, sessionStyle(jid, sender) || config.STYLE);
        pushMessage(jid, 'user', body, { sender });
        pushMessage(jid, 'bot', answer, { sender });
        await maybeSummarize(jid, sender);
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
    // ---------- FASE 2A (C1): guard global untuk SEMUA prefix command ----------
    // tryNewRouter lebih dulu: bila command ada di registry, pipeline sudah jalan di sana
    // dan fungsi sudah return di atas -> TIDAK ada double rate-limit di sini.
    // Command yang sampai ke titik ini = command plugin (atau perintah tak dikenal).
    // Guard dipakai: ban (banned.json) + rate-limit in-memory. Owner tetap exempt.
    // Freechat private, VN, dan dokumen sudah return lebih awal -> tidak terkena guard.
    if ((hasPrefix || mentioned) && !m?.__guarded) {
      try {
        let isOwner = false;
        try {
          isOwner = !!(await S.isOwnerAsync(sock, sender, jid, sender));
        } catch {}
        const guardCtx = {
          sender,
          isOwner,
          reply: (text) => safeReply(sock, jid, text, m),
        };
        // command tanpa metadata cooldown/ownerOnly/groupOnly/adminOnly:
        // cooldown/owner/group/admin guard jadi no-op, ban + rate-limit tetap aktif.
        const allowed = await guards.runPipeline(guardCtx, {});
        if (!allowed) return;
        // Tandai pesan agar pemanggilan guard lain (mis. plugin) tidak mengulang.
        try { m.__guarded = true; } catch {}
      } catch (e) {
        console.error('[guard-plugin]', e?.message || e);
        // Gagal guard = blokir aman untuk command (jangan jalankan plugin tanpa guard).
        return;
      }
    }

    // ---------- Router plugin (plugins/<tema>/*.js, urutan nama file) ----------
    const ctx = { sock, m, jid, isGroup, sender, body, cmd, args, prefix, start, unwrapped };
    let pluginError = null;
    for (const plugin of plugins) {
      try {
        if (await plugin.handler(ctx)) return;
      } catch (e) {
        pluginError = `${plugin.name}: ${e?.message || e}`;
        console.error('[plugin]', plugin.name, e?.message || e);
      }
    }

    // Perintah ber-prefix yang gagal di plugin: balas errornya, jangan diam.
    // Tanpa ini user hanya melihat bot diam (atau dijawab AI), sulit dicari.
    if (pluginError && (hasPrefix || mentioned)) {
      return await safeReply(
        sock, jid,
        `⚠️ Perintah \`${prefix}${cmd}\` gagal diproses.\n_${pluginError}_\nKetik ${prefix}menu untuk daftar command.`,
        m
      );
    }

    // Fallback perintah tak dikenal: prefix/mention tapi tak ada plugin yang menangani.
    // Hanya bila tidak ada pluginError (sudah dibalas di atas) agar tidak double-reply.
    // Private tanpa prefix/mention tidak masuk sini (freechat di bawah tetap jalan).
    if ((hasPrefix || mentioned) && !pluginError) {
      return await safeReply(
        sock, jid,
        `❓ Perintah \`${prefix}${cmd}\` tidak dikenal.\nKetik ${prefix}menu untuk daftar command, contoh: ${prefix}menu / ${prefix}kuislist.`,
        m
      );
    }

    // Chat pribadi: teks BEBAS tanpa perintah -> jawab AI.
    // PENTING: hanya kalau TIDAK ada prefix/mention. Kalau user mengetik
    // ".menu" dan tidak ada plugin yang menangani, jangan jatuh ke freechat
    // (dulu hasilnya bot menjawab dengan AI alih-alih perintah).
    if (!isGroup && !hasPrefix && !mentioned) {
      try {
        const prompt = buildContextPrompt(jid, withTalkFlag(jid, sender, body), { sender });
        const answer = await chatAI(prompt, undefined, undefined, sessionStyle(jid, sender) || config.STYLE);
        pushMessage(jid, 'user', body, { sender });
        pushMessage(jid, 'bot', answer, { sender });
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
    if (!id) return;
    const arr = (Array.isArray(participants) ? participants : []).map(String).filter(Boolean);
    if (!arr.length) return;
    const act = String(action || '').toLowerCase();

    // (a) Anggota baru masuk.
    if (act === 'add') {
      try {
        if (systems && typeof systems.isWelcomeOn === 'function' && !systems.isWelcomeOn(id)) return;
      } catch { /* abaikan, lanjut kirim */ }
      // Coba teks custom persisten; bila ada dipakai, bila null pakai default.
      try {
        let getWelcomeReply = null;
        try {
          ({ getWelcomeReply } = require('../plugins/group/08-furina-tools'));
        } catch { getWelcomeReply = null; }
        if (typeof getWelcomeReply === 'function') {
          const custom = await getWelcomeReply(sock, id, arr);
          if (custom && custom.text) {
            await sock.sendMessage(id, {
              text: custom.text,
              mentions: (Array.isArray(custom.mentions) && custom.mentions.length) ? custom.mentions : arr,
            });
            return;
          }
        }
      } catch { /* abaikan, pakai default */ }
      const text =
        `👋 *Selamat datang!*\n` +
        arr.map((p) => `@${p.split('@')[0]}`).join(' ') +
        `\nJangan lupa baca rules pakai .rules ya!`;
      await sock.sendMessage(id, { text, mentions: arr });
      return;
    }

    // (b) Anggota keluar / di-kick (varian Baileys: 'remove').
    if (act === 'remove' || act === 'leave' || act === 'kick') {
      try {
        let getLeftReply = null;
        try {
          ({ getLeftReply } = require('../plugins/group/08-furina-tools'));
        } catch { getLeftReply = null; }
        if (typeof getLeftReply === 'function') {
          const custom = await getLeftReply(sock, id, arr);
          if (custom && custom.text) {
            await sock.sendMessage(id, {
              text: custom.text,
              mentions: (Array.isArray(custom.mentions) && custom.mentions.length) ? custom.mentions : arr,
            });
            return;
          }
        }
      } catch { /* abaikan, pakai default */ }
      const text = `👋 ${arr.map((p) => `@${p.split('@')[0]}`).join(' ')} telah keluar. Sampai jumpa!`;
      await sock.sendMessage(id, { text, mentions: arr });
      return;
    }
  } catch (e) {
    console.error('[welcome]', e?.message || e);
  }
}

module.exports = { handleMessage, menuText, handleParticipantsUpdate, executeCommandAs };
