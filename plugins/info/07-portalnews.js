// plugins/info/07-portalnews.js — berita per portal via API yang SAMA dengan .news.
// .news existing (plugins/info/05-webinfo.js) memakai googleNews() dari lib/tools.js
// (Google News RSS, tanpa API key). File ini hanya menambah command tipis per portal:
// tiap command = query site:<domain> ke googleNews() + cantumkan sumber/link.
// Tanpa API key / service baru. Kontrak: async (ctx) => boolean.
// Command: cnn, kompas, detik, tempo, okezone, tribun, cnbc
const S = require('../../handlers/state');
const { safeReply, interim, googleNews, pushMessage } = S;

const PORTALS = {
  cnn: { label: 'CNN Indonesia', domain: 'cnnindonesia.com' },
  kompas: { label: 'Kompas', domain: 'kompas.com' },
  detik: { label: 'Detik', domain: 'detik.com' },
  tempo: { label: 'Tempo', domain: 'tempo.co' },
  okezone: { label: 'Okezone', domain: 'okezone.com' },
  tribun: { label: 'Tribunnews', domain: 'tribunnews.com' },
  cnbc: { label: 'CNBC Indonesia', domain: 'cnbcindonesia.com' },
};

async function handlePortalNews(ctx) {
  const { sock, m, jid, cmd, args, prefix } = ctx;
  const p = PORTALS[cmd];
  if (!p) return false;
  const topic = String(args || '').trim();
  // Pola SAMA persis dengan .news: googleNews(topik). Bedanya query dibatasi
  // ke domain portal via operator site: (didukung Google News RSS).
  const q = topic ? topic + ' site:' + p.domain : 'site:' + p.domain;
  await interim(sock, jid, m, '📰 Lagi ambil berita ' + p.label + '...');
  try {
    const list = await googleNews(q);
    if (!list.length) throw new Error('kosong');
    const out = list
      .map((n, i) => (i + 1) + '. *' + n.title + '*\n   🗓️ ' + n.pubDate + (n.link ? '\n   🔗 ' + n.link : ''))
      .join('\n\n');
    const head = topic
      ? '📰 *' + p.label + ' — "' + topic + '":*'
      : '📰 *Berita terbaru ' + p.label + ':*';
    const text = head + '\n\n' + out + '\n\n_Sumber: ' + p.label + ' (' + p.domain + ')_';
    try {
      pushMessage(jid, 'user', '.' + cmd + (topic ? ' ' + topic : ''));
      pushMessage(jid, 'bot', out.slice(0, 2000));
    } catch {}
    await safeReply(sock, jid, text, m);
    return true;
  } catch (e) {
    console.error('portalnews:' + cmd, (e && e.message) || e);
    await safeReply(sock, jid, '❌ Gagal ambil berita ' + p.label + '. Coba topik lain / ulangi sebentar lagi.\n_(Contoh: ' + prefix + cmd + ' timnas)_', m);
    return true;
  }
}

module.exports = { handlePortalNews };
