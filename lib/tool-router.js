// lib/tool-router.js — Fase 5: jembatan aman AI -> command bot SONEZZ.
//
// AI (via tool `sonezz_run`) tidak pernah menyentuh sock / logika grup langsung.
// File ini HANYA:
//   1. memvalidasi command (harus ada di katalog capabilities — anti mengarang),
//   2. memvalidasi akses (owner-only),
//   3. meminta konfirmasi untuk command berisiko (state orang lain / uang / keluar grup),
//   4. mengembalikan objek `synthetic` agar handlers/messages.js yang menjalankan
//      plugin loop yang SUDAH ADA (tanpa logika eksekusi baru di sini).
//
// Kontrak ctx yang diharapkan (dikirim handler):
//   { jid, sender, isOwner, isOwnerAsync, reply(text) }
// - `isOwner`        : boolean (opsional)
// - `isOwnerAsync`   : async () => boolean (opsional; diprioritaskan)
// - `reply`          : fungsi kirim pesan ramah (opsional; dipakai saat penolakan)
//
// Kembalian dispatchToolCall:
//   { ok:true, message, synthetic:{cmd,args,body} }        -> eksekusi oleh handler
//   { ok:false, needConfirm:true, prompt, pending:{...} }  -> minta konfirmasi
//   { ok:false, message }                                  -> ditolak / dibatalkan
//
// PENTING: anti-rekursi dijaga oleh handler (flag ctx.__fromTool). File ini tidak
// pernah memanggil plugin loop, jadi tidak bisa membuat loop tak hingga.

const capabilities = require('./capabilities');

// ---------- Daftar command berisiko (butuh konfirmasi) ----------
// Kriteria: mengubah state orang lain, uang/saldo, atau mengeluarkan/mengundang
// anggota grup. Command owner sudah ditolak lebih awal untuk non-owner, tapi bila
// pemanggil owner sekalipun tetap kami minta konfirmasi untuk efek destruktif.
const RISKY_COMMANDS = new Set([
  'kick',        // keluarkan anggota
  'add',         // tambah/undang anggota
  'promote',     // jadikan admin
  'demote',      // turunkan admin
  'votekick',    // voting kick
  'mute',        // kunci grup
  'transfer',    // kirim saldo
  'resetlink',   // ganti link invite (mengganti tautan yang berlaku)
  'setname',     // ganti nama grup
  'setdesc',     // ganti deskripsi grup
  // 'mining' sengaja TIDAK masuk: hanya nambang saldo diri sendiri + cooldown,
  // tidak menyentuh orang/uang orang lain. Aman tanpa konfirmasi.
]);

// Alias yang dipetakan ke command berisiko (mis. 'kick' <- 'remove').
const RISKY_ALIASES = new Map([
  ['remove', 'kick'],
  ['unmute', 'unmute'], // unmute tidak destruktif; tidak dipakai, hanya dokumentasi
]);

function isRisky(capId) {
  if (RISKY_COMMANDS.has(capId)) return true;
  const canon = RISKY_ALIASES.get(capId);
  return !!(canon && RISKY_COMMANDS.has(canon));
}

// ---------- Konfirmasi ----------
const YES_RE = /^(?:iya+|ya+|oke+|ok+|lanjut|confirm(?:ed)?|setuju|gas|sip|yes|y|iyes+)\b[.!]?$/i;
const NO_RE = /^(?:tidak|tdk|nggak|ngga|gak|batal|cancel|batalkan|jangan|no|nope|ga)\b[.!]?$/i;

// pending: scopeKey(jid,sender) -> { id, command, args, reason, cap, expiresAt, jid, sender }
const pending = new Map();
// pendingById: id unik tombol -> scopeKey, supaya klik tombol bisa cocok tanpa menebak jid/sender.
// id acak mencegah user menekan tombol lama / tombol milik orang lain.
const pendingById = new Map();
const CONFIRM_TTL_MS = 60 * 1000; // 60 detik
let confirmSeq = 0;
function makeConfirmId() {
  // counter + timestamp + random cukup unik untuk TTL 60 detik tanpa dependency baru.
  confirmSeq += 1;
  return `cfm_${Date.now().toString(36)}_${confirmSeq.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
const YES_ID_PREFIX = 'cfm_yes_';
const NO_ID_PREFIX = 'cfm_no_';

function pendingKey(jid, sender) {
  return `${String(jid || '')}|${String(sender || '')}`;
}

function prune() {
  const now = Date.now();
  for (const [k, v] of pending) {
    if (!v || v.expiresAt <= now) {
      pending.delete(k);
      if (v && v.id) pendingById.delete(v.id);
    }
  }
}

function friendlyDeny(ctx, message) {
  try {
    if (ctx && typeof ctx.reply === 'function') ctx.reply(message);
  } catch {}
}

// Tombol konfirmasi pakai format proto Baileys v7 (rc14):
//   templateMessage.hydratedTemplate.hydratedButtons[].quickReplyButton
// Field `templateButtons` (gaya lama) TIDAK dikenal sendMessage rc14, jadi
// pesan tidak akan memuat tombol. Fallback teks tetap dipertahankan di messages.js.
function makeConfirmButton(id) {
  if (!id) return null;
  return {
    templateMessage: {
      hydratedTemplate: {
        hydratedContentText: '⚠️ Konfirmasi aksi ini.',
        hydratedButtons: [
          { quickReplyButton: { displayText: '✅ Yakin', id: `${YES_ID_PREFIX}${id}` } },
          { quickReplyButton: { displayText: '❌ Batal', id: `${NO_ID_PREFIX}${id}` } },
        ],
      },
    },
  };
}

// Pesan dengan tombol + teks identik dengan prompt fallback (tetap bisa diketik iya/batal).
function buildConfirmMessage(pendingEntry, promptText) {
  if (!pendingEntry || !pendingEntry.id) return null;
  const msg = makeConfirmButton(pendingEntry.id);
  if (!msg) return null;
  // Teks prompt jadi isi pesan tombol (hydratedContentText), bukan field `text`
  // — kalau dua-duanya ada, Baileys rc14 hanya pakai salah satu.
  if (promptText) {
    msg.templateMessage.hydratedTemplate.hydratedContentText = promptText;
  }
  return msg;
}

function normalizeCall(call) {
  if (!call || typeof call !== 'object') return null;
  const name = String(call.name || '').trim();
  if (name !== 'sonezz_run') return null;
  const a = call.arguments && typeof call.arguments === 'object' ? call.arguments : {};
  return {
    name,
    command: String(a.command || '').trim(),
    args: String(a.args || '').trim(),
    reason: String(a.reason || '').trim(),
  };
}

// ---------- API utama ----------
async function dispatchToolCall(ctx, call) {
  const normalized = normalizeCall(call);
  if (!normalized) {
    const msg = '⚠️ Tool call tidak dikenal. Hanya `sonezz_run` yang didukung.';
    friendlyDeny(ctx, msg);
    return { ok: false, message: msg };
  }

  const { command, args, reason } = normalized;
  const jid = ctx?.jid;
  const sender = ctx?.sender;

  // (0) Jika ada pending konfirmasi dan user menjawab ya/tidak, proses dulu
  //     SEBELUM validasi command — jawaban konfirmasi bukan "perintah baru".
  prune();
  const key = pendingKey(jid, sender);
  if (pending.has(key)) {
    if (YES_RE.test(args)) return consumeYes(key);
    if (NO_RE.test(args)) return consumeNo(ctx, key);
  }

  // (1) Validasi command: HARUS ada di katalog. AI dilarang mengarang fitur.
  const cap = command ? capabilities.getCapability(command) : null;
  if (!cap) {
    const msg =
      `❌ Aku nggak punya fitur \`${command || '(kosong)'}\`. ` +
      'Cek daftar command pakai `.menu` ya — aku cuma bisa menjalankan fitur yang memang tersedia.';
    friendlyDeny(ctx, msg);
    return { ok: false, message: msg, rejected: 'unknown-command' };
  }

  // (2) Validasi akses owner.
  if (cap.access === 'owner') {
    let allowed = false;
    try {
      if (ctx && typeof ctx.isOwnerAsync === 'function') {
        allowed = !!(await ctx.isOwnerAsync());
      } else if (ctx && typeof ctx.isOwner === 'function') {
        allowed = !!(await ctx.isOwner());
      } else {
        allowed = !!ctx?.isOwner;
      }
    } catch {
      allowed = false;
    }
    if (!allowed) {
      const msg =
        `🔒 Fitur \`.${cap.id}\` hanya untuk owner. ` +
        'Aku nggak bisa menjalankannya untuk kamu, ya.';
      friendlyDeny(ctx, msg);
      return { ok: false, message: msg, rejected: 'owner-only' };
    }
  }

  // (3) Konfirmasi command berisiko.
  if (isRisky(cap.id)) {
    const asks = {
      kick: 'mengeluarkan anggota',
      add: 'menambahkan anggota',
      promote: 'menjadikan admin',
      demote: 'menurunkan admin',
      votekick: 'memulai voting kick',
      mute: 'mengunci grup',
      transfer: 'mengirim saldo',
      resetlink: 'mengganti link grup',
      setname: 'mengganti nama grup',
      setdesc: 'mengganti deskripsi grup',
    };
    const label = asks[cap.id] || cap.description || cap.id;
    const preview = args ? `\n Argumen: \`${args}\`` : '';
    const prompt =
      `⚠️ Mau *${label}*?${preview}\n` +
      'Klik tombolnya ya — atau ketik *iya* / *batal*. Berlaku 60 detik.';
    const id = makeConfirmId();
    const entry = {
      id,
      command: cap.id,
      args,
      reason,
      cap: { ...cap },
      expiresAt: Date.now() + CONFIRM_TTL_MS,
      jid,
      sender,
    };
    pending.set(key, entry);
    pendingById.set(id, key);
    return {
      ok: false,
      needConfirm: true,
      prompt,
      confirmId: id,
      buttonMessage: buildConfirmMessage(entry, prompt),
      pending: { command: cap.id, args, id },
    };
  }

  // (4) Aman: langsung kembalikan synthetic untuk dieksekusi handler.
  return { ok: true, message: '', synthetic: syntheticFor(cap, args) };
}

function dropEntry(key, entry) {
  pending.delete(key);
  if (entry && entry.id) pendingById.delete(entry.id);
}

function consumeYes(key) {
  const p = pending.get(key);
  dropEntry(key, p);
  // Pakai command/args dari pending (bukan dari AI), supaya user yang memutuskan.
  return {
    ok: true,
    message: '✅ Oke, aku jalankan ya.',
    synthetic: syntheticFor(p.cap, p.args),
    confirmed: true,
  };
}

function consumeNo(ctx, key) {
  const entry = pending.get(key);
  dropEntry(key, entry);
  const msg = '👌 Oke, aku batalkan.';
  friendlyDeny(ctx, msg);
  return { ok: false, message: msg, cancelled: true };
}

// Dipakai handlers/messages.js untuk memproses balasan konfirmasi (iya/batal)
// secara langsung tanpa harus memanggil AI. Kembalian null bila tidak ada pending.
function confirmPending(ctx, text) {
  prune();
  const key = pendingKey(ctx?.jid, ctx?.sender);
  if (!pending.has(key)) return null;
  const t = String(text || '').trim();
  if (YES_RE.test(t)) return consumeYes(key);
  if (NO_RE.test(t)) return consumeNo(ctx, key);
  return null;
}

// Klik tombol: cocokkan id unik ke pending. Scope jid|sender + TTL dijaga supaya
// tombol lama / tombol milik orang lain tidak bisa mengeksekusi aksi.
function normalizeConfirmId(id) {
  let s = String(id || '');
  if (s.startsWith(YES_ID_PREFIX) || s.startsWith(NO_ID_PREFIX)) {
    s = s.slice(s.indexOf('_', s.indexOf('_') + 1) + 1); // buang cfm_yes_ / cfm_no_
  }
  return s;
}

function getPendingById(id, ctx) {
  prune();
  if (!id) return null;
  const clean = normalizeConfirmId(id);
  const key = pendingById.get(clean);
  if (!key) return null;
  const entry = pending.get(key);
  if (!entry || entry.id !== clean) {
    pendingById.delete(clean);
    return null;
  }
  if (ctx && (String(ctx.jid || '') !== String(entry.jid) || String(ctx.sender || '') !== String(entry.sender))) {
    return null;
  }
  return entry;
}

function consumePending(id, ctx) {
  const entry = getPendingById(id, ctx);
  if (!entry) return null;
  const key = pendingKey(entry.jid, entry.sender);
  const raw = String(id || '');
  if (raw.startsWith(NO_ID_PREFIX)) return consumeNo(ctx, key);
  // Default: ANY id yang cocok dianggap konfirmasi (id selalu ber-prefix YES saat dikirim).
  return consumeYes(key);
}

// Ekstrak id aksi dari field balasan tombol Baileys (template / plain / native flow).
function extractButtonId(m) {
  const msg = m?.message || {};
  return (
    msg.templateButtonReplyMessage?.selectedId ||
    msg.buttonsResponseMessage?.selectedButtonId ||
    (() => {
      const nf = msg.interactiveResponseMessage?.nativeFlowResponseMessage;
      if (!nf || !Array.isArray(nf.paramsJson)) return null;
      try {
        const parsed = JSON.parse(nf.paramsJson);
        return parsed?.id || null;
      } catch { return null; }
    })() ||
    null
  );
}

function syntheticFor(cap, args) {
  const cmd = cap.id;
  const a = String(args || '').trim();
  return { cmd, args: a, body: a ? `${cmd} ${a}` : cmd };
}

// Diperluas untuk test/observabilitas (tidak dipakai runtime bot).
function hasPending(jid, sender) {
  prune();
  return pending.has(pendingKey(jid, sender));
}

function clearPending(jid, sender) {
  pending.delete(pendingKey(jid, sender));
}

function isConfirmationText(text) {
  const t = String(text || '').trim();
  return { yes: YES_RE.test(t), no: NO_RE.test(t) };
}

module.exports = {
  dispatchToolCall,
  confirmPending,
  makeConfirmButton,
  buildConfirmMessage,
  getPendingById,
  consumePending,
  extractButtonId,
  isRisky,
  hasPending,
  clearPending,
  isConfirmationText,
  RISKY_COMMANDS,
  YES_RE,
  NO_RE,
  _pending: pending, // untuk unit test saja
};
