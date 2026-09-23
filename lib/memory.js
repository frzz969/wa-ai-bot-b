// Memory chat: 10 pesan terakhir per JID (in-memory Map)
const config = require('../config');
const { getOrAssignLabel, formatGroupMessage, buildGroupPrompt, GROUP_INSTRUCTIONS } = require('./groupContext');
const { PERSONA_STYLE, EMOJI_GUIDE_SHORT } = require('./persona');

const store = new Map(); // jid -> [{ role: 'user'|'bot', content: string, senderId?, displayName?, label?, quotedText?, mentions? }]

// Backward-compatible: param ke-4 senderMeta opsional { senderId, displayName, quotedText, mentions }.
// Hanya dipakai untuk grup (@g.us); private mengabaikannya (format lama tetap).
function pushMessage(jid, role, content, senderMeta) {
  if (!jid) return;
  const text = String(content || '').slice(0, 2000);
  if (!text) return;
  if (!store.has(jid)) store.set(jid, []);
  const arr = store.get(jid);
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
  while (arr.length > config.MEMORY_LIMIT) arr.shift();
}

function getHistory(jid) {
  return store.get(jid) || [];
}

function clearHistory(jid) {
  store.delete(jid);
}

// Alias sesuai perintah bot
function clearMemory(jid) {
  store.delete(jid);
}

function getMemory(jid) {
  return store.get(jid) || [];
}

function countChats() {
  return store.size;
}

// Bangun prompt dengan konteks riwayat agar AI "ingat" percakapan
// Total konteks dipotong maks ~6000 char sebelum dikirim ke AI
// Backward-compatible: param ke-3 opts opsional untuk GRUP saja:
// { isGroup: true, senderId, displayName, quotedText, mentions }.
// Tanpa opts (private & semua caller lama) -> format User:/Bot: tetap,
// ditambah PERSONA_STYLE + EMOJI_GUIDE ringkas (tanpa aturan grup).
// Jalur grup otomatis ikut persona+emoji via GROUP_INSTRUCTIONS.
function buildContextPrompt(jid, newText, opts) {
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
    const history = getHistory(jid);
    if (history.length === 0) return String(GROUP_INSTRUCTIONS + tail).slice(0, 6000);
    const lines = buildGroupPrompt(history);
    let ctx = GROUP_INSTRUCTIONS + 'Riwayat percakapan grup terakhir:\n' + lines;
    const maxCtx = Math.max(0, 6000 - tail.length);
    if (ctx.length > maxCtx) ctx = ctx.slice(-maxCtx); // simpan bagian terbaru
    return ctx + tail;
  }
  const tail = `\n${PERSONA_STYLE}${EMOJI_GUIDE_SHORT}User: ${newText}\nJawab dengan natural dalam Bahasa Indonesia, singkat tapi membantu:`;
  const history = getHistory(jid);
  if (history.length === 0) return String(tail).slice(0, 6000);
  const lines = history.map((h) =>
    h.role === 'user' ? `User: ${h.content}` : `Bot: ${h.content}`
  );
  let ctx = 'Riwayat percakapan terakhir:\n' + lines.join('\n');
  const maxCtx = Math.max(0, 6000 - tail.length);
  if (ctx.length > maxCtx) ctx = ctx.slice(-maxCtx); // simpan bagian terbaru
  return ctx + tail;
}

module.exports = { pushMessage, getHistory, clearHistory, clearMemory, getMemory, countChats, buildContextPrompt };
