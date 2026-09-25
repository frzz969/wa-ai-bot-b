// lib/iqc.js — command .iqc (iPhone Quoted Chat) via RENDER LOKAL (tanpa API/network).
// CommonJS. Pola pakai mengikuti handlers/messages.js:
//   const { handleIqc } = require('../lib/iqc');
//   if (cmd === 'iqc') return await handleIqc(sock, jid, m, args);
// Isi args = teks quote (boleh reply pesan: teks reply dipakai bila args kosong).
//
// Reference layout (sumber kebenaran geometri): 864x1536 portrait.
// - Status bar atas: sinyal kiri, carrier 'TELKOMSEL PAKAI...', LTE,
//   jam 21:18 di tengah, refresh icon kanan, 59%, baterai hijau.
// - TANPA foreground chat header dan TANPA composer/input bar bawah.
// - Background/header/profile di-blur (bubble palsu hijau + gelap).
// - Reaction bar: x=18 y=422 w=660 h=122 rx=61, tepat 6 PNG lokal
//   (thumbs-up, heart, joy, open-mouth, cry, pray).
// - Bubble pesan: x=18 y=578 w=fit-content min 145 max 658, fill #353639, berekor,
//   padding 18px 76px 24px 24px (kanan/bawah diperlebar sebagai zona timestamp),
//   teks 27px, emoji via PNG lokal 38x38
//   (termasuk hand-over-mouth untuk 🤭), timestamp absolute kanan-bawah
//   di zona kanan yang dikosongkan (right 18 / bottom 14 baseline,
//   setengah menempel baris terakhir, tanpa menimpa teks).
// - Menu 7 baris: x=18 w=625, row 108, mulai bubble+22, fill #353638,
//   separator, label kiri + ikon SVG kanan, Hapus merah.

const fs = require('fs');
const path = require('path');

const W = 864;
const H = 1536;

// Geometri referensi (jangan diubah tanpa update template HTML).
const GEO = {
  statusH: 64,
  pill: { x: 18, y: 422, w: 660, h: 122, rx: 61 },
  bubble: {
    x: 18, y: 578,
    maxW: 658, minW: 145,
    rx: 25, fill: '#353639',
    padL: 24, padR: 76, padT: 18, padB: 24,
    lineH: 45, maxChars: 34, charW: 14.2,
    w: 658, minH: 137,
    // Zona timestamp kanan-bawah (jarak dari tepi bubble).
    // bottom = baseline; 14 menaikkan stamp agar setengah menempel
    // baris terakhir (contentBottom+10), kanan 18 agar kompak.
    // padB 24 + insetB 14 menjaga offset stamp vs teks (padB-insetB=10)
    // sambil merapatkan tepi bawah bubble ke bawah timestamp (~9px).
    timeInsetR: 18, timeInsetB: 34,
  },
  menu: { x: 18, w: 625, rowH: 108, gap: 22, fill: '#353638' },
  bubbleFs: 27,
  timeDefault: '21:18',
  carrier: 'TELKOMSEL PAKAI...',
  batteryDefault: 59,
};

const C = {
  bg: '#0B141A',
  bubbleOut: '#005C4B',
  pill: '#2E3238',
  text: '#E9EDEF',
  sub: '#A7ACB1',
  green: '#35C759',
  red: '#F15C6D',
};

const TEMPLATE_FILE = path.join(__dirname, 'iqc-template.html');

const IQC_BASE = 'https://brat.siputzx.my.id/iphone-quoted';
const IQC_DEFAULTS = {
  carrierName: 'INDOSAT',
  signalStrength: 4,
  emojiStyle: 'apple',
};

const MENU_ITEMS = [
  { label: 'Beri Bintang', danger: false, icon: 'star' },
  { label: 'Balas', danger: false, icon: 'reply' },
  { label: 'Teruskan', danger: false, icon: 'forward' },
  { label: 'Salin', danger: false, icon: 'copy' },
  { label: 'Ucapkan', danger: false, icon: 'speak' },
  { label: 'Laporkan', danger: false, icon: 'flag' },
  { label: 'Hapus', danger: true, icon: 'trash' },
];

// Ikon menu 38x38 (stroke-based, digambar di KANAN baris).
const ICONS = {
  star: '<path d="M19 5l4.2 8.6 9.4 1.3-6.8 6.6 1.6 9.4L19 26.4l-8.4 4.5 1.6-9.4L5.4 14.9l9.4-1.3z"/>',
  reply: '<path d="M15 8l-8 8 8 8"/><path d="M8 16h12a8 8 0 0 1 0 16h-6"/>',
  forward: '<path d="M23 8l8 8-8 8"/><path d="M30 16H18a8 8 0 0 0 0 16h6"/>',
  copy: '<rect x="12" y="12" width="18" height="18" rx="4"/><path d="M26 12V9a3 3 0 0 0-3-3H9a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h3"/>',
  speak: '<path d="M7 14v10h6l12 7V7L13 14z"/><path d="M29 13a8 8 0 0 1 0 12"/>',
  flag: '<path d="M10 32V10"/><path d="M10 11h18l-4 8H10z"/><circle cx="10" cy="10" r="1.6" fill="STROKE" stroke="none"/>',
  trash: '<path d="M7 11h24"/><path d="M14 11V8a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3"/><path d="M11 11l2 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l2-19"/>',
};

// Jam default referensi "21:18" (format titik-dua, bukan WIB 07.08).
function getWibTime(d) {
  if (d instanceof Date) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Jakarta',
    }).format(d);
    return parts;
  }
  return GEO.timeDefault;
}

function randomBattery() {
  return GEO.batteryDefault;
}

// Ambil teks quote: args join (sudah di-join router) atau teks pesan yang di-reply.
function resolveIqcText(argsText, quotedText) {
  const a = String(argsText || '').trim();
  if (a) return a;
  const q = String(quotedText || '').trim();
  return q;
}

// Escape aman untuk sisipan HTML/XML.
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(s) {
  return escapeHtml(s);
}

// ---- LEGACY (API luar) — dipertahankan ekspornya, tidak dipakai normal ----
function buildIqcUrl(messageText, opts) {
  const o = Object.assign({}, IQC_DEFAULTS, opts || {});
  const battery = o.batteryPercentage == null ? randomBattery() : o.batteryPercentage;
  const time = o.time || getWibTime();
  const qs =
    'time=' + encodeURIComponent(time) +
    '&messageText=' + encodeURIComponent(String(messageText || '...')) +
    '&carrierName=' + encodeURIComponent(o.carrierName) +
    '&batteryPercentage=' + encodeURIComponent(battery) +
    '&signalStrength=' + encodeURIComponent(o.signalStrength) +
    '&emojiStyle=' + encodeURIComponent(o.emojiStyle);
  return IQC_BASE + '?' + qs;
}

// GET API -> Buffer image (png/jpg). Legacy; normal render lokal tanpa network.
async function fetchIqcBuffer(messageText, opts) {
  const url = buildIqcUrl(messageText, opts);
  const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error('IQC HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error('IQC respons terlalu kecil');
  return buf;
}

// ---- EMOJI PNG LOKAL (offline, tanpa URL eksternal) ----
// Aset: assets/emoji-iphone/*.png (iPhone style, Emoji Island, 156 emoji terpetakan).
// Reaction pill: tepat 6 file berurutan (thumbs-up, heart, joy,
// open-mouth, cry, pray). Inline bubble: PNG lokal bila dipetakan
// (termasuk hand-over-mouth.png untuk 🤭).
const EMOJI_DIR = path.join(__dirname, '..', 'assets', 'emoji-iphone');
const EMOJI_FILES = {
  '👍': 'thumbs-up.png',
  '❤️': 'heart.png',
  '❤': 'heart.png',
  '😂': 'joy.png',
  '😮': 'open-mouth.png',
  '😢': 'crying.png',
  '🙏': 'pray.png',
  '🤣': 'rolling-laughing.png',
  '🤭': 'hand-over-mouth.png',
  '🙂': 'slightly-smiling.png',
  '🙃': 'upside-down-smiling.png',
  '😇': 'angel-halo.png',
  '😭': 'loudly-crying.png',
  '😥': 'disappointed-but-relieved.png',
  '😵': 'dizzy.png',
  '🤤': 'drooling.png',
  '🤠': 'cowboy.png',
  '😊': 'smiling-with-closed-eyes.png',
  '😃': 'very-happy.png',
  '😄': 'big-smiling.png',
  '😁': 'happy.png',
  '😬': 'grimacing.png',
  '😏': 'smirk-face.png',
  '😎': 'sunglasses-cool.png',
  '🤔': 'thinking.png',
  '😒': 'unamused.png',
  '😞': 'sad.png',
  '😟': 'worried.png',
  '😶': 'emoji-without-mouth.png',
  '😑': 'expressionless.png',
  '😳': 'flushed.png',
  '🙁': 'frowning.png',
  '😉': 'wink.png',
  '😍': 'heart-eyes.png',
  '🤗': 'hugging.png',
  '😋': 'hungry.png',
  '😘': 'kiss.png',
  '😙': 'kiss-with-heart.png',
  '😚': 'kissing-with-closed-eyes.png',
  '😗': 'emotionless-kiss.png',
  '😲': 'so-surprised.png',
  '😯': 'surprised.png',
  '😰': 'cold-sweat.png',
  '😷': 'cold-sick.png',
  '🤒': 'thermometer-sick.png',
  '🤕': 'hurt.png',
  '🤑': 'money.png',
  '😆': 'laughing.png',
  '😜': 'tongue-out-with-an-eye-closed.png',
  '😝': 'tongue-out-with-closed-eyes.png',
  '😛': 'tongue-out.png',
  '😦': 'super-sad.png',
  '🤓': 'nerd.png',
  '😐': 'neutral.png',
  '😨': 'fearful.png',
  '😖': 'confounded-face.png',
  '😱': 'omg.png',
  '🤥': 'pinocchio.png',
  '🤢': 'poisoned.png',
  '😌': 'relieved.png',
  '🙄': 'rolling-eyes.png',
  '☺️': 'blushed-smiling.png',
  '☺': 'blushed-smiling.png',
  '🙈': 'shy.png',
  '😧': 'anguished.png',
  '🤧': 'sneezing.png',
  '😪': 'snoring.png',
  '😴': 'sleeping.png',
  '😅': 'sweat-with-smile.png',
  '😓': 'sweat.png',
  '🤐': 'zipper-mouth.png',
  '☹️': 'unhappy.png',
  '😔': 'very-sad.png',
  '😕': 'confused-face.png',
  '😣': 'persevering-face.png',
  '😫': 'tired.png',
  '😩': 'weary.png',
  '😠': 'angry-face.png',
  '😡': 'super-angry.png',
  '🤬': 'new-mad.png',
  '👻': 'ghost.png',
  '💩': 'poop.png',
  '👽': 'alien.png',
  '🤖': 'robot.png',
  '😈': 'devil.png',
  '👿': 'mad-devil.png',
  '🤡': 'clown.png',
  '💀': 'skull.png',
  '☠️': 'pirate-skull.png',
  '🎃': 'pumpkin.png',
  '🦠': 'virus.png',
  '😺': 'happy-cat.png',
  '😸': 'smiling-cat.png',
  '😿': 'tear-cat.png',
  '😻': 'heart-eyes-cat.png',
  '😼': 'smirk-cat.png',
  '😾': 'angry-cat.png',
  '🙀': 'omg-cat.png',
  '😹': 'crying-cat.png',
  '😽': 'kissing-cat.png',
  '🥴': 'drunk.png',
  '🤩': 'star-eyes.png',
  '🥳': 'party-face.png',
  '🤯': 'exploding-face.png',
  '🥵': 'hot.png',
  '🥶': 'cold.png',
  '🤫': 'shh.png',
  '🤮': 'puke.png',
  '🥰': 'smile-with-hearts.png',
  '🙌': 'high-five.png',
  '👐': 'wide-open-hands-sign.png',
  '👏': 'clapping-hands.png',
  '🤝': 'handshake.png',
  '👎': 'thumbs-down-sign.png',
  '👈': 'left-pointing-backhand-index.png',
  '👉': 'right-pointing-backhand-index.png',
  '👆': 'up-pointing-backhand-index.png',
  '👇': 'down-pointing-backhand-index.png',
  '🤛': 'left-facing-fist.png',
  '🤜': 'right-facing-fist.png',
  '✊': 'fisted-hand-sign.png',
  '🖕': 'middle-finger.png',
  '👊': 'raised-fist.png',
  '✋': 'raised-hand.png',
  '🤚': 'raised-back-of-hand.png',
  '🖐': 'raised-hand-with-fingers-splayed.png',
  '🖖': 'vulcan-salute.png',
  '🤘': 'sign-of-the-horns.png',
  '✌️': 'victory-hand.png',
  '✌': 'victory-hand.png',
  '💪': 'flexed-biceps.png',
  '🤙': 'call-me-hand.png',
  '🤞': 'fingers-crossed.png',
  '👌': 'ok-hand-sign.png',
  '👋': 'waving-hand-sign.png',
  '✍️': 'writing-hand.png',
  '✍': 'writing-hand.png',
  '👃': 'nose.png',
  '🦵': 'leg.png',
  '🤲': 'palms.png',
  '👂': 'ear.png',
  '☝️': 'index-finger.png',
  '🦶': 'foot.png',
  '🤳': 'selfie.png',
  '💅': 'nail-polish.png',
  '👣': 'footstep.png',
  '👁️': 'eye.png',
  '👁': 'eye.png',
  '👀': 'eyes.png',
  '👤': 'man-emoji-unknown.png',
  '👥': 'people-emoji-unknown.png',
  '🗣️': 'shouting-man.png',
  '🦷': 'tooth.png',
  '👄': 'mouth.png',
  '💄': 'lipstick.png',
  '💋': 'kiss-2.png',
};

// Urutan reaction pill — sumber kebenaran tunggal (PNG + emoji).
const PILL_ORDER = [
  { emoji: '👍', file: 'thumbs-up.png' },
  { emoji: '❤️', file: 'heart.png' },
  { emoji: '😂', file: 'joy.png' },
  { emoji: '😮', file: 'open-mouth.png' },
  { emoji: '😢', file: 'cry.png' },
  { emoji: '🙏', file: 'pray.png' },
];

const _emojiUriCache = Object.create(null);
function getEmojiDataUri(file) {
  if (_emojiUriCache[file]) return _emojiUriCache[file];
  const p = path.join(EMOJI_DIR, file);
  const buf = fs.readFileSync(p);
  const uri = 'data:image/png;base64,' + buf.toString('base64');
  _emojiUriCache[file] = uri;
  return uri;
}

// Pecah run emoji -> cluster (1 basis + FE0F opsional; ZWJ ikut cluster).
function splitEmojiClusters(s) {
  const clusters = [];
  let cur = '';
  let needJoin = false;
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    if (cp === 0xfe0f) {
      if (cur) cur += ch;
      else clusters.push(ch);
      continue;
    }
    if (cp === 0x200d) {
      cur += ch;
      needJoin = true;
      continue;
    }
    if (cur && needJoin) {
      cur += ch;
      needJoin = false;
      continue;
    }
    if (cur) clusters.push(cur);
    cur = ch;
    needJoin = false;
  }
  if (cur) clusters.push(cur);
  const merged = [];
  for (let i = 0; i < clusters.length; i++) {
    const a = clusters[i];
    const b = clusters[i + 1];
    const isRI = (cl) => [...cl].length === 1 && (() => {
      const c = cl.codePointAt(0);
      return c >= 0x1f1e6 && c <= 0x1f1ff;
    })();
    if (a && b && isRI(a) && isRI(b)) {
      merged.push(a + b);
      i += 1;
    } else {
      merged.push(a);
    }
  }
  return merged.filter(Boolean);
}

function emojiFileFor(cluster) {
  if (EMOJI_FILES[cluster]) return EMOJI_FILES[cluster];
  const stripped = String(cluster).replace(/\uFE0F/g, '');
  if (EMOJI_FILES[stripped]) return EMOJI_FILES[stripped];
  return null;
}

// ---- FONT (text-to-svg, path-based agar portable) ----
let _ttsvg = null;
let _fontUsed = null;
function resolveFontFile() {
  const cands = [];
  if (process.env.IQC_FONT_PATH) cands.push(process.env.IQC_FONT_PATH);
  cands.push('C:\\Windows\\Fonts\\segoeui.ttf');
  cands.push('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
  cands.push(path.join(__dirname, '..', 'assets', 'fonts', 'arialnarrow.ttf'));
  for (const f of cands) {
    try {
      if (f && fs.existsSync(f)) return f;
    } catch {}
  }
  return null;
}
function getTTSVG() {
  if (!_ttsvg) {
    const TextToSVG = require('text-to-svg');
    const f = resolveFontFile();
    if (!f) throw new Error('Font TTF tidak ditemukan untuk render IQC.');
    _ttsvg = TextToSVG.loadSync(f);
    _fontUsed = f;
  }
  return _ttsvg;
}
function getFontUsed() {
  getTTSVG();
  return _fontUsed;
}

// ---- UKUR TEKS aktual: run latin terukur font, run emoji diestimasi ----
function isTextChar(ch) {
  const cp = ch.codePointAt(0);
  return (
    (cp >= 0x20 && cp <= 0x24f) ||
    (cp >= 0x2010 && cp <= 0x205e)
  );
}

function splitRuns(str) {
  const runs = [];
  let cur = null;
  for (const ch of String(str)) {
    const kind = isTextChar(ch) ? 'text' : 'emoji';
    if (cur && cur.kind === kind) cur.s += ch;
    else {
      cur = { kind, s: ch };
      runs.push(cur);
    }
  }
  return runs;
}

function countEmojiClusters(run) {
  const cps = [];
  for (const ch of run) {
    const cp = ch.codePointAt(0);
    if (cp === 0xfe0f || cp === 0x200d) continue;
    cps.push(cp);
  }
  let n = 0;
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i];
    if (c >= 0x1f1e6 && c <= 0x1f1ff && i + 1 < cps.length) {
      const d = cps[i + 1];
      if (d >= 0x1f1e6 && d <= 0x1f1ff) {
        n += 1;
        i += 1;
        continue;
      }
    }
    n += 1;
  }
  return Math.max(n, cps.length ? 1 : 0);
}

function measureStr(str, fs) {
  const t = getTTSVG();
  let w = 0;
  for (const run of splitRuns(str)) {
    if (run.kind === 'text') {
      try {
        w += t.getWidth(run.s, { fontSize: fs });
      } catch {
        w += run.s.length * fs * 0.5;
      }
    } else {
      w += countEmojiClusters(run.s) * fs * 1.05;
    }
  }
  return w;
}

// Gambar satu baris di x,baseline: run latin -> path,
// run emoji -> <image> PNG lokal (data URI) bila dipetakan,
// cluster tak dikenal -> <text> fallback.
function drawLine(str, x, baseline, fs, fill) {
  const t = getTTSVG();
  let cx = x;
  let out = '';
  const adv = fs * 1.05;
  const size = fs * 1.15;
  for (const run of splitRuns(str)) {
    if (!run.s) continue;
    if (run.kind === 'text') {
      try {
        out += `<path d="${t.getD(run.s, { x: cx, y: baseline, fontSize: fs })}" fill="${fill}"/>`;
      } catch {}
      cx += measureStr(run.s, fs);
    } else {
      const clusters = splitEmojiClusters(run.s);
      let fb = '';
      const flushFb = () => {
        if (!fb) return;
        out += `<text x="${cx.toFixed(1)}" y="${baseline.toFixed(1)}" font-size="${fs}" font-family="Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif">${escapeXml(fb)}</text>`;
        cx += countEmojiClusters(fb) * fs * 1.05;
        fb = '';
      };
      for (const cl of clusters) {
        const file = emojiFileFor(cl);
        if (file) {
          flushFb();
          let uri = '';
          try {
            uri = getEmojiDataUri(file);
          } catch {}
          if (uri) {
            const iy = baseline - size + fs * 0.2;
            out += `<image x="${cx.toFixed(1)}" y="${iy.toFixed(1)}" width="${size.toFixed(1)}" height="${size.toFixed(1)}" href="${uri}" xlink:href="${uri}" preserveAspectRatio="xMidYMid meet"/>`;
          } else {
            fb += cl;
            continue;
          }
          cx += adv;
        } else {
          fb += cl;
        }
      }
      flushFb();
    }
  }
  return out;
}

// Pecah paragraf -> baris sesuai LEBAR UKUR (wrap ala browser).
function wrapParagraph(text, fs, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = [];
  let curW = 0;
  const spaceW = measureStr(' ', fs) || fs * 0.28;
  const wOf = (w) => measureStr(w, fs);
  const pushWord = (w) => {
    if (!cur.length && wOf(w) > maxW) {
      let part = '';
      for (const ch of w) {
        const trial = part + ch;
        if (part && measureStr(trial, fs) > maxW) {
          lines.push({ text: part, width: measureStr(part, fs) });
          part = ch;
        } else {
          part = trial;
        }
      }
      if (part) {
        cur = [part];
        curW = measureStr(part, fs);
      }
      return;
    }
    const trial = curW + (cur.length ? spaceW : 0) + wOf(w);
    if (trial <= maxW) {
      cur.push(w);
      curW = trial;
    } else {
      lines.push({ text: cur.join(' '), width: curW });
      if (wOf(w) > maxW) {
        cur = [];
        curW = 0;
        pushWord(w);
      } else {
        cur = [w];
        curW = wOf(w);
      }
    }
  };
  for (const w of words) pushWord(w);
  if (cur.length) lines.push({ text: cur.join(' '), width: curW });
  return lines;
}

function wrapText(text, fs, maxW, maxChars) {
  const clean = String(text || '').replace(/\r/g, '').slice(0, maxChars || 350);
  const paras = clean.split('\n');
  const out = [];
  for (const p of paras) {
    if (!p.trim()) {
      out.push({ text: '', width: 0, blank: true });
      continue;
    }
    const ls = wrapParagraph(p, fs, maxW);
    if (!ls.length) out.push({ text: '', width: 0, blank: true });
    else for (const l of ls) out.push(l);
  }
  return out;
}

// ---- Status bar referensi: sinyal kiri, carrier, LTE, jam tengah,
// refresh icon kanan, persen, baterai hijau. Tanpa header foreground. ----
function statusSvg(time, battery) {
  const t = getTTSVG();
  const bat = Math.max(0, Math.min(100, Number(battery) || GEO.batteryDefault));
  const carrier = GEO.carrier;
  let s = `<rect x="0" y="0" width="${W}" height="${GEO.statusH}" fill="#000000"/>`;
  // Sinyal kiri (4 bar).
  const bars = [9, 13, 17, 21];
  bars.forEach((h, i) => {
    s += `<rect x="${26 + i * 11}" y="${52 - h}" width="7" height="${h}" rx="1.5" fill="#FFFFFF"/>`;
  });
  // Carrier + LTE kiri.
  try {
    s += `<path d="${t.getD(carrier, { x: 78, y: 42, fontSize: 23 })}" fill="#FFFFFF"/>`;
    s += `<path d="${t.getD('LTE', { x: 352, y: 42, fontSize: 23 })}" fill="#FFFFFF"/>`;
  } catch {}
  // Jam tengah (centered).
  try {
    const tw = t.getWidth(String(time), { fontSize: 28 });
    const tx = W / 2 - tw / 2;
    s += `<path d="${t.getD(String(time), { x: tx, y: 44, fontSize: 28 })}" fill="#FFFFFF"/>`;
  } catch {}
  // Refresh/rotation icon kanan.
  s += `<g fill="none" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">`
    + `<path d="M648 22a16 16 0 1 1-4.7 11.3"/><path d="M648 14v8h-8"/></g>`;
  // Persen SELALU tampil + baterai hijau (jangan omit %).
  const pctLabel = bat + '%';
  try {
    s += `<path d="${t.getD(pctLabel, { x: 678, y: 43, fontSize: 24 })}" fill="#FFFFFF"/>`;
  } catch {}
  const fillW = Math.round((bat / 100) * 36);
  s += `<rect x="748" y="22" width="46" height="22" rx="6.5" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2"/>`
    + `<rect x="752" y="26" width="${fillW}" height="14" rx="3.5" fill="${C.green}"/>`
    + `<rect x="796.5" y="28.5" width="5.5" height="9" rx="2.75" fill="rgba(255,255,255,0.55)"/>`;
  return s;
}

function doodleSvg() {
  const dots = [
    [100, 300], [700, 260], [300, 480], [760, 640], [80, 800],
    [480, 960], [360, 240], [620, 1100], [180, 1200], [720, 1330],
    [430, 1400], [120, 1050], [790, 420], [540, 700],
  ];
  return dots.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="rgba(255,255,255,0.05)"/>`).join('');
}

// Lapisan background (di-blur raster): fake header/profile + bubble hijau/gelap.
function bgSvg() {
  let s = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  s += `<rect width="${W}" height="${H}" fill="${C.bg}"/>`;
  s += doodleSvg();
  // Fake header gelap (di-blur, bukan foreground tajam).
  s += `<rect x="0" y="64" width="${W}" height="112" fill="#1F2C34"/>`;
  s += `<circle cx="112" cy="120" r="38" fill="#46586A"/>`;
  s += `<rect x="168" y="100" width="220" height="22" rx="11" fill="rgba(255,255,255,0.22)"/>`;
  s += `<rect x="168" y="130" width="140" height="16" rx="8" fill="rgba(255,255,255,0.12)"/>`;
  const streak = (x, y, w) => `<rect x="${x}" y="${y}" width="${w}" height="17" rx="8.5" fill="rgba(255,255,255,0.14)"/>`;
  // Bubble palsu hijau (kanan atas) + gelap (kiri).
  s += `<rect x="330" y="205" width="600" height="140" rx="24" fill="${C.bubbleOut}"/>`;
  s += streak(370, 238, 480) + streak(370, 268, 340) + streak(370, 298, 410);
  s += `<rect x="30" y="372" width="470" height="120" rx="24" fill="#1F2C34"/>`;
  s += streak(62, 402, 360) + streak(62, 432, 250);
  // Bubble palsu bawah (di balik menu).
  s += `<rect x="380" y="1150" width="450" height="120" rx="24" fill="${C.bubbleOut}"/>`;
  s += streak(420, 1182, 340) + streak(420, 1212, 240);
  s += `<rect x="30" y="1300" width="380" height="110" rx="24" fill="#1F2C34"/>`;
  s += streak(62, 1330, 270) + streak(62, 1358, 190);
  s += '</svg>';
  return s;
}

// Render pesan -> PNG buffer 864x1536. Murni lokal (sharp), tanpa network.
// Nama baru sesuai referensi; renderIqcBuffer dipertahankan sebagai alias.
async function generateIQC(messageText, opts) {
  const sharp = require('sharp');
  const o = opts || {};
  const text = String(messageText || '...').trim() || '...';
  const time = o.time || GEO.timeDefault;
  const battery = o.batteryPercentage == null ? GEO.batteryDefault : o.batteryPercentage;

  const FS = GEO.bubbleFs;
  // Perilaku messageBubble persis user: char-based adaptive.
  const CHAR_W = GEO.bubble.charW; // 14.2
  const MAX_CHARS = GEO.bubble.maxChars; // 34
  const lineH = GEO.bubble.lineH; // 45
  const bX = GEO.bubble.x; // 18
  const bY = GEO.bubble.y; // 578
  const maxBubbleW = GEO.bubble.maxW; // 658 (cap, bukan forced)
  const padL = GEO.bubble.padL; // 24
  const padR = GEO.bubble.padR; // 76 (zona kanan dikosongkan untuk timestamp)
  const padT = GEO.bubble.padT; // 18
  const padB = GEO.bubble.padB; // 24 (rapat ke bawah timestamp, offset stamp vs teks tetap)

  const timeFs = 20;
  const timeW = measureStr(String(time), timeFs) + 4;
  // min width 145 dan minimum muat timestamp (measured +48 padding).
  const minBubbleW = Math.max(GEO.bubble.minW, timeW + padL + padR + 16);

  const pill = GEO.pill;
  const menuX = GEO.menu.x;
  const menuW = GEO.menu.w;
  const rowH = GEO.menu.rowH;
  const menuGap = GEO.menu.gap;
  const menuH = MENU_ITEMS.length * rowH;
  const bottomPad = 8;
  const bottomLimit = H - bottomPad;

  // Wrap per jumlah karakter (MAX_CHARS_PER_LINE=34), bukan pixel.
  const charLen = (s) => [...String(s)].length;
  const hardSplit = (word) => {
    const chs = [...word];
    const parts = [];
    for (let i = 0; i < chs.length; i += MAX_CHARS) parts.push(chs.slice(i, i + MAX_CHARS).join(''));
    return parts;
  };
  const wrapByChars = (txt) => {
    const clean = String(txt || '').replace(/\r/g, '').slice(0, 350);
    const paras = clean.split('\n');
    const out = [];
    for (const p of paras) {
      if (!p.trim()) { out.push({ text: '', blank: true }); continue; }
      const words = String(p).split(/\s+/).filter(Boolean);
      let cur = '';
      const flush = () => { if (cur) { out.push({ text: cur, blank: false }); cur = ''; } };
      for (let w of words) {
        const chunks = charLen(w) > MAX_CHARS ? hardSplit(w) : [w];
        for (const c of chunks) {
          if (!cur) cur = c;
          else if (charLen(cur) + 1 + charLen(c) <= MAX_CHARS) cur = cur + ' ' + c;
          else { flush(); cur = c; }
        }
      }
      flush();
    }
    return out;
  };
  const lineWidth = (s) => Math.max(charLen(s) * CHAR_W, measureStr(s, FS));

  let lines = wrapByChars(text);
  const fitBubble = (ls) => {
    let longest = 0;
    for (const l of ls) { if (!l.blank) longest = Math.max(longest, lineWidth(l.text)); }
    // longest line based width; min 145/timestamp, max 658. Tidak force fixed width.
    // padR 76 dicadangkan sebagai zona timestamp kanan: teks/emoji berhenti
    // di content-box sehingga zona di atas timestamp tetap kosong.
    let bW = Math.round(Math.min(maxBubbleW, Math.max(minBubbleW, longest + padL + padR)));
    const bH = padT + ls.length * lineH + padB; // height follows line count
    return { bW, bH: Math.round(bH), longest };
  };
  let fit = fitBubble(lines);
  let menuY = Math.round(bY + fit.bH + menuGap);
  if (menuY + menuH > bottomLimit) {
    const availB = bottomLimit - menuH - menuGap - bY;
    let maxLines = Math.max(1, Math.floor((availB - padT - padB) / lineH));
    maxLines = Math.min(maxLines, lines.length);
    lines = lines.slice(0, maxLines);
    const last = lines[lines.length - 1];
    if (last && !last.blank) {
      let t = last.text || '';
      while (charLen(t) + 1 > MAX_CHARS) t = [...t].slice(0, -1).join('');
      last.text = t + '…';
    }
    fit = fitBubble(lines);
    menuY = Math.round(bY + fit.bH + menuGap);
  }
  const bW = Math.round(fit.bW);
  const bH = Math.round(fit.bH);

  // ---- foreground SVG (status tajam + pill + bubble + menu; TANPA header/composer)
  let s = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">`;
  s += `<rect width="${W}" height="${H}" fill="rgba(0,0,0,0.42)"/>`;
  s += statusSvg(time, battery);

  // Reaction bar referensi: x=18 y=422 w=660 h=122 rx=61, 6 PNG lokal berurutan.
  s += `<rect x="${pill.x + 3}" y="${pill.y + 8}" width="${pill.w}" height="${pill.h}" rx="${pill.rx}" fill="rgba(0,0,0,0.45)"/>`;
  s += `<rect x="${pill.x}" y="${pill.y}" width="${pill.w}" height="${pill.h}" rx="${pill.rx}" fill="${C.pill}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>`;
  PILL_ORDER.forEach((item, i) => {
    const cx = pill.x + ((i + 0.5) * pill.w) / PILL_ORDER.length;
    const iw = 72;
    const ih = 72;
    const ix = cx - iw / 2;
    const iy = pill.y + (pill.h - ih) / 2;
    let uri = '';
    try {
      uri = getEmojiDataUri(item.file);
    } catch {}
    if (uri) {
      s += `<image x="${ix.toFixed(1)}" y="${iy.toFixed(1)}" width="${iw}" height="${ih}" href="${uri}" xlink:href="${uri}" preserveAspectRatio="xMidYMid meet"><title>${escapeXml(item.emoji)}</title></image>`;
    } else {
      s += `<text x="${cx.toFixed(1)}" y="${pill.y + 82}" font-size="68" text-anchor="middle" font-family="sans-serif">${escapeXml(item.emoji)}</text>`;
    }
  });

  // Bubble adaptif: x=18 y=578 rx=25 fill #353639 + ekor. Lebar ikut longest line.
  s += `<rect x="${bX + 4}" y="${bY + 8}" width="${bW}" height="${bH}" rx="${GEO.bubble.rx}" fill="rgba(0,0,0,0.4)"/>`;
  s += `<rect x="${bX}" y="${bY}" width="${bW}" height="${bH}" rx="${GEO.bubble.rx}" fill="${GEO.bubble.fill}"/>`;
  s += `<rect x="${bX}" y="${bY}" width="28" height="28" fill="${GEO.bubble.fill}"/>`;
  s += `<polygon points="${bX - 13},${bY} ${bX + 5},${bY} ${bX},${bY + 20}" fill="${GEO.bubble.fill}"/>`;
  lines.forEach((ln, i) => {
    if (!ln.text) return;
    const baseline = bY + padT + FS * 0.85 + i * lineH;
    s += drawLine(ln.text, bX + padL, baseline, FS, C.text);
  });
  // Timestamp kanan-bawah di zona yang dikosongkan (kanan 18 / baseline 14).
  // Baseline = contentBottom+10 sehingga stamp setengah menempel baris
  // terakhir dan setengah di bawahnya; TIDAK sejajar lastBaseline penuh.
  // Tepi bawah bubble rapat mengikuti bawah timestamp (~9px clearance).
  // Teks/user-emoji dibatasi selebar content-box (padR 76) sehingga tidak
  // masuk zona timestamp.
  const tcol = '#A7ACB1';
  const twReal = measureStr(String(time), timeFs);
  const txTime = bX + bW - GEO.bubble.timeInsetR - twReal;
  const tyTime = bY + bH - GEO.bubble.timeInsetB;
  s += drawLine(String(time), txTime, tyTime, timeFs, tcol);

  // Menu 7 baris referensi: x=18 w=625 row 108, bubble+22, #353638.
  s += `<rect x="${menuX + 4}" y="${menuY + 10}" width="${menuW}" height="${menuH}" rx="30" fill="rgba(0,0,0,0.5)"/>`;
  s += `<rect x="${menuX}" y="${menuY}" width="${menuW}" height="${menuH}" rx="30" fill="${GEO.menu.fill}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>`;
  MENU_ITEMS.forEach((item, i) => {
    const rowY = menuY + i * rowH;
    if (i > 0) {
      s += `<line x1="${menuX}" y1="${rowY}" x2="${menuX + menuW}" y2="${rowY}" stroke="rgba(255,255,255,0.09)" stroke-width="1"/>`;
    }
    const col = item.danger ? C.red : C.text;
    const stroke = item.danger ? C.red : '#E9EDEF';
    const ix = menuX + menuW - 30 - 38;
    const iy = rowY + (rowH - 38) / 2;
    let icon = ICONS[item.icon] || '';
    icon = icon.replace(/STROKE/g, stroke);
    s += `<g transform="translate(${ix},${iy})" fill="none" stroke="${stroke}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${icon}</g>`;
    const fsL = 29;
    const lx = menuX + 30;
    const baseline = rowY + rowH / 2 + fsL * 0.35;
    s += drawLine(item.label, lx, baseline, fsL, col);
  });

  // TANPA composer: background blur/dim berlanjut sampai H.

  s += '</svg>';

  // background: raster -> blur raster -> composite foreground.
  const bgPng = await sharp(Buffer.from(bgSvg())).png().toBuffer();
  const blurred = await sharp(bgPng).blur(12).toBuffer();
  const png = await sharp(blurred)
    .composite([{ input: Buffer.from(s), top: 0, left: 0 }])
    .png()
    .toBuffer();
  return png;
}

// Metrik bubble adaptif (untuk verifikasi lebar/tinggi tanpa render).
function getBubbleMetrics(messageText, opts) {
  const o = opts || {};
  const text = String(messageText || '...').trim() || '...';
  const time = o.time || GEO.timeDefault;
  const FS = GEO.bubbleFs;
  const CHAR_W = GEO.bubble.charW;
  const MAX_CHARS = GEO.bubble.maxChars;
  const lineH = GEO.bubble.lineH;
  const padL = GEO.bubble.padL, padR = GEO.bubble.padR;
  const padT = GEO.bubble.padT, padB = GEO.bubble.padB;
  const timeFs = 20;
  const timeW = measureStr(String(time), timeFs) + 4;
  const minBubbleW = Math.max(GEO.bubble.minW, timeW + padL + padR + 16);
  const charLen = (s) => [...String(s)].length;
  const words = [];
  const clean = String(text).replace(/\r/g, '').slice(0, 350);
  const paras = clean.split('\n');
  const lines = [];
  for (const p of paras) {
    if (!p.trim()) { lines.push(''); continue; }
    let cur = '';
    const flush = () => { if (cur) { lines.push(cur); cur = ''; } };
    for (const w0 of String(p).split(/\s+/).filter(Boolean)) {
      const chs = [...w0];
      const chunks = chs.length > MAX_CHARS
        ? (() => { const a = []; for (let i = 0; i < chs.length; i += MAX_CHARS) a.push(chs.slice(i, i + MAX_CHARS).join('')); return a; })()
        : [w0];
      for (const c of chunks) {
        if (!cur) cur = c;
        else if (charLen(cur) + 1 + charLen(c) <= MAX_CHARS) cur += ' ' + c;
        else { flush(); cur = c; }
      }
    }
    flush();
  }
  let longest = 0;
  for (const l of lines) longest = Math.max(longest, Math.max(charLen(l) * CHAR_W, measureStr(l, FS)));
  let w = Math.round(Math.min(GEO.bubble.maxW, Math.max(minBubbleW, longest + padL + padR)));
  let h = Math.round(padT + lines.length * lineH + padB);
  let menuY = Math.round(GEO.bubble.y + h + GEO.menu.gap);
  const bottomLimit = H - 8;
  const menuH = MENU_ITEMS.length * GEO.menu.rowH;
  if (menuY + menuH > bottomLimit) {
    const availB = bottomLimit - menuH - GEO.menu.gap - GEO.bubble.y;
    let maxLines = Math.max(1, Math.floor((availB - padT - padB) / lineH));
    maxLines = Math.min(maxLines, lines.length);
    const cut = lines.slice(0, maxLines);
    longest = 0;
    for (const l of cut) longest = Math.max(longest, Math.max(charLen(l) * CHAR_W, measureStr(l === cut[cut.length-1] ? l + '…' : l, FS)));
    w = Math.round(Math.min(GEO.bubble.maxW, Math.max(minBubbleW, longest + padL + padR)));
    h = Math.round(padT + cut.length * lineH + padB);
    menuY = Math.round(GEO.bubble.y + h + GEO.menu.gap);
    return { w, h, lines: cut.length, longest: Math.round(longest), menuY, truncated: true };
  }
  return { w, h, lines: lines.length, longest: Math.round(longest), menuY, truncated: false };
}

// Alias lama — dipertahankan agar pemanggil lama tetap jalan.
async function renderIqcBuffer(messageText, opts) {
  return generateIQC(messageText, opts);
}

// HTML preview standalone (sumber: template file, placeholder diganti teks).
// Emoji terpetakan jadi <img> aset lokal relatif (tanpa URL eksternal).
const HTML_EMOJI_IMGS = {
  '👍': '../assets/emoji-iphone/thumbs-up.png',
  '❤️': '../assets/emoji-iphone/heart.png',
  '❤': '../assets/emoji-iphone/heart.png',
  '😂': '../assets/emoji-iphone/joy.png',
  '😮': '../assets/emoji-iphone/open-mouth.png',
  '😢': '../assets/emoji-iphone/crying.png',
  '🙏': '../assets/emoji-iphone/pray.png',
  '🤣': '../assets/emoji-iphone/rolling-laughing.png',
  '🤭': '../assets/emoji-iphone/hand-over-mouth.png',
  '🙂': '../assets/emoji-iphone/slightly-smiling.png',
  '🙃': '../assets/emoji-iphone/upside-down-smiling.png',
  '😇': '../assets/emoji-iphone/angel-halo.png',
  '😭': '../assets/emoji-iphone/loudly-crying.png',
  '😥': '../assets/emoji-iphone/disappointed-but-relieved.png',
  '😵': '../assets/emoji-iphone/dizzy.png',
  '🤤': '../assets/emoji-iphone/drooling.png',
  '🤠': '../assets/emoji-iphone/cowboy.png',
  '😊': '../assets/emoji-iphone/smiling-with-closed-eyes.png',
  '😃': '../assets/emoji-iphone/very-happy.png',
  '😄': '../assets/emoji-iphone/big-smiling.png',
  '😁': '../assets/emoji-iphone/happy.png',
  '😬': '../assets/emoji-iphone/grimacing.png',
  '😏': '../assets/emoji-iphone/smirk-face.png',
  '😎': '../assets/emoji-iphone/sunglasses-cool.png',
  '🤔': '../assets/emoji-iphone/thinking.png',
  '😒': '../assets/emoji-iphone/unamused.png',
  '😞': '../assets/emoji-iphone/sad.png',
  '😟': '../assets/emoji-iphone/worried.png',
  '😶': '../assets/emoji-iphone/emoji-without-mouth.png',
  '😑': '../assets/emoji-iphone/expressionless.png',
  '😳': '../assets/emoji-iphone/flushed.png',
  '🙁': '../assets/emoji-iphone/frowning.png',
  '😉': '../assets/emoji-iphone/wink.png',
  '😍': '../assets/emoji-iphone/heart-eyes.png',
  '🤗': '../assets/emoji-iphone/hugging.png',
  '😋': '../assets/emoji-iphone/hungry.png',
  '😘': '../assets/emoji-iphone/kiss.png',
  '😙': '../assets/emoji-iphone/kiss-with-heart.png',
  '😚': '../assets/emoji-iphone/kissing-with-closed-eyes.png',
  '😗': '../assets/emoji-iphone/emotionless-kiss.png',
  '😲': '../assets/emoji-iphone/so-surprised.png',
  '😯': '../assets/emoji-iphone/surprised.png',
  '😰': '../assets/emoji-iphone/cold-sweat.png',
  '😷': '../assets/emoji-iphone/cold-sick.png',
  '🤒': '../assets/emoji-iphone/thermometer-sick.png',
  '🤕': '../assets/emoji-iphone/hurt.png',
  '🤑': '../assets/emoji-iphone/money.png',
  '😆': '../assets/emoji-iphone/laughing.png',
  '😜': '../assets/emoji-iphone/tongue-out-with-an-eye-closed.png',
  '😝': '../assets/emoji-iphone/tongue-out-with-closed-eyes.png',
  '😛': '../assets/emoji-iphone/tongue-out.png',
  '😦': '../assets/emoji-iphone/super-sad.png',
  '🤓': '../assets/emoji-iphone/nerd.png',
  '😐': '../assets/emoji-iphone/neutral.png',
  '😨': '../assets/emoji-iphone/fearful.png',
  '😖': '../assets/emoji-iphone/confounded-face.png',
  '😱': '../assets/emoji-iphone/omg.png',
  '🤥': '../assets/emoji-iphone/pinocchio.png',
  '🤢': '../assets/emoji-iphone/poisoned.png',
  '😌': '../assets/emoji-iphone/relieved.png',
  '🙄': '../assets/emoji-iphone/rolling-eyes.png',
  '☺️': '../assets/emoji-iphone/blushed-smiling.png',
  '☺': '../assets/emoji-iphone/blushed-smiling.png',
  '🙈': '../assets/emoji-iphone/shy.png',
  '😧': '../assets/emoji-iphone/anguished.png',
  '🤧': '../assets/emoji-iphone/sneezing.png',
  '😪': '../assets/emoji-iphone/snoring.png',
  '😴': '../assets/emoji-iphone/sleeping.png',
  '😅': '../assets/emoji-iphone/sweat-with-smile.png',
  '😓': '../assets/emoji-iphone/sweat.png',
  '🤐': '../assets/emoji-iphone/zipper-mouth.png',
  '☹️': '../assets/emoji-iphone/unhappy.png',
  '😔': '../assets/emoji-iphone/very-sad.png',
  '😕': '../assets/emoji-iphone/confused-face.png',
  '😣': '../assets/emoji-iphone/persevering-face.png',
  '😫': '../assets/emoji-iphone/tired.png',
  '😩': '../assets/emoji-iphone/weary.png',
  '😠': '../assets/emoji-iphone/angry-face.png',
  '😡': '../assets/emoji-iphone/super-angry.png',
  '🤬': '../assets/emoji-iphone/new-mad.png',
  '👻': '../assets/emoji-iphone/ghost.png',
  '💩': '../assets/emoji-iphone/poop.png',
  '👽': '../assets/emoji-iphone/alien.png',
  '🤖': '../assets/emoji-iphone/robot.png',
  '😈': '../assets/emoji-iphone/devil.png',
  '👿': '../assets/emoji-iphone/mad-devil.png',
  '🤡': '../assets/emoji-iphone/clown.png',
  '💀': '../assets/emoji-iphone/skull.png',
  '☠️': '../assets/emoji-iphone/pirate-skull.png',
  '🎃': '../assets/emoji-iphone/pumpkin.png',
  '🦠': '../assets/emoji-iphone/virus.png',
  '😺': '../assets/emoji-iphone/happy-cat.png',
  '😸': '../assets/emoji-iphone/smiling-cat.png',
  '😿': '../assets/emoji-iphone/tear-cat.png',
  '😻': '../assets/emoji-iphone/heart-eyes-cat.png',
  '😼': '../assets/emoji-iphone/smirk-cat.png',
  '😾': '../assets/emoji-iphone/angry-cat.png',
  '🙀': '../assets/emoji-iphone/omg-cat.png',
  '😹': '../assets/emoji-iphone/crying-cat.png',
  '😽': '../assets/emoji-iphone/kissing-cat.png',
  '🥴': '../assets/emoji-iphone/drunk.png',
  '🤩': '../assets/emoji-iphone/star-eyes.png',
  '🥳': '../assets/emoji-iphone/party-face.png',
  '🤯': '../assets/emoji-iphone/exploding-face.png',
  '🥵': '../assets/emoji-iphone/hot.png',
  '🥶': '../assets/emoji-iphone/cold.png',
  '🤫': '../assets/emoji-iphone/shh.png',
  '🤮': '../assets/emoji-iphone/puke.png',
  '🥰': '../assets/emoji-iphone/smile-with-hearts.png',
  '🙌': '../assets/emoji-iphone/high-five.png',
  '👐': '../assets/emoji-iphone/wide-open-hands-sign.png',
  '👏': '../assets/emoji-iphone/clapping-hands.png',
  '🤝': '../assets/emoji-iphone/handshake.png',
  '👎': '../assets/emoji-iphone/thumbs-down-sign.png',
  '👈': '../assets/emoji-iphone/left-pointing-backhand-index.png',
  '👉': '../assets/emoji-iphone/right-pointing-backhand-index.png',
  '👆': '../assets/emoji-iphone/up-pointing-backhand-index.png',
  '👇': '../assets/emoji-iphone/down-pointing-backhand-index.png',
  '🤛': '../assets/emoji-iphone/left-facing-fist.png',
  '🤜': '../assets/emoji-iphone/right-facing-fist.png',
  '✊': '../assets/emoji-iphone/fisted-hand-sign.png',
  '🖕': '../assets/emoji-iphone/middle-finger.png',
  '👊': '../assets/emoji-iphone/raised-fist.png',
  '✋': '../assets/emoji-iphone/raised-hand.png',
  '🤚': '../assets/emoji-iphone/raised-back-of-hand.png',
  '🖐': '../assets/emoji-iphone/raised-hand-with-fingers-splayed.png',
  '🖖': '../assets/emoji-iphone/vulcan-salute.png',
  '🤘': '../assets/emoji-iphone/sign-of-the-horns.png',
  '✌️': '../assets/emoji-iphone/victory-hand.png',
  '✌': '../assets/emoji-iphone/victory-hand.png',
  '💪': '../assets/emoji-iphone/flexed-biceps.png',
  '🤙': '../assets/emoji-iphone/call-me-hand.png',
  '🤞': '../assets/emoji-iphone/fingers-crossed.png',
  '👌': '../assets/emoji-iphone/ok-hand-sign.png',
  '👋': '../assets/emoji-iphone/waving-hand-sign.png',
  '✍️': '../assets/emoji-iphone/writing-hand.png',
  '✍': '../assets/emoji-iphone/writing-hand.png',
  '👃': '../assets/emoji-iphone/nose.png',
  '🦵': '../assets/emoji-iphone/leg.png',
  '🤲': '../assets/emoji-iphone/palms.png',
  '👂': '../assets/emoji-iphone/ear.png',
  '☝️': '../assets/emoji-iphone/index-finger.png',
  '🦶': '../assets/emoji-iphone/foot.png',
  '🤳': '../assets/emoji-iphone/selfie.png',
  '💅': '../assets/emoji-iphone/nail-polish.png',
  '👣': '../assets/emoji-iphone/footstep.png',
  '👁️': '../assets/emoji-iphone/eye.png',
  '👁': '../assets/emoji-iphone/eye.png',
  '👀': '../assets/emoji-iphone/eyes.png',
  '👤': '../assets/emoji-iphone/man-emoji-unknown.png',
  '👥': '../assets/emoji-iphone/people-emoji-unknown.png',
  '🗣️': '../assets/emoji-iphone/shouting-man.png',
  '🦷': '../assets/emoji-iphone/tooth.png',
  '👄': '../assets/emoji-iphone/mouth.png',
  '💄': '../assets/emoji-iphone/lipstick.png',
  '💋': '../assets/emoji-iphone/kiss-2.png',
};
function renderIqcHtmlText(text) {
  const esc = escapeHtml(text);
  const keys = Object.keys(HTML_EMOJI_IMGS).sort((a, b) => b.length - a.length);
  let out = esc;
  for (const k of keys) {
    const img = `<img class="e" src="${HTML_EMOJI_IMGS[k]}" alt="${k}"/>`;
    out = out.split(escapeHtml(k)).join(img);
  }
  return out;
}
function buildIqcHtml(messageText, opts) {
  const o = opts || {};
  const text = String(messageText == null ? '' : messageText);
  const time = o.time || GEO.timeDefault;
  let tpl;
  try {
    tpl = fs.readFileSync(TEMPLATE_FILE, 'utf8');
  } catch {
    tpl = null;
  }
  if (!tpl) {
    return '<!DOCTYPE html><html><body><p>' + escapeHtml(text) + '</p></body></html>';
  }
  return tpl.split('{{IQC_TEXT}}').join(renderIqcHtmlText(text)).split('>21:18<').join('>' + escapeHtml(time) + '<');
}

// Handler siap tempel di router (tanpa edit file lain):
//   if (cmd === 'iqc') return await handleIqc(sock, jid, m, args);
// Opsi: handleIqc(sock, jid, m, args, { quotedText, time })
async function handleIqc(sock, jid, m, argsText, opts) {
  const text = resolveIqcText(argsText, opts && opts.quotedText);
  if (!text) {
    return await sock.sendMessage(
      jid,
      { text: 'Contoh: .iqc halo, apa kabar? (bisa juga reply pesan + .iqc)' },
      { quoted: m }
    );
  }
  try {
    await sock.sendMessage(jid, { text: '📱 Lagi bikin iqc...' }, { quoted: m }).catch(() => {});
  } catch {}
  try {
    const buf = await generateIQC(text, opts);
    await sock.sendMessage(jid, { image: buf, caption: '📱 *' + text + '*' }, { quoted: m });
  } catch (e) {
    console.error('iqc', (e && e.message) || e);
    await sock.sendMessage(jid, { text: 'Maaf, fitur ini sedang dalam perbaikan atau belum tersedia di server ini. Silakan hubungi admin.' }, { quoted: m });
  }
}

module.exports = {
  IQC_BASE,
  getWibTime,
  randomBattery,
  resolveIqcText,
  buildIqcUrl,
  fetchIqcBuffer,
  escapeHtml,
  buildIqcHtml,
  renderIqcBuffer,
  generateIQC,
  getBubbleMetrics,
  getFontUsed,
  handleIqc,
  GEO,
  PILL_ORDER,
};
