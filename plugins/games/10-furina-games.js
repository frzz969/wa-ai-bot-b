// plugins/games/10-furina-games.js — Game ala Furina: suit PvP, slot, tebak-tebakan.
// Dipanggil router handlers/messages.js otomatis via lib/plugin-loader.js.
// Kontrak: async (ctx) => boolean. Return true = tertangani.
//
// URUTAN: prefix "10-" supaya file ini jalan SEBELUM plugins/games/11-games.js.
// Alasannya: command `.jawab` dipakai ulang untuk tebak-tebakan di sini —
// bila sesi tebak aktif di chat ini, kami tangani; bila tidak, return false
// agar .jawab kuis existing (11-games.js) tetap bekerja tanpa diubah.
//
// Economy: memakai koin yang SAMA dengan economy (lib/systems.js):
//   systems.getBalance(sender) -> number, systems.addBalance(sender, n) -> saldo baru.
// Kurs info: 50 koin = 1 limit (lihat .tukar).
// State: in-memory (Map + setTimeout), tanpa DB, tanpa dependensi baru.
const S = require('../../handlers/state');
const { safeReply, systems, groupLane } = S;

// ============================== helpers ==============================
function norm(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ');
}

function parseBet(raw, def = 10, min = 10, max = 100) {
  const m = String(raw || '').match(/\d+/);
  let n = m ? Number(m[0]) : def;
  if (!Number.isFinite(n)) n = def;
  n = Math.floor(n);
  if (n < min) n = min;
  if (n > max) n = max;
  return n;
}

function getBal(id) {
  try {
    const v = systems.getBalance(id);
    if (typeof v === 'number') return v;
    if (v && typeof v.balance === 'number') return v.balance;
  } catch {}
  return 0;
}

function mentionJid(id) {
  return String(id || '').split('@')[0];
}

// ============================== 1. SUIT PvP ==============================
// `suit @tag [taruhan]` -> tantang. `.suit gunting|batu|kertas` -> pilih.
// `.suit tolak` (target) -> batalkan. Timeout 60 detik, in-memory.
const suits = new Map(); // scopeKey(jid, challenger) -> sesi
function suitKey(jid, user) {
  return `${jid}|${user}`;
}
function findSuit(jid, user) {
  const direct = suits.get(suitKey(jid, user));
  if (direct) return { sess: direct, role: 'challenger' };
  for (const sess of suits.values()) {
    if (sess.jid === jid && sess.target === user) return { sess, role: 'target' };
  }
  return null;
}
function suitBusy(jid, user) {
  return !!findSuit(jid, user);
}

const SUIT_ALIAS = {
  gunting: 'gunting', g: 'gunting',
  batu: 'batu', b: 'batu',
  kertas: 'kertas', k: 'kertas',
};
function beats(a, b) {
  return (
    (a === 'batu' && b === 'gunting') ||
    (a === 'gunting' && b === 'kertas') ||
    (a === 'kertas' && b === 'batu')
  );
}
const SUIT_EMOJI = { gunting: '✌️', batu: '✊', kertas: '🖐️' };

async function cmdSuit(ctx) {
  const { sock, m, jid, sender, args, prefix } = ctx;
  const sub = norm(args).split(' ')[0] || '';

  // ---- pilihan / tolak ----
  if (SUIT_ALIAS[sub]) {
    const found = findSuit(jid, sender);
    if (!found) {
      await safeReply(sock, jid, `❌ Kamu tidak punya tantangan suit aktif.\nTantang dulu: ${prefix}suit @teman [taruhan]`, m);
      return true;
    }
    const { sess, role } = found;
    const pick = SUIT_ALIAS[sub];
    if (role === 'challenger') {
      if (sess.pickC) {
        await safeReply(sock, jid, `⏳ Kamu sudah memilih. Menunggu lawan memilih...`, m);
        return true;
      }
      sess.pickC = pick;
    } else {
      if (sess.pickT) {
        await safeReply(sock, jid, `⏳ Kamu sudah memilih. Menunggu penantang...`, m);
        return true;
      }
      // Target ikut saat memilih: kunci taruhannya sekarang.
      const bal = getBal(sender);
      if (bal < sess.bet) {
        await safeReply(sock, jid, `❌ Koinmu kurang untuk ikut (butuh ${sess.bet}, punya ${bal}).`, m);
        return true;
      }
      try { systems.addBalance(sender, -sess.bet); } catch {}
      sess.pickT = pick;
    }
    if (sess.pickC && sess.pickT) {
      if (sess.timer) { clearTimeout(sess.timer); sess.timer = null; }
      suits.delete(suitKey(sess.jid, sess.challenger));
      const c = sess.pickC;
      const t = sess.pickT;
      const pot = sess.bet * 2;
      const base =
        `✊✌️🖐️ *SUIT* — taruhan ${sess.bet} koin\n` +
        `@${mentionJid(sess.challenger)}: ${SUIT_EMOJI[c]} ${c}\n` +
        `@${mentionJid(sess.target)}: ${SUIT_EMOJI[t]} ${t}\n\n`;
      try {
        if (c === t) {
          systems.addBalance(sess.challenger, sess.bet);
          systems.addBalance(sess.target, sess.bet);
          await sock.sendMessage(
            jid,
            { text: base + `🤝 Seri! Taruhan dikembalikan (${sess.bet} koin per orang).`, mentions: [sess.challenger, sess.target] },
            { quoted: m }
          );
        } else if (beats(c, t)) {
          systems.addBalance(sess.challenger, pot);
          await sock.sendMessage(
            jid,
            { text: base + `🎉 Pemenang: @${mentionJid(sess.challenger)}! Dapat ${pot} koin!`, mentions: [sess.challenger, sess.target] },
            { quoted: m }
          );
        } else {
          systems.addBalance(sess.target, pot);
          await sock.sendMessage(
            jid,
            { text: base + `🎉 Pemenang: @${mentionJid(sess.target)}! Dapat ${pot} koin!`, mentions: [sess.challenger, sess.target] },
            { quoted: m }
          );
        }
      } catch (e) {
        console.error('suit settle', e?.message || e);
      }
      return true;
    }
    await sock.sendMessage(
      jid,
      {
        text: `✅ @${mentionJid(sender)} sudah memilih (${SUIT_EMOJI[pick]}). Menunggu lawan...\n_Ketik ${prefix}suit gunting|batu|kertas_`,
        mentions: [String(sender)],
      },
      { quoted: m }
    );
    return true;
  }
  if (sub === 'tolak' || sub === 'batal' || sub === 'cancel' || sub === 'decline') {
    const found = findSuit(jid, sender);
    if (!found) {
      await safeReply(sock, jid, `❌ Tidak ada tantangan suit untukmu.`, m);
      return true;
    }
    const { sess } = found;
    if (sess.pickC && sess.pickT) return true; // sudah selesai, abaikan
    if (sess.timer) { clearTimeout(sess.timer); sess.timer = null; }
    suits.delete(suitKey(sess.jid, sess.challenger));
    try { systems.addBalance(sess.challenger, sess.bet); } catch {}
    await sock.sendMessage(
      jid,
      { text: `🚫 Tantangan suit dibatalkan. Taruhan ${sess.bet} koin dikembalikan ke @${mentionJid(sess.challenger)}.`, mentions: [sess.challenger] },
      { quoted: m }
    );
    return true;
  }

  // ---- tantangan baru: suit @tag [taruhan] ----
  let targets = [];
  try {
    targets = groupLane.resolveTargets(m, args);
  } catch { targets = []; }
  const target = (targets || []).filter((t) => t !== sender)[0];
  if (!target) {
    await safeReply(
      sock, jid,
      `❌ Tag lawanmu dulu.\nContoh: ${prefix}suit @teman 20\n• taruhan default 10, maksimal 100 koin\n• pilih via ${prefix}suit gunting|batu|kertas\n• timeout 60 detik`,
      m
    );
    return true;
  }
  if (suitBusy(jid, sender)) {
    await safeReply(sock, jid, `❌ Kamu masih punya suit aktif. Selesaikan / tunggu timeout dulu.`, m);
    return true;
  }
  if (suitBusy(jid, target)) {
    await safeReply(sock, jid, `❌ Lawan masih punya suit aktif. Coba lagi nanti.`, m);
    return true;
  }
  const bet = parseBet(args, 10, 10, 100);
  const balC = getBal(sender);
  const balT = getBal(target);
  if (balC < bet) {
    await safeReply(sock, jid, `❌ Koinmu kurang (butuh ${bet}, punya ${balC}). Cari koin via .work/.daily/.mining dulu.`, m);
    return true;
  }
  if (balT < bet) {
    await safeReply(sock, jid, `❌ Koin lawan kurang (butuh ${bet}, punya ${balT}). Turunkan taruhan atau tunggu dia cari koin.`, m);
    return true;
  }
  try { systems.addBalance(sender, -bet); } catch {}
  const sess = { jid, challenger: String(sender), target: String(target), bet, pickC: null, pickT: null, timer: null };
  sess.timer = setTimeout(() => {
    if (!suits.get(suitKey(sess.jid, sess.challenger))) return;
    suits.delete(suitKey(sess.jid, sess.challenger));
    try { systems.addBalance(sess.challenger, sess.bet); } catch {}
    sock.sendMessage(
      sess.jid,
      { text: `⏰ Suit kedaluwarsa (60 dtk). Taruhan ${sess.bet} koin dikembalikan ke @${mentionJid(sess.challenger)}.`, mentions: [sess.challenger] }
    ).catch(() => {});
  }, 60 * 1000);
  if (sess.timer && typeof sess.timer.unref === 'function') sess.timer.unref();
  suits.set(suitKey(jid, sender), sess);
  await sock.sendMessage(
    jid,
    {
      text:
        `⚔️ *TANTANGAN SUIT!*\n` +
        `@${mentionJid(sender)} menantang @${mentionJid(target)} — taruhan ${bet} koin (pemenang ambil ${bet * 2}!)\n\n` +
        `@${mentionJid(target)}, pilih: \`${prefix}suit gunting\` / \`${prefix}suit batu\` / \`${prefix}suit kertas\`\n` +
        `Batalkan: \`${prefix}suit tolak\` • Timeout 60 detik • Seri = koin kembali`,
      mentions: [String(sender), String(target)],
    },
    { quoted: m }
  );
  return true;
}

// ============================== 2. SLOT ==============================
const SLOT_EMOJI = ['🍒', '🍋', '⭐', '🔔', '💎', '7️⃣'];
function spin() {
  const r = () => SLOT_EMOJI[Math.floor(Math.random() * SLOT_EMOJI.length)];
  return [r(), r(), r()];
}

async function cmdSlot(ctx) {
  const { sock, m, jid, sender, args, prefix } = ctx;
  const mNum = String(args || '').match(/\d+/);
  if (!mNum) {
    await safeReply(sock, jid, `🎰 *SLOT* — kasino koin virtual (tanpa uang asli).\nContoh: ${prefix}slot 20\n• taruhan min 10 koin dari saldo koin economy\n• 3 sejenis = x5 • 2 sejenis = x1.5 (dibulatkan)`, m);
    return true;
  }
  let bet = Math.floor(Number(mNum[0]));
  if (!Number.isFinite(bet) || bet < 10) {
    await safeReply(sock, jid, `❌ Taruhan minimal 10 koin.\nContoh: ${prefix}slot 20`, m);
    return true;
  }
  const bal = getBal(sender);
  if (bal < bet) {
    await safeReply(sock, jid, `❌ Koin kurang (butuh ${bet}, punya ${bal}). Cari koin via .work/.daily/.mining dulu.`, m);
    return true;
  }
  try { systems.addBalance(sender, -bet); } catch {}
  const [a, b, c] = spin();
  let mult = 0;
  let label = 'zonk';
  if (a === b && b === c) { mult = 5; label = 'JACKPOT 3 sejenis x5!'; }
  else if (a === b || b === c || a === c) { mult = 1.5; label = '2 sejenis x1.5'; }
  const payout = Math.round(bet * mult);
  if (payout > 0) {
    try { systems.addBalance(sender, payout); } catch {}
  }
  const saldo = getBal(sender);
  const hasil = payout > 0
    ? `🎉 ${label}\nDapat: *${payout}* koin (taruhan ${bet})`
    : `😿 Zonk! Taruhan ${bet} hangus.`;
  await safeReply(
    sock, jid,
    `🎰 *SLOT* | ${a} ${b} ${c}\n${hasil}\n💰 Saldo: ${saldo} koin`,
    m
  );
  return true;
}

// ============================== 3. TEBAK-TEBAKAN ==============================
// Sesi per chat (jid) + timeout 60 dtk + hadiah koin kecil. Jawab via `.jawab`.
const tebakSessions = new Map(); // jid -> { game, prompt, answers:[sisa], all:[semua], timer, reward, perAnswer }
const TEBAK_TIMEOUT_MS = 60 * 1000;
const TEBAK_REWARD = 15;

function clearTebak(jid) {
  const s = tebakSessions.get(jid);
  if (s && s.timer) clearTimeout(s.timer);
  tebakSessions.delete(jid);
}

function startTebak(ctx, game, prompt, answers, opts = {}) {
  const { sock, jid, m, prefix } = ctx;
  if (tebakSessions.get(jid)) {
    return safeReply(sock, jid, `⏳ Masih ada soal aktif di chat ini. Jawab dulu pakai ${prefix}jawab <teks> (atau ${prefix}jawab nyerah).`, m).then(() => true);
  }
  const all = answers.map((a) => String(a)).filter(Boolean);
  const sess = {
    game,
    prompt,
    answers: all.slice(),
    all,
    reward: opts.reward != null ? opts.reward : TEBAK_REWARD,
    perAnswer: !!opts.perAnswer,
    timer: null,
  };
  sess.timer = setTimeout(() => {
    if (!tebakSessions.get(jid)) return;
    tebakSessions.delete(jid);
    const kunci = sess.perAnswer ? sess.answers.join(' / ') : sess.all[0];
    sock.sendMessage(jid, { text: `⏰ Waktu habis! *[${game}]*\n${sess.prompt}\n🔑 Jawaban: *${kunci}*` }).catch(() => {});
  }, opts.timeoutMs || TEBAK_TIMEOUT_MS);
  if (sess.timer && typeof sess.timer.unref === 'function') sess.timer.unref();
  tebakSessions.set(jid, sess);
  const extra = sess.perAnswer
    ? `\n📝 Ada *${all.length} jawaban benar* — jawab satu per pesan!`
    : '';
  return safeReply(
    sock, jid,
    `❓ *[${game}]*\n${prompt}${extra}\n\nJawab pakai ${prefix}jawab <teks> • ⏰ 60 dtk • 🎁 ${sess.perAnswer ? '5 koin/jawaban' : sess.reward + ' koin'}`,
    m
  ).then(() => true);
}

// `.jawab` — tangani HANYA bila ada sesi tebak di chat ini,
// selain itu return false agar kuis existing (11-games.js) yang menangani.
async function cmdJawabTebak(ctx) {
  const { sock, m, jid, sender, args, prefix } = ctx;
  const sess = tebakSessions.get(jid);
  if (!sess) return false;
  if (!args) {
    await safeReply(sock, jid, `Contoh: ${prefix}jawab <jawabanmu>`, m);
    return true;
  }
  const raw = String(args).trim();
  const n = norm(raw);
  if (n === 'nyerah' || n === 'menyerah' || n === 'give up' || n === 'surrender') {
    clearTebak(jid);
    const kunci = sess.perAnswer ? sess.all.join(' / ') : sess.all[0];
    await safeReply(sock, jid, `🏳️ Menyerah! *[${sess.game}]*\n🔑 Jawaban: *${kunci}*`, m);
    return true;
  }
  if (sess.perAnswer) {
    const idx = sess.answers.findIndex((a) => norm(a) === n);
    if (idx !== -1) {
      const benar = sess.answers.splice(idx, 1)[0];
      let bonus = 0;
      try { systems.addBalance(sender, 5); } catch {}
      let done = '';
      if (!sess.answers.length) {
        try { systems.addBalance(sender, 10); bonus = 10; } catch {}
        clearTebak(jid);
        done = `\n🎊 Semua jawaban ketemu! Bonus +10 koin!`;
      }
      await safeReply(
        sock, jid,
        `✅ Benar! *${benar}* (+5 koin${bonus ? ' + bonus 10' : ''})${sess.answers.length ? `\nSisa: ${sess.answers.length} jawaban lagi.` : ''}${done}`,
        m
      );
      return true;
    }
    await safeReply(sock, jid, `❌ Kurang tepat / sudah disebut. Coba lagi! (sisa ${sess.answers.length})`, m);
    return true;
  }
  if (norm(sess.all[0]) === n) {
    clearTebak(jid);
    try { systems.addBalance(sender, sess.reward); } catch {}
    await safeReply(sock, jid, `✅ Benar! Jawabannya: *${sess.all[0]}*\n🎁 +${sess.reward} koin untuk @${mentionJid(sender)}!`, m);
    return true;
  }
  await safeReply(sock, jid, `❌ Kurang tepat, coba lagi!`, m);
  return true;
}

// ---- bank soal (embed, ≥20 per command) ----
const SOAL_TEBAKGAMBAR = [
  { clue: 'Benda di dapur untuk menggoreng, pipih dan bergagang panjang.', j: 'wajan' },
  { clue: 'Hewan berbelalai panjang, telinga lebar, tubuh besar.', j: 'gajah' },
  { clue: 'Benda untuk melihat waktu, melingkar di pergelangan tangan.', j: 'jam tangan' },
  { clue: 'Buah kuning melengkung seperti perahu, kulitnya dikupas.', j: 'pisang' },
  { clue: 'Kendaraan roda dua tanpa mesin, dikayuh dengan kaki.', j: 'sepeda' },
  { clue: 'Bangunan tinggi tempat pesawat lepas landas dan mendarat.', j: 'bandara' },
  { clue: 'Hewan malam bermata besar yang bisa memutar kepala.', j: 'burung hantu' },
  { clue: 'Alat untuk menulis di papan tulis, isinya tinta dan bisa dihapus.', j: 'spidol' },
  { clue: 'Makanan bulat pipih dari tepung, topping keju dan sosis.', j: 'pizza' },
  { clue: 'Hewan berkantung dari Australia yang suka melompat.', j: 'kanguru' },
  { clue: 'Benda untuk berteduh dari hujan, bisa dilipat.', j: 'payung' },
  { clue: 'Ikan besar bergigi tajam yang hidup di laut.', j: 'hiu' },
  { clue: 'Buah merah kecil, sering jadi pelengkap kue ulang tahun.', j: 'stroberi' },
  { clue: 'Alat musik petik bersenar enam.', j: 'gitar' },
  { clue: 'Serangga yang membuat madu dan bisa menyengat.', j: 'lebah' },
  { clue: 'Benda langit yang bersinar di malam hari selain bulan.', j: 'bintang' },
  { clue: 'Hewan leher panjang pemakan daun tertinggi di sabana.', j: 'jerapah' },
  { clue: 'Tempat menyimpan uang dari kain atau kulit di saku.', j: 'dompet' },
  { clue: 'Burung besar yang tidak bisa terbang, hidup di kutub dingin.', j: 'pinguin' },
  { clue: 'Sayuran oranye kesukaan kelinci, baik untuk mata.', j: 'wortel' },
];
const SOAL_TEBAKLOGO = [
  { clue: 'Logo buah apel yang sudah digigit.', j: 'apple' },
  { clue: 'Logo centang melengkung, brand sepatu olahraga terkenal.', j: 'nike' },
  { clue: 'Logo tiga garis sejajar, brand olahraga dari Jerman.', j: 'adidas' },
  { clue: 'Logo huruf M melengkung kuning, restoran cepat saji.', j: 'mcdonald' },
  { clue: 'Logo kuda jingkrak, mobil mewah dari Italia.', j: 'ferrari' },
  { clue: 'Logo elips berisi huruf T, mobil asal Jepang.', j: 'toyota' },
  { clue: 'Logo burung biru terbang, media sosial cuitan.', j: 'twitter' },
  { clue: 'Logo huruf F biru, media sosial terbesar.', j: 'facebook' },
  { clue: 'Logo kamera gradasi ungu-oranye, aplikasi berbagi foto.', j: 'instagram' },
  { clue: 'Logo tulisan merah dengan gelombang putih, minuman bersoda.', j: 'coca cola' },
  { clue: 'Logo jendela empat warna, sistem operasi komputer.', j: 'windows' },
  { clue: 'Logo robot hijau, sistem operasi HP open source.', j: 'android' },
  { clue: 'Logo komet biru, browser anti iklan.', j: 'brave' },
  { clue: 'Logo lingkaran merah putih hijau, mie instan Indonesia.', j: 'indomie' },
  { clue: 'Logo bintang tiga sudut, mobil mewah Jerman.', j: 'mercedes' },
  { clue: 'Logo sayap huruf H, motor asal Jepang.', j: 'honda' },
  { clue: 'Logo putri duyung hijau, kedai kopi terkenal.', j: 'starbucks' },
  { clue: 'Logo senyum panah dari A ke Z, toko online raksasa.', j: 'amazon' },
  { clue: 'Logo play segitiga merah, situs berbagi video.', j: 'youtube' },
  { clue: 'Logo gajah biru, aplikasi database terkenal.', j: 'postgres' },
];
const SOAL_TEBAKLAGU = [
  { clue: 'Lirik: "Aku takut kehilanganmu..." — lagu galau Indonesia.', j: 'takut kehilanganmu' },
  { clue: 'Lirik: "Bintang di langit..." — band pop legendaris Indonesia.', j: 'bintang di langit' },
  { clue: 'Lirik: "Separuh aku..." — band dengan vokalis bersuara khas.', j: 'separuh aku' },
  { clue: 'Lirik: "Kasih sayangmu..." — lagu cinta lawas Indonesia.', j: 'kasih sayang' },
  { clue: 'Lirik: "Hujan turun lagi..." — lagu sendu tentang rindu.', j: 'hujan' },
  { clue: 'Lirik: "Aku yang malang..." — lagu dangdut terkenal.', j: 'aku yang malang' },
  { clue: 'Lirik: "Demi cintaku padamu..." — balada rock Indonesia.', j: 'demi cinta' },
  { clue: 'Lirik: "Pergilah kasih..." — lagu perpisahan legendaris.', j: 'pergilah kasih' },
  { clue: 'Lirik: "Bunga terakhir..." — lagu sedih tentang kehilangan.', j: 'bunga terakhir' },
  { clue: 'Lirik: "Cinta satu malam..." — lagu dangdut koplo.', j: 'cinta satu malam' },
  { clue: 'Lirik: "Takkan terganti..." — lagu cinta abadi Indonesia.', j: 'takkan terganti' },
  { clue: 'Lirik: "Separuh nafasku..." — lagu rindu yang dalam.', j: 'separuh nafasku' },
  { clue: 'Lirik: "Mungkin nanti..." — lagu tentang penantian.', j: 'mungkin nanti' },
  { clue: 'Lirik: "Laskar pelangi..." — lagu semangat penuh warna.', j: 'laskar pelangi' },
  { clue: 'Lirik: "Ayat ayat cinta..." — lagu religi romantis.', j: 'ayat ayat cinta' },
  { clue: 'Lirik: "Bidadari..." — lagu pujian untuk kekasih.', j: 'bidadari' },
  { clue: 'Lirik: "Kangen band..." — clown band dengan lagu "Tentang Bintang".', j: 'tentang bintang' },
  { clue: 'Lirik: "Cinta tak harus memiliki..." — lagu ikhlas melepas.', j: 'cinta tak harus memiliki' },
  { clue: 'Lirik: "Sempurna..." — lagu tentang pasangan apa adanya.', j: 'sempurna' },
  { clue: 'Lirik: "Ruang rindu..." — lagu sendu band 2000-an.', j: 'ruang rindu' },
];
const SOAL_CAKLONTONG = [
  { q: 'Makin dipotong makin besar, apakah itu?', j: 'lubang' },
  { q: 'Apa yang naik tapi tidak pernah turun?', j: 'umur' },
  { q: 'Punya kunci tapi tidak bisa membuka pintu, apakah itu?', j: 'piano' },
  { q: 'Semakin banyak diambil, semakin besar. Apakah itu?', j: 'lubang' },
  { q: 'Apa yang selalu datang tapi tidak pernah tiba?', j: 'besok' },
  { q: 'Punya tangan tapi tidak bisa memegang, apakah itu?', j: 'jam' },
  { q: 'Hewan apa yang namanya dua huruf?', j: 'udang' },
  { q: 'Apa yang bisa berlari tapi tidak punya kaki?', j: 'air' },
  { q: 'Semakin dibagikan semakin bertambah, apakah itu?', j: 'ilmu' },
  { q: 'Apa yang punya leher tapi tidak punya kepala?', j: 'botol' },
  { q: 'Buah apa yang paling rajin?', j: 'semangka' },
  { q: 'Kota apa yang banyak ikannya?', j: 'surabaya' },
  { q: 'Sayur apa yang bisa nyanyi?', j: 'kolplay' },
  { q: 'Hewan apa yang paling sederhana?', j: 'ala kadarnya' },
  { q: 'Apa yang kalau dipukul malah bunyi merdu?', j: 'gitar' },
  { q: 'Makanan apa yang paling romantis?', j: 'tempe' },
  { q: 'Kenapa ayam menyebrang jalan?', j: 'mau ke seberang' },
  { q: 'Apa bedanya gajah dan semut?', j: 'kakinya' },
  { q: 'Ikan apa yang bisa terbang?', j: 'ikan lele' },
  { q: 'Pintu apa yang tidak bisa dibuka?', j: 'pintu hati' },
];
const SOAL_FAMILY100 = [
  { q: 'Sebutkan buah berwarna merah!', a: ['apel', 'stroberi', 'semangka', 'tomat'] },
  { q: 'Sebutkan hewan berkaki empat!', a: ['kucing', 'anjing', 'sapi', 'kambing'] },
  { q: 'Sebutkan warna pelangi!', a: ['merah', 'kuning', 'hijau', 'biru'] },
  { q: 'Sebutkan alat tulis sekolah!', a: ['pensil', 'pulpen', 'penghapus', 'penggaris'] },
  { q: 'Sebutkan makanan cepat saji!', a: ['burger', 'pizza', 'ayam goreng', 'kentang goreng'] },
  { q: 'Sebutkan alat musik petik!', a: ['gitar', 'ukulele', 'harpa', 'bas'] },
  { q: 'Sebutkan minuman hangat!', a: ['kopi', 'teh', 'susu', 'jahe'] },
  { q: 'Sebutkan hewan yang bisa terbang!', a: ['burung', 'kelelawar', 'kupu kupu', 'lebah'] },
  { q: 'Sebutkan nama hari dalam seminggu!', a: ['senin', 'selasa', 'rabu', 'jumat'] },
  { q: 'Sebutkan sayuran hijau!', a: ['bayam', 'kangkung', 'sawi', 'brokoli'] },
  { q: 'Sebutkan benda di kamar tidur!', a: ['kasur', 'bantal', 'selimut', 'lemari'] },
  { q: 'Sebutkan olahraga bola!', a: ['sepak bola', 'basket', 'voli', 'tenis'] },
  { q: 'Sebutkan kendaraan umum!', a: ['bus', 'kereta', 'angkot', 'ojek'] },
  { q: 'Sebutkan rasa dasar makanan!', a: ['manis', 'asin', 'pahit', 'asam'] },
  { q: 'Sebutkan hewan laut!', a: ['hiu', 'paus', 'gurita', 'udang'] },
  { q: 'Sebutkan peralatan dapur!', a: ['wajan', 'panci', 'pisau', 'kompor'] },
  { q: 'Sebutkan benda untuk menulis!', a: ['pensil', 'pulpen', 'spidol', 'kapur'] },
  { q: 'Sebutkan musim di dunia!', a: ['panas', 'hujan', 'dingin', 'semi'] },
  { q: 'Sebutkan anggota tubuh di wajah!', a: ['mata', 'hidung', 'mulut', 'telinga'] },
  { q: 'Sebutkan makanan manis!', a: ['cokelat', 'permen', 'kue', 'es krim'] },
];
const SOAL_ASAHOTAK = [
  { q: 'Ada 5 apel di keranjang, kamu ambil 2. Berapa apel yang kamu punya?', j: '2' },
  { q: 'Ayam jantan bertelur di atas atap miring, telur menggelinding ke...?', j: 'tidak bertelur' },
  { q: 'Satu lusin sama dengan berapa?', j: '12' },
  { q: 'Hewan yang tidur sambil berdiri?', j: 'kuda' },
  { q: 'Bulan apa yang punya 28 hari?', j: 'semua bulan' },
  { q: 'Apa yang bisa kamu tangkap tapi tidak bisa kamu lempar?', j: 'batuk' },
  { q: 'Berapa kaki yang dimiliki 2 ekor ayam dan 1 ekor sapi?', j: '8' },
  { q: 'Jika kemarin adalah rabu, maka lusa adalah hari?', j: 'sabtu' },
  { q: 'Benda apa yang selalu basah saat mengeringkan?', j: 'handuk' },
  { q: 'Angka berapa yang kalau dibalik tetap sama: 69 atau 88?', j: '88' },
  { q: 'Satu tambah satu sama dengan jendela, bahasanya?', j: 'mandarin' },
  { q: 'Apa yang berjalan tanpa kaki dan menangis tanpa mata?', j: 'awan' },
  { q: 'Semakin tua semakin muda, apakah itu?', j: 'lilin' },
  { q: 'Hewan apa yang huruf depannya sama dengan huruf belakangnya: katak?', j: 'katak' },
  { q: 'Berapa sisi yang dimiliki segitiga?', j: '3' },
  { q: 'Air apa yang paling manis?', j: 'air gula' },
  { q: 'Jika ada 10 burung di pohon, 1 ditembak, sisa berapa?', j: '0' },
  { q: 'Apa yang ada di tengah-tengah jakarta?', j: 'huruf k' },
  { q: 'Benda apa yang punya 4 roda dan bisa terbang?', j: 'truk' },
  { q: 'Pagi makan 1, malam makan 3. Apakah itu?', j: 'obat' },
];
const SOAL_SUSUNKATA = [
  { acak: 'K U C I N G', j: 'kucing', c: 'Hewan berkumis yang suka ikan.' },
  { acak: 'M E J A B E L A J A R', j: 'meja belajar', c: 'Tempat menaruh buku saat belajar.' },
  { acak: 'S E P E D A', j: 'sepeda', c: 'Kendaraan kayuh roda dua.' },
  { acak: 'B U K U T U L I S', j: 'buku tulis', c: 'Media menulis anak sekolah.' },
  { acak: 'J E N D E L A', j: 'jendela', c: 'Lubang berbingkai di dinding untuk cahaya.' },
  { acak: 'K A M B I N G', j: 'kambing', c: 'Hewan berjanggut yang suka memanjat.' },
  { acak: 'M A T A H A R I', j: 'matahari', c: 'Bintang pusat tata surya.' },
  { acak: 'P E S A W A T', j: 'pesawat', c: 'Kendaraan yang terbang di langit.' },
  { acak: 'K E R E T A A P I', j: 'kereta api', c: 'Kendaraan berjalan di atas rel.' },
  { acak: 'B U N G A M A W A R', j: 'bunga mawar', c: 'Bunga berduri simbol cinta.' },
  { acak: 'L A P T O P', j: 'laptop', c: 'Komputer jinjing untuk kerja.' },
  { acak: 'S A M P A H', j: 'sampah', c: 'Sisa barang yang dibuang.' },
  { acak: 'G U N U N G', j: 'gunung', c: 'Dataran tinggi menjulang.' },
  { acak: 'S U N G A I', j: 'sungai', c: 'Aliran air tawar yang panjang.' },
  { acak: 'K U P U K U P U', j: 'kupu kupu', c: 'Serangga bersayap indah.' },
  { acak: 'T E L E V I S I', j: 'televisi', c: 'Kotak ajaib penampil gambar.' },
  { acak: 'S E K O L A H', j: 'sekolah', c: 'Tempat menuntut ilmu.' },
  { acak: 'P E N G G A R I S', j: 'penggaris', c: 'Alat ukur panjang yang lurus.' },
  { acak: 'B A L O N U D A R A', j: 'balon udara', c: 'Wahana terbang dari kain besar.' },
  { acak: 'K A C A M A T A', j: 'kacamata', c: 'Alat bantu penglihatan.' },
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================== router file ==============================
async function handleFurinaGames(ctx) {
  const { sock, m, jid, cmd, args, prefix } = ctx;

  // .jawab dipakai ulang: hanya klaim bila sesi tebak aktif, else false (kuis existing).
  if (cmd === 'jawab') return await cmdJawabTebak(ctx);

  if (cmd === 'suit') return await cmdSuit(ctx);
  if (cmd === 'slot') return await cmdSlot(ctx);

  if (cmd === 'tebakgambar') {
    const s = pick(SOAL_TEBAKGAMBAR);
    return await startTebak(ctx, 'TEBAK GAMBAR', `🖼️ ${s.clue}`, [s.j]);
  }
  if (cmd === 'tebaklogo') {
    const s = pick(SOAL_TEBAKLOGO);
    return await startTebak(ctx, 'TEBAK LOGO', `™️ ${s.clue}`, [s.j]);
  }
  if (cmd === 'tebaklagu') {
    const s = pick(SOAL_TEBAKLAGU);
    return await startTebak(ctx, 'TEBAK LAGU', `🎵 ${s.clue}\nJudul lagunya apa?`, [s.j]);
  }
  if (cmd === 'caklontong') {
    const s = pick(SOAL_CAKLONTONG);
    return await startTebak(ctx, 'CAK LONTONG', `🤣 ${s.q}`, [s.j]);
  }
  if (cmd === 'family100') {
    const s = pick(SOAL_FAMILY100);
    return await startTebak(ctx, 'FAMILY 100', `👨‍👩‍👧 ${s.q}`, s.a, { perAnswer: true, timeoutMs: 90 * 1000 });
  }
  if (cmd === 'asahotak') {
    const s = pick(SOAL_ASAHOTAK);
    return await startTebak(ctx, 'ASAH OTAK', `🧠 ${s.q}`, [s.j]);
  }
  if (cmd === 'susunkata') {
    const s = pick(SOAL_SUSUNKATA);
    return await startTebak(
      ctx, 'SUSUN KATA',
      `🔤 Susun huruf acak ini menjadi kata yang benar!\n*${s.acak}*\n💡 Clue: ${s.c}`,
      [s.j]
    );
  }

  return false;
}

module.exports = { handleFurinaGames };
