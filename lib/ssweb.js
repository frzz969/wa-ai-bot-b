// lib/ssweb.js — screenshot web LOKAL via playwright (bila terinstal), tanpa API/trial
// Bila playwright + browser belum ada → pesan error jelas (bukan crash).
// Contoh router:
//   const { handleSsweb } = require('../lib/ssweb');
//   if (cmd === 'ssweb') return await handleSsweb(sock, jid, m, args);

let playwright = null;
try {
  playwright = require('playwright');
} catch {
  playwright = null;
}

function normalizeUrl(input) {
  let s = String(input || '').trim().split(/\s+/)[0] || '';
  if (!s) throw new Error('Contoh: .ssweb https://google.com');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new Error('❌ URL tidak valid: ' + s);
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('❌ URL harus http(s).');
  return u.toString();
}

// URL → PNG buffer (full page opsional). Butuh paket `playwright` + browser.
async function ssweb(url, opts) {
  const target = normalizeUrl(url);
  if (!playwright) {
    throw new Error(
      '❌ Screenshot butuh `playwright` yang belum terinstal.\n' +
      'Jalankan: npm i playwright && npx playwright install chromium'
    );
  }
  const o = Object.assign({ fullPage: false, width: 1280, height: 800, timeout: 30000 }, opts || {});
  let browser = null;
  try {
    browser = await playwright.chromium.launch();
    const page = await browser.newPage({ viewport: { width: o.width, height: o.height } });
    await page.goto(target, { waitUntil: 'networkidle', timeout: o.timeout });
    return await page.screenshot({ type: 'png', fullPage: !!o.fullPage });
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/executable|browser/i.test(msg)) {
      throw new Error('❌ Browser playwright belum terinstal. Jalankan: npx playwright install chromium');
    }
    throw new Error('❌ Gagal screenshot: ' + msg.slice(0, 300));
  } finally {
    try {
      if (browser) await browser.close();
    } catch {}
  }
}

async function handleSsweb(sock, jid, m, args) {
  if (!args) return await sock.sendMessage(jid, { text: 'Contoh: .ssweb https://google.com' }, { quoted: m });
  try {
    await sock.sendMessage(jid, { text: '📸 Lagi screenshot...' }, { quoted: m }).catch(() => {});
  } catch {}
  try {
    const png = await ssweb(args.split(/\s+/)[0]);
    await sock.sendMessage(jid, { image: png, caption: '📸 ' + args.split(/\s+/)[0] }, { quoted: m });
  } catch (e) {
    console.error('ssweb', (e && e.message) || e);
    await sock.sendMessage(jid, { text: String((e && e.message) || '❌ Gagal screenshot.') }, { quoted: m });
  }
}

module.exports = { ssweb, handleSsweb };
