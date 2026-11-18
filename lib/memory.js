// Memory chat: riwayat per-user (isolasi di grup) + ringkasan + preferensi.
// Fase 4 (Conversation Memory). API lama tetap kompatibel.
//
// Kunci store dulu = jid saja (semua anggota grup berbagi memori). Sekarang:
//   key = scopeKey(jid, sender) bila sender tersedia, else jid (fallback lama).
// private tetap identik karena caller lama tidak mengirim sender -> key = jid.
//
// Signature kompatibel: pushMessage(jid, role, content, opts)
//   opts lama: { senderId, displayName, quotedText, mentions } (grup)
//   opts baru: + { sender } / { senderId } dipakai untuk isolasi scope.
//   CATATAN: `senderId` sudah dipakai groupContext sebagai ID tampilan pesan.
//   Untuk isolasi kami terima `opts.sender` (prioritas) ATAU `opts.senderId`
//   bila `opts.sender` tidak ada — keduanya mengarah ke pengirim yang sama.
//
// Fungsi baru: setSummary/getSummary, setPref/getPrefs/clearPref, resolveMemoryKey.

const config = require('../config');
const store = require('./memory-store');
const { getOrAssignLabel, formatGroupMessage, buildGroupPrompt, GROUP_INSTRUCTIONS } = require('./groupContext');
const { PERSONA_STYLE, EMOJI_GUIDE_SHORT } = require('./persona');

// Map(scope -> { messages:[...], summary:'', prefs:{} }) — disimpan di store.dataRef
let db = store.load();
store.attach(db);
store.pruneExpired();

const SUMMARY_MAX = 4000;
const PREF_VALUE_MAX = 1000;
const PREF_KEY_MAX = 100;
const MAX_PREFS = 50;

function now() { return Date.now(); }

function touch(scope) {
  const rec = db[scope] || (db[scope] = { messages: [], summary: '', prefs: {}, updatedAt: 0 });
  rec.updatedAt = now();
  return rec;
}

function normalizeScope(jid) { return String(jid || ''); }

// Ambil pengirim dari opts. `sender` prioritas; `senderId` fallback.
function extractSender(opts) {
  if (!opts || typeof opts !== 'object') return '';
  const s = opts.sender !== undefined ? opts.sender : opts.senderId;
  return String(s || '').trim();
}

// Kunci memory: scopeKey(jid, sender) bila sender ada, else jid (fallback lama).
// Fungsi ini diekspor agar caller lain bisa pakai bila mereka diperbarui.
function resolveMemoryKey(jid, opts) {
  const j = normalizeScope(jid);
  if (!j) return '';
  const sender = extractSender(opts);
  if (!sender) return j; // perilaku lama (private & caller tanpa sender)
  // Mengikuti format scopeKey di handlers/helpers.js: `${jid}|${sender}`.
  // Tidak require helpers di sini untuk menjaga memory.js tetap mandiri.
  return `${j}|${sender}`;
}

// Backward-compatible: param ke-4 senderMeta opsional { senderId, displayName,
// quotedText, mentions, sender?, senderId? }. Hanya dipakai untuk grup (@g.us).
// Private mengabaikan meta grup (format lama tetap), tapi Tetap memakai scope
// bila opts.sender dikirim (isolasi private multi-sender bila diperlukan nanti).
function pushMessage(jid, role, content, senderMeta) {
  if (!jid) return;
  const text = String(content || '').slice(0, 2000);
  if (!text) return;
  const scope = resolveMemoryKey(jid, senderMeta);
  if (!scope) return;
  const rec = db[scope] || (db[scope] = { messages: [], summary: '', prefs: {}, updatedAt: 0 });
  const arr = rec.messages || (rec.messages = []);
  const entry = { role, content: text };
  if (senderMeta && role === 'user' && String(jid || '').endsWith('@g.us')) {
    const sid = String(senderMeta.senderId || '').trim();
    const dname = String(senderMeta.displayName || '').trim();
    if (sid || dname) {
      const meta = getOrAssignLabel(jid, sid, dname);
      entry.senderId = sid;
      entry.displayName = dname.slice(0, 30) || meta.displayName;
      entry.label = meta.label;
      const q = String(senderMeta.quotedText || '').trim();
      if (q) entry.quotedText = q.slice(0, 300);
      if (Array.isArray(senderMeta.mentions) && senderMeta.mentions.length) {
        entry.mentions = senderMeta.mentions.map((x) => String(x)).filter(Boolean).slice(0, 10);
      }
    }
  }
  arr.push(entry);
  const limit = Number(config.MEMORY_LIMIT) || 10;
  while (arr.length > limit) arr.shift();
  touch(scope);
  store.scheduleSave();
}

function getHistory(jid, opts) {
  const scope = resolveMemoryKey(jid, opts);
  const rec = db[scope];
  return rec && Array.isArray(rec.messages) ? rec.messages : [];
}

function clearHistory(jid, opts) {
  const scope = resolveMemoryKey(jid, opts);
  if (scope) store.deleteScope(scope);
}

// Alias sesuai perintah bot
function clearMemory(jid, opts) {
  clearHistory(jid, opts);
}

function getMemory(jid, opts) {
  return getHistory(jid, opts);
}

function countChats() {
  return Object.keys(db).length;
}

// ---------- Ringkasan konteks (API saja; tidak memanggil AI) ----------
function setSummary(scope, text, opts) {
  const key = opts ? resolveMemoryKey(scope, opts) : normalizeScope(scope);
  if (!key) return false;
  const rec = db[key] || (db[key] = { messages: [], summary: '', prefs: {}, updatedAt: 0 });
  rec.summary = String(text || '').slice(0, SUMMARY_MAX);
  touch(key);
  store.scheduleSave();
  return true;
}

function getSummary(scope, opts) {
  const key = opts ? resolveMemoryKey(scope, opts) : normalizeScope(scope);
  const rec = db[key];
  return rec && rec.summary ? rec.summary : '';
}

// ---------- Preferensi pengguna ----------
function setPref(scope, key, value, opts) {
  const s = opts ? resolveMemoryKey(scope, opts) : normalizeScope(scope);
  const k = String(key || '').trim().slice(0, PREF_KEY_MAX);
  if (!s || !k) return false;
  const rec = db[s] || (db[s] = { messages: [], summary: '', prefs: {}, updatedAt: 0 });
  if (!rec.prefs || typeof rec.prefs !== 'object' || Array.isArray(rec.prefs)) rec.prefs = {};
  if (!Object.prototype.hasOwnProperty.call(rec.prefs, k) && Object.keys(rec.prefs).length >= MAX_PREFS) {
    // Penuh: buang preferensi tertua (insertion order) supaya tidak unbounded.
    const oldest = Object.keys(rec.prefs)[0];
    if (oldest) delete rec.prefs[oldest];
  }
  rec.prefs[k] = String(value === undefined || value === null ? '' : value).slice(0, PREF_VALUE_MAX);
  touch(s);
  store.scheduleSave();
  return true;
}

function getPrefs(scope, opts) {
  const key = opts ? resolveMemoryKey(scope, opts) : normalizeScope(scope);
  const rec = db[key];
  return rec && rec.prefs && typeof rec.prefs === 'object' && !Array.isArray(rec.prefs)
    ? { ...rec.prefs }
    : {};
}

function clearPref(scope, key) {
  const rec = db[normalizeScope(scope)];
  if (!rec || !rec.prefs) return false;
  if (key === undefined || key === null || key === '') {
    rec.prefs = {};
  } else {
    delete rec.prefs[String(key)];
  }
  touch(normalizeScope(scope));
  store.scheduleSave();
  return true;
}

// Blok ringkasan + preferensi untuk disisipkan ke prompt.
function buildExtras(jid, opts) {
  const parts = [];
  const summary = getSummary(jid, opts);
  if (summary) parts.push(`Ringkasan percakapan sebelumnya: ${summary}`);
  const prefs = getPrefs(jid, opts);
  const entries = Object.entries(prefs).filter(([, v]) => v !== '');
  if (entries.length) {
    parts.push('Preferensi user: ' + entries.map(([k, v]) => `${k}=${v}`).join('; '));
  }
  if (!parts.length) return '';
  return parts.join('\n') + '\n';
}

// Bangun prompt dengan konteks riwayat agar AI "ingat" percakapan
// Total konteks dipotong maks ~6000 char sebelum dikirim ke AI
// Backward-compatible: param ke-3 opts opsional untuk GRUP saja:
// { isGroup: true, senderId, displayName, quotedText, mentions, sender? }.
// Tanpa opts (private & semua caller lama) -> format User:/Bot: tetap,
// ditambah PERSONA_STYLE + EMOJI_GUIDE ringkas (tanpa aturan grup).
function buildContextPrompt(jid, newText, opts) {
  const extras = buildExtras(jid, opts);
  if (opts && opts.isGroup && String(jid || '').endsWith('@g.us')) {
    const sid = String(opts.senderId || '').trim();
    const dname = String(opts.displayName || '').trim();
    const meta = getOrAssignLabel(jid, sid, dname);
    const cur = formatGroupMessage({
      senderId: sid,
      displayName: dname || meta.displayName,
      label: meta.label,
      text: String(newText || ''),
      quotedText: opts.quotedText || '',
      mentions: opts.mentions || [],
    });
    const tail = `\n${cur}\nJawab dengan natural dalam Bahasa Indonesia, singkat tapi membantu:`;
    const history = getHistory(jid, opts);
    if (history.length === 0) return String(GROUP_INSTRUCTIONS + extras + tail).slice(0, 6000);
    const lines = buildGroupPrompt(history);
    let ctx = GROUP_INSTRUCTIONS + extras + 'Riwayat percakapan grup terakhir:\n' + lines;
    const maxCtx = Math.max(0, 6000 - tail.length);
    if (ctx.length > maxCtx) ctx = ctx.slice(-maxCtx); // simpan bagian terbaru
    return ctx + tail;
  }
  const tail = `\n${PERSONA_STYLE}${EMOJI_GUIDE_SHORT}User: ${newText}\nJawab dengan natural dalam Bahasa Indonesia, singkat tapi membantu:`;
  const history = getHistory(jid, opts);
  if (history.length === 0) return String(extras + tail).slice(0, 6000);
  const lines = history.map((h) =>
    h.role === 'user' ? `User: ${h.content}` : `Bot: ${h.content}`
  );
  let ctx = extras + 'Riwayat percakapan terakhir:\n' + lines.join('\n');
  const maxCtx = Math.max(0, 6000 - tail.length);
  if (ctx.length > maxCtx) ctx = ctx.slice(-maxCtx); // simpan bagian terbaru
  return ctx + tail;
}

// Ekspos penulisan eksplisit (berguna untuk test / administrasi).
function flush() { return store.flush(); }

module.exports = {
  pushMessage,
  getHistory,
  clearHistory,
  clearMemory,
  getMemory,
  countChats,
  buildContextPrompt,
  resolveMemoryKey,
  setSummary,
  getSummary,
  setPref,
  getPrefs,
  clearPref,
  flush,
};
