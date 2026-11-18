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

// pending: scopeKey(jid,sender) -> { command, args, reason, cap, expiresAt }
const pending = new Map();
const CONFIRM_TTL_MS = 60 * 1000; // 60 detik

function pendingKey(jid, sender) {
  return `${String(jid || '')}|${String(sender || '')}`;
}

function prune() {
  const now = Date.now();
  for (const [k, v] of pending) {
    if (!v || v.expiresAt <= now) pending.delete(k);
  }
}

function friendlyDeny(ctx, message) {
  try {
    if (ctx && typeof ctx.reply === 'function') ctx.reply(message);
  } catch {}
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
      `⚠️ Aksi ini akan *${label}*.${preview}\n` +
      'Ketik *iya* untuk lanjut, atau *batal* untuk membatalkan (berlaku 60 detik).';
    pending.set(key, {
      command: cap.id,
      args,
      reason,
      cap: { ...cap },
      expiresAt: Date.now() + CONFIRM_TTL_MS,
    });
    return { ok: false, needConfirm: true, prompt, pending: { command: cap.id, args } };
  }

  // (4) Aman: langsung kembalikan synthetic untuk dieksekusi handler.
  return { ok: true, message: '', synthetic: syntheticFor(cap, args) };
}

function consumeYes(key) {
  const p = pending.get(key);
  pending.delete(key);
  // Pakai command/args dari pending (bukan dari AI), supaya user yang memutuskan.
  return {
    ok: true,
    message: '✅ Oke, aku jalankan ya.',
    synthetic: syntheticFor(p.cap, p.args),
    confirmed: true,
  };
}

function consumeNo(ctx, key) {
  pending.delete(key);
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
  isRisky,
  hasPending,
  clearPending,
  isConfirmationText,
  RISKY_COMMANDS,
  YES_RE,
  NO_RE,
  _pending: pending, // untuk unit test saja
};
