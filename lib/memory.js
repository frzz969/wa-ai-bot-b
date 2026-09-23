// Memory chat: 10 pesan terakhir per JID (in-memory Map)
const config = require('../config');

const store = new Map(); // jid -> [{ role: 'user'|'bot', content: string }]

function pushMessage(jid, role, content) {
  if (!jid) return;
  const text = String(content || '').slice(0, 2000);
  if (!text) return;
  if (!store.has(jid)) store.set(jid, []);
  const arr = store.get(jid);
  arr.push({ role, content: text });
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
function buildContextPrompt(jid, newText) {
  const tail = `\nUser: ${newText}\nJawab dengan natural dalam Bahasa Indonesia, singkat tapi membantu:`;
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
