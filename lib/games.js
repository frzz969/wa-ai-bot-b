'use strict';

/**
 * lib/games.js — Mini game lokal (100% offline, tanpa fetch/canvas/HTML card).
 *
 * Pola sederhana yang ditiru dari DENIA-MD (tanpa dependensi ke sana):
 *  - lib/Components/TicTacToeCard.js : AI minimax + deteksi garis menang.
 *    Di sini hanya diambil intinya (state board, checkWin, minimax ringan)
 *    dan papan di-render sebagai teks emoji buat chat.
 *  - lib/Components/QuizFactory.js : baca bank soal dari media/Text/*.json,
 *    di sini disederhanakan jadi baca file lokal media/quiz/*.json
 *    (pakai fs + cache Map, tanpa watcher/event bot).
 *
 * Bank soal di media/quiz/ adalah SALINAN dari DENIA-MD/media/Text/:
 *  - caklontong.json  <- DENIA-MD caklontong.json   (pertanyaan/jawaban)
 *  - siapakahaku.json <- DENIA-MD whoami.json       (pertanyaan/jawaban)
 *  - tebakkata.json   <- DENIA-MD whatword.json     (tipe/acak/jawaban,
 *                         konsepnya sama: susun huruf acak -> tebak kata)
 *
 * Semua CommonJS. Tidak ada akses jaringan.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// TicTacToe
// ---------------------------------------------------------------------------

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // baris
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // kolom
  [0, 4, 8], [2, 4, 6], // diagonal
];

const EMPTY = '⬜';
const MARK = { X: '❌', O: '⭕' };
const NUM_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

// State per-game: id (mis. chatId) -> { board: Array(9), turn: 'X'|'O' }
const games = new Map();

function emptyBoard() {
  return Array(9).fill(null);
}

function isValidSymbol(s) {
  return s === 'X' || s === 'O';
}

// Ambil board dari state game (by id) atau langsung dari array board.
function resolveBoard(boardOrId) {
  if (Array.isArray(boardOrId)) return boardOrId;
  const g = games.get(String(boardOrId));
  return g ? g.board : null;
}

/**
 * Buat (atau reset) game baru untuk id tertentu.
 * @param {string} [id='default'] kunci game (mis. chatId)
 * @param {object} [opts] { first: 'X'|'O' } giliran pertama
 * @returns {{ board: Array, turn: string }}
 */
function newGame(id = 'default', opts = {}) {
  const key = String(id);
  const first = isValidSymbol(opts.first) ? opts.first : 'X';
  const state = { board: emptyBoard(), turn: first };
  games.set(key, state);
  return state;
}

/** Ambil state game (null bila belum ada). */
function getGame(id = 'default') {
  return games.get(String(id)) || null;
}

/** Hapus state game. */
function endGame(id = 'default') {
  return games.delete(String(id));
}

/**
 * Cek pemenang papan.
 * @param {Array|string} boardOrId array 9 sel ('X'/'O'/null) atau id game
 * @returns {{ winner: 'X'|'O'|'D'|null, line: number[]|null }}
 *          winner 'D' = seri (draw).
 */
function checkWin(boardOrId) {
  const board = resolveBoard(boardOrId);
  if (!board) return { winner: null, line: null };
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: line.slice() };
    }
  }
  if (board.every((v) => v !== null && v !== undefined)) {
    return { winner: 'D', line: null };
  }
  return { winner: null, line: null };
}

/** Daftar indeks kosong (0-8). */
function availableMoves(boardOrId) {
  const board = resolveBoard(boardOrId);
  if (!board) return [];
  const out = [];
  for (let i = 0; i < 9; i++) {
    if (board[i] === null || board[i] === undefined) out.push(i);
  }
  return out;
}

// Normalisasi posisi input user (1-9) atau indeks (0-8) jadi indeks 0-8.
function toIndex(pos) {
  const n = Number(pos);
  if (!Number.isInteger(n)) return -1;
  if (n >= 1 && n <= 9) return n - 1; // nomor papan 1-9
  if (n >= 0 && n <= 8) return n; // indeks langsung
  return -1;
}

/**
 * Jalan satu langkah untuk game by-id.
 * @param {string} id kunci game
 * @param {number|string} pos posisi 1-9 (atau indeks 0-8)
 * @param {string} [symbol] 'X'/'O', default = giliran saat ini
 * @returns {{ ok: boolean, reason?: string, index?: number,
 *            winner?: 'X'|'O'|'D'|null, line?: number[]|null, turn?: string }}
 */
function move(id, pos, symbol) {
  const key = String(id);
  const state = games.get(key);
  if (!state) return { ok: false, reason: 'no-game' };
  const idx = toIndex(pos);
  if (idx < 0) return { ok: false, reason: 'bad-pos' };
  if (state.board[idx]) return { ok: false, reason: 'occupied' };
  const mark = isValidSymbol(symbol) ? symbol : state.turn;
  state.board[idx] = mark;
  const res = checkWin(state.board);
  if (!res.winner) state.turn = mark === 'X' ? 'O' : 'X';
  return { ok: true, index: idx, winner: res.winner, line: res.line, turn: state.turn };
}

/**
 * Render papan sebagai teks: sel terisi -> ❌/⭕, sel kosong -> nomor 1️⃣-9️⃣.
 * @param {Array|string} boardOrId array board atau id game
 * @param {object} [opts] { numbers: boolean } tampilkan nomor di sel kosong (default true)
 */
function renderText(boardOrId, opts = {}) {
  const board = resolveBoard(boardOrId);
  if (!board) return 'Belum ada game. Buat dulu dengan newGame(id).';
  const showNumbers = opts.numbers !== false;
  const cells = board.map((v, i) => {
    if (v === 'X') return MARK.X;
    if (v === 'O') return MARK.O;
    return showNumbers ? NUM_EMOJI[i] : EMPTY;
  });
  const rows = [cells.slice(0, 3), cells.slice(3, 6), cells.slice(6, 9)];
  return rows.map((r) => r.join('')).join('\n');
}

// ---- Minimax ringan (alpha-beta + batas kedalaman) ----

function minimax(board, current, bot, depth, maxDepth, alpha, beta) {
  const res = checkWin(board);
  if (res.winner === bot) return 10 - depth;
  if (res.winner === 'D') return 0;
  if (res.winner) return depth - 10; // lawan menang
  if (depth >= maxDepth) return 0;

  const foe = bot === 'O' ? 'X' : 'O';
  const isMax = current === bot;
  let best = isMax ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue;
    board[i] = current;
    const score = minimax(board, current === 'O' ? 'X' : 'O', bot, depth + 1, maxDepth, alpha, beta);
    board[i] = null;
    if (isMax) {
      if (score > best) best = score;
      if (score > alpha) alpha = score;
    } else {
      if (score < best) best = score;
      if (score < beta) beta = score;
    }
    if (beta <= alpha) break;
  }
  return best;
}

function bestMoveFor(board, bot, maxDepth) {
  const foe = bot === 'O' ? 'X' : 'O';
  let best = -Infinity;
  let picks = [];
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue;
    board[i] = bot;
    const score = minimax(board, foe, bot, 0, maxDepth, -Infinity, Infinity);
    board[i] = null;
    if (score > best) {
      best = score;
      picks = [i];
    } else if (score === best) {
      picks.push(i);
    }
  }
  if (!picks.length) return -1;
  return picks[Math.floor(Math.random() * picks.length)];
}

/**
 * Langkah bot (minimax ringan). Bisa dipanggil dengan id game (langkah
 * langsung diterapkan ke state) atau dengan array board (murni hitung).
 * @param {string|Array} idOrBoard id game atau array board
 * @param {object} [opts] { bot: 'X'|'O', maxDepth: number }
 *   - bot: simbol bot (default 'O', atau giliran state saat by-id)
 *   - maxDepth: batas kedalaman (default 6; papan 3x3 kecil jadi tetap kuat)
 * @returns {number} indeks 0-8, atau -1 bila papan penuh / game tidak ada
 */
function botMove(idOrBoard, opts = {}) {
  if (Array.isArray(idOrBoard)) {
    const bot = isValidSymbol(opts.bot) ? opts.bot : 'O';
    const maxDepth = Number.isInteger(opts.maxDepth) ? opts.maxDepth : 6;
    return bestMoveFor(idOrBoard, bot, maxDepth);
  }
  const key = String(idOrBoard);
  const state = games.get(key);
  if (!state) return -1;
  if (checkWin(state.board).winner) return -1;
  const bot = isValidSymbol(opts.bot) ? opts.bot : state.turn;
  const maxDepth = Number.isInteger(opts.maxDepth) ? opts.maxDepth : 6;
  const idx = bestMoveFor(state.board, bot, maxDepth);
  if (idx < 0) return -1;
  state.board[idx] = bot;
  const res = checkWin(state.board);
  if (!res.winner) state.turn = bot === 'X' ? 'O' : 'X';
  return idx;
}

// ---------------------------------------------------------------------------
// Quiz (bank soal lokal media/quiz/*.json)
// ---------------------------------------------------------------------------

const QUIZ_DIR = path.join(__dirname, '..', 'media', 'quiz');

// Alias nama kategori -> nama file (tanpa .json).
const QUIZ_ALIAS = {
  siapakahaku: 'siapakahaku',
  whoami: 'siapakahaku',
  'who AmI': 'siapakahaku',
  caklontong: 'caklontong',
  cakLontong: 'caklontong',
  tebakkata: 'tebakkata',
  tebakata: 'tebakkata',
  'tebak-kata': 'tebakkata',
};

const quizCache = new Map(); // kategori -> array soal

function normalizeCategory(kategori) {
  const k = String(kategori || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  for (const [alias, file] of Object.entries(QUIZ_ALIAS)) {
    if (alias.toLowerCase().replace(/[\s_-]+/g, '') === k) return file;
  }
  return String(kategori || '').trim().toLowerCase();
}

/** Daftar kategori kuis yang tersedia (nama file tanpa .json). */
function listCategories() {
  try {
    return fs.readdirSync(QUIZ_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -5));
  } catch {
    return [];
  }
}

function loadQuizData(kategori) {
  const name = normalizeCategory(kategori);
  if (quizCache.has(name)) return quizCache.get(name);
  const file = path.join(QUIZ_DIR, name + '.json');
  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data) || !data.length) {
    throw new Error('Bank soal kosong: ' + name);
  }
  quizCache.set(name, data);
  return data;
}

// Bentuk soal dinormalisasi karena tiap file beda field:
// caklontong/siapakahaku: { pertanyaan, jawaban, deskripsi? }
// tebakkata (dari whatword): { tipe, acak, jawaban }
function normalizeEntry(entry, kategori) {
  const jawaban = String(entry.jawaban ?? entry.answer ?? '').trim();
  let soal = entry.pertanyaan ?? entry.soal ?? entry.question ?? '';
  if (!soal && entry.acak) {
    soal = 'Susun huruf acak berikut menjadi kata yang benar' +
      (entry.tipe ? ' (kategori: ' + entry.tipe + ')' : '') +
      ': ' + entry.acak;
  }
  return {
    kategori,
    soal: String(soal),
    jawaban,
    deskripsi: entry.deskripsi ? String(entry.deskripsi) : null,
    raw: entry,
  };
}

/**
 * Ambil satu soal acak dari kategori.
 * @param {string} kategori mis. 'caklontong' | 'siapakahaku' | 'tebakkata'
 * @returns {{ kategori: string, soal: string, jawaban: string,
 *            deskripsi: string|null, raw: object }}
 */
function randomQuiz(kategori) {
  const data = loadQuizData(kategori);
  const entry = data[Math.floor(Math.random() * data.length)];
  return normalizeEntry(entry, normalizeCategory(kategori));
}

function normalizeAnswer(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Cek jawaban user.
 * @param {object|string} quizOrAnswer objek hasil randomQuiz() atau string kunci jawaban
 * @param {string} userAnswer jawaban user
 * @returns {{ correct: boolean, expected: string }}
 */
function checkAnswer(quizOrAnswer, userAnswer) {
  const expected = typeof quizOrAnswer === 'string'
    ? quizOrAnswer
    : (quizOrAnswer && (quizOrAnswer.jawaban ?? quizOrAnswer.raw?.jawaban)) || '';
  const a = normalizeAnswer(expected);
  const b = normalizeAnswer(userAnswer);
  return { correct: a !== '' && a === b, expected: String(expected).trim() };
}

module.exports = {
  // TicTacToe
  games,
  newGame,
  getGame,
  endGame,
  move,
  checkWin,
  renderText,
  availableMoves,
  botMove,
  WIN_LINES,
  // Quiz
  QUIZ_DIR,
  listCategories,
  randomQuiz,
  checkAnswer,
};
