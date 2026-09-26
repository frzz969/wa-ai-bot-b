// lib/tools-local.js — tools lokal tanpa API key / tanpa ffmpeg.
// CommonJS (repo ini CJS). Dipakai router via Baileys langsung.
// Isi: morse/dmorse, calculator, toAudioHelp, toImage + handler sederhana.

const sharp = require('sharp');

// --- MORSE (copas dari DENIA-MD/lib/Constants.js) ---
const MORSE = Object.freeze({
  a: '•–', b: '–•••', c: '–•–•',
  d: '–••', e: '•', f: '••–•',
  g: '––•', h: '••••', i: '••',
  j: '•–––', k: '–•–', l: '•–••',
  m: '––', n: '–•', o: '–––',
  p: '•––•', q: '––•–', r: '•–•',
  s: '•••', t: '–', u: '••–',
  v: '•••–', w: '•––', x: '–••–',
  y: '–•––', z: '––••', '1': '•––––',
  '2': '••–––', '3': '•••––', '4': '••••–',
  '5': '•••••', '6': '–••••', '7': '––•••',
  '8': '–––••', '9': '––––•', '0': '–––––',
});

const DE_MORSE = Object.freeze(
  Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]))
);

function morseEncode(text) {
  return String(text || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => [...word].map((ch) => MORSE[ch] || ch).join(' '))
    .join(' / ');
}

function morseDecode(text) {
  return String(text || '')
    .split(/\s*\/\s*/g)
    .map((word) =>
      word
        .split(/\s+/)
        .filter(Boolean)
        .map((code) => DE_MORSE[code] || code)
        .join('')
    )
    .join(' ')
    .trim();
}

// Handler sederhana morse/dmorse (dipakai router).
// command: 'morse' | 'dmorse'. Kembalikan string siap kirim.
function handleMorse(command, text) {
  const cmd = String(command || '').toLowerCase();
  const input = String(text || '').trim();
  if (cmd === 'morse') {
    if (!input) return '👉🏻 *Example*: morse hi';
    return morseEncode(input);
  }
  if (cmd === 'dmorse') {
    if (!input) return '👉🏻 *Example*: dmorse ••• ••';
    return morseDecode(input);
  }
  return '❌ Command morse tidak dikenal. Pakai: morse / dmorse';
}

// --- CALCULATOR (eval tersanitasi + Math) ---
// NOTE: Di Denia, regex bernama INVALID_EXPRESSION memakai pola karakter VALID
// (/^[\s.+...]+$/i) tapi (1) kelas karakternya LUPA menyertakan digit 0-9 sehingga
// "2 * 5" tidak match, dan (2) guard-nya `if (INVALID_EXPRESSION.test(t)) return invalid`
// menolak tepat saat input HANYA berisi operator — logika nama-vs-cek terbalik/membingungkan.
// Di sini diperbaiki: regex VALID sudah mencakup \d, dan guard menolak jika TIDAK match
// atau jika tanpa digit sama sekali (input cuma operator seperti "+++").
const VALID_EXPRESSION = /^[\d\s.+\-*/×÷^()eπpi]+$/i;
const MATH_EXPRESSION = /^(sin|cos|tan|sqrt|log|abs)\(/;

const MATH_MAP = {
  '×': '*',
  '÷': '/',
  'π': 'Math.PI',
  '^': '**',
  '√': 'Math.sqrt',
};

const REVERSE_MAP = {
  'Math.PI': 'π',
  'Math.E': 'e',
  '**': '^',
  '*': '×',
  '/': '÷',
};

// Evaluasi ekspresi matematika secara tersanitasi.
// Mengembalikan { ok: true, result, readable } atau { ok: false, error }.
function calculate(expr) {
  const trimmed = String(expr || '').trim();
  if (!trimmed) return { ok: false, error: '👉🏻 *Example*: calc 2 * 5' };
  // Perbaikan Denia: tolak jika mengandung karakter di luar whitelist,
  // atau jika tanpa digit sama sekali (cuma operator seperti "+++").
  if (!VALID_EXPRESSION.test(trimmed) && !/(sin|cos|tan|sqrt|log|abs|√)/i.test(trimmed)) {
    return { ok: false, error: '❌ Invalid expression.' };
  }
  if (!/\d/.test(trimmed)) return { ok: false, error: '❌ Invalid expression.' };
  let val = trimmed.replace(/[^0-9+\-*/.^()πpieE\s√×÷\w]/gi, '');
  val = val.replace(/×|÷|π|√|\^|pi(?!\w)|\be\b|\b(sin|cos|tan|sqrt|log|abs)\(/gi, (match) => {
    const lower = match.toLowerCase();
    if (MATH_EXPRESSION.test(lower)) return 'Math.' + lower;
    if (lower === 'pi') return 'Math.PI';
    if (lower === 'e') return 'Math.E';
    return MATH_MAP[match] || match;
  });
  // Guard kedua (perbaikan Denia): regex Denia /[^0-9Math+...]/ menolak huruf
  // s/q/r/l/o/g/c sehingga Math.sqrt/sin/cos/log/abs HASIL MAP-NYA SENDIRI selalu
  // ditolak. Di sini: hapus token Math.* yang dikenal, sisanya tak boleh ada huruf
  // (blokir constructor/process/dll) maupun simbol di luar whitelist.
  const stripped = val.replace(/Math\.(PI|E|sin|cos|tan|sqrt|log|abs)/g, '');
  if (/[a-zA-Z]/.test(stripped)) {
    return { ok: false, error: '💭 The expression contains invalid characters.' };
  }
  if (/[^0-9+\-*/.()\s]/.test(stripped)) {
    return { ok: false, error: '💭 The expression contains invalid characters.' };
  }
  try {
    const result = Function('"use strict";return (' + val + ')')();
    if (result === undefined || !Number.isFinite(result)) {
      return { ok: false, error: '❌ Invalid expression or undefined result.' };
    }
    let readable = trimmed;
    for (const [key, value] of Object.entries(REVERSE_MAP)) {
      readable = readable.split(key).join(value);
    }
    return { ok: true, result, readable };
  } catch (e) {
    return { ok: false, error: '👉🏻 *Example*: calc 2 * 5' };
  }
}

// Handler sederhana calculator (dipakai router). Kembalikan string siap kirim.
function handleCalc(text) {
  const r = calculate(text);
  if (!r.ok) return r.error;
  return `🧮 *${r.readable}* = ${r.result}`;
}

// --- AUDIO (tanpa ffmpeg, pass-through Baileys) ---
// Helper info agar router bisa kirim buffer audio langsung via Baileys
// tanpa konversi ffmpeg. Baileys menerima { audio: buffer, mimetype, ptt }.
// Input: buffer + mime. Output: { type: 'audio'|'ptt', mimetype, data }.
function toAudioHelp(buffer, mime, asPtt) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('toAudioHelp: buffer tidak valid');
  }
  const mimetype = String(mime || 'audio/ogg; codecs=opus').trim() || 'audio/ogg; codecs=opus';
  const ptt = Boolean(asPtt) || /ogg|opus/.test(mimetype);
  return {
    type: ptt ? 'ptt' : 'audio',
    mimetype,
    ptt,
    data: buffer,
  };
}

// --- IMAGE (resize 512 via sharp) ---
// Resize gambar ke max 512px (fit inside), output PNG buffer. Pakai sharp yg sudah ada.
async function toImage(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('toImage: buffer tidak valid');
  }
  return sharp(buffer)
    .resize(512, 512, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
}

module.exports = {
  MORSE,
  DE_MORSE,
  morseEncode,
  morseDecode,
  handleMorse,
  VALID_EXPRESSION,
  MATH_MAP,
  REVERSE_MAP,
  calculate,
  handleCalc,
  toAudioHelp,
  toImage,
};
