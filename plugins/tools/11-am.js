// plugins/tools/11-am.js — AM Premium (API kedua: https://am.dapjisync.my.id)
// Diekstrak pola dari plugins/tools/10-tools.js; tanpa perubahan perilaku lain.
// Dipanggil router handlers/messages.js otomatis via lib/plugin-loader.js. Return true = tertangani.
// Kontrak: async (ctx) => boolean, ctx = { sock, m, jid, sender, cmd, args, prefix }
const S = require('../../handlers/state');
const { safeReply, interim } = S;

// Web https://am.dapjisync.my.id pakai PUBLIC_API_KEY='FREE' hardcode —
// bot meniru persis: setiap request kirim header X-API-Key: FREE.
const AM_API_BASE = 'https://am.dapjisync.my.id';
const AM_API_KEY = 'FREE';

function getAmConfig() {
  return { base: AM_API_BASE, key: AM_API_KEY };
}

// Map memory module: sender -> gmail (dipakai amverif setelah ampremfree)
const pendingGmail = new Map();

async function loading(sock, jid, m, text) {
  try {
    if (typeof interim === 'function') await interim(sock, jid, m, text);
    else await safeReply(sock, jid, text, m);
  } catch {}
}

function pickMessage(data, fallback) {
  const v = data && (data.message || data.msg || data.error || data.detail);
  const s = String(v == null ? '' : v).trim();
  return s || fallback;
}

async function postJson(url, key, body, timeoutMs) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs || 25000),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { res, data };
}

async function handleAm(ctx) {
  const { sock, m, jid, sender, cmd, args, prefix } = ctx;

  if (cmd === 'ampremfree') {
    try {
      const gmail = String(args || '').trim().toLowerCase();
      if (!gmail || !/^[a-z0-9._%+-]+@gmail\.com$/.test(gmail)) {
        await safeReply(sock, jid, `❌ Gmail tidak valid.\nContoh: ${prefix}ampremfree user@gmail.com\nGmail harus berakhiran @gmail.com ya.`, m);
        return true;
      }
      const { base, key } = getAmConfig();
      await loading(sock, jid, m, '📩 Lagi mengirim link premium ke Gmail...');
      let res, data;
      try {
        ({ res, data } = await postJson(`${base}/api/send`, key, { gmail }));
      } catch (e) {
        console.error('ampremfree', e?.message || e);
        await safeReply(sock, jid, '❌ Gagal mengirim link. Server AM sedang sibuk, coba lagi sebentar ya.', m);
        return true;
      }
      const ok = res.ok && (data == null || data.success === undefined || data.success === true);
      if (ok) {
        pendingGmail.set(String(sender), gmail);
        await safeReply(
          sock, jid,
          `✅ *Link premium terkirim ke ${gmail}!*\n\n` +
          `📬 Langkah selanjutnya:\n` +
          `1. Buka inbox Gmail (cek folder Spam/Promosi juga)\n` +
          `2. Klik link verifikasi di email tersebut, atau salin link-nya\n` +
          `3. Balik ke sini lalu ketik:\n` +
          `   ${prefix}amverif <tempel link di sini>\n\n` +
          `_Link hanya berlaku sebentar, segera verifikasi ya._`,
          m
        );
        return true;
      }
      const msg = pickMessage(data, '');
      if (/invalid|tidak valid/i.test(msg)) {
        await safeReply(sock, jid, '❌ Gmail tidak valid menurut server. Cek lagi alamat Gmail-nya ya.', m);
        return true;
      }
      if (/limit|kuota|quota|habis|rate/i.test(msg)) {
        await safeReply(sock, jid, '❌ Limit pengiriman habis. Coba lagi besok ya.', m);
        return true;
      }
      await safeReply(sock, jid, `❌ Gagal mengirim link.${msg ? `\n_${msg.slice(0, 200)}_` : '\nCoba lagi sebentar ya.'}`, m);
      return true;
    } catch (e) {
      console.error('ampremfree', e?.message || e);
      await safeReply(sock, jid, '❌ Gagal mengirim link. Coba lagi sebentar ya.', m);
      return true;
    }
  }

  if (cmd === 'amverif') {
    try {
      const link = String(args || '').trim();
      const gmail = pendingGmail.get(String(sender)) || '';
      if (!gmail) {
        await safeReply(sock, jid, `❌ Belum ada Gmail terdaftar.\nKirim dulu: ${prefix}ampremfree user@gmail.com`, m);
        return true;
      }
      if (!link || !link.startsWith('https://')) {
        await safeReply(sock, jid, `❌ Link tidak valid.\nContoh: ${prefix}amverif https://...\nTempel magic link lengkap dari email ya.`, m);
        return true;
      }
      const { base, key } = getAmConfig();
      await loading(sock, jid, m, '🔐 Lagi verifikasi link premium...');
      let res, data;
      try {
        ({ res, data } = await postJson(`${base}/api/verif`, key, { gmail, link }));
      } catch (e) {
        console.error('amverif', e?.message || e);
        await safeReply(sock, jid, '❌ Verifikasi gagal. Server AM sedang sibuk, coba lagi sebentar ya.', m);
        return true;
      }
      const ok = res.ok && (data == null || data.success === undefined || data.success === true);
      if (ok) {
        pendingGmail.delete(String(sender));
        await safeReply(
          sock, jid,
          `🎉 *Premium AM aktif untuk ${gmail}!*\n\n` +
          `Masa aktif: 1 tahun. Nikmati fitur premium-nya ya! ✨`,
          m
        );
        return true;
      }
      const msg = pickMessage(data, '');
      if (/oob|expired|kedaluwarsa|invalid|tidak valid/i.test(msg)) {
        await safeReply(sock, jid, `❌ Link kedaluwarsa / tidak valid.\nUlangi dari awal: ${prefix}ampremfree ${gmail}`, m);
        return true;
      }
      await safeReply(sock, jid, `❌ Verifikasi gagal.${msg ? `\n_${msg.slice(0, 200)}_` : `\nUlangi: ${prefix}ampremfree ${gmail} lalu ${prefix}amverif <link baru>.`}`, m);
      return true;
    } catch (e) {
      console.error('amverif', e?.message || e);
      await safeReply(sock, jid, '❌ Verifikasi gagal. Coba lagi sebentar ya.', m);
      return true;
    }
  }

  if (cmd === 'ampremtemp') {
    try {
      // Bulk = server yang bikinin email temp + aktivasi sekaligus. Max 2 biar enteng,
      // sekaligus tidak pernah menyentuh cooldown 90 detik (itu hanya untuk total >= 4).
      let total = parseInt(String(args || '').trim(), 10);
      if (isNaN(total)) total = 1;
      if (total < 1) total = 1;
      if (total > 2) {
        await safeReply(sock, jid, `❌ Maksimal 2 akun per request biar server enteng.\nContoh: ${prefix}ampremtemp 2 (atau tanpa angka = 1 akun)`, m);
        return true;
      }
      const { base, key } = getAmConfig();
      await loading(sock, jid, m, `⏳ Lagi generate ${total} akun premium (email temp)...\nIni agak lama, tunggu ya.`);
      let res, data;
      try {
        ({ res, data } = await postJson(`${base}/api/bulk`, key, { total }, 90000));
      } catch (e) {
        console.error('ampremtemp', e?.message || e);
        await safeReply(sock, jid, '❌ Generate gagal. Server AM sedang sibuk, coba lagi sebentar ya.', m);
        return true;
      }
      const emails = (data && (data.data?.emails || data.emails)) || [];
      const ok = res.ok && (data?.status === true || data?.success === true || Array.isArray(emails)) && emails.length > 0;
      if (ok) {
        const lines = emails.slice(0, total).map((a, i) => {
          const email = a.email || a.gmail || '-';
          const inbox = a.access_link || a.inbox || a.link || '-';
          return `*${i + 1}. ${email}*\n📥 Inbox: ${inbox}`;
        });
        await safeReply(
          sock, jid,
          `🎉 *Premium AM jadi (email temp)!*\n⏳ Masa aktif: 1 tahun.\n\n${lines.join('\n\n')}\n\n` +
          `🔑 *Cara login (tanpa sandi):*\n` +
          `1. Buka link Inbox di atas\n` +
          `2. Cari email sign-in dari Alight Motion\n` +
          `3. Klik magic link di email itu → otomatis login premium di aplikasi._`,
          m
        );
        return true;
      }
      const msg = pickMessage(data, '');
      if (/limit|cooldown|banyak|rate|tunggu/i.test(msg)) {
        await safeReply(sock, jid, '⏳ Server lagi padat / kena cooldown. Tunggu 1-2 menit lalu coba lagi ya.', m);
        return true;
      }
      await safeReply(sock, jid, `❌ Generate gagal.${msg ? `\n_${msg.slice(0, 200)}_` : '\nCoba lagi sebentar ya.'}`, m);
      return true;
    } catch (e) {
      console.error('ampremtemp', e?.message || e);
      await safeReply(sock, jid, '❌ Generate gagal. Coba lagi sebentar ya.', m);
      return true;
    }
  }

  return false;
}

module.exports = { handleAm };
