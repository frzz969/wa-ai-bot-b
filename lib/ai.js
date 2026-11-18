// lib/ai.js — Chat AI mode balapan Gemini vs Groq + Transkrip VN (Groq Whisper)
// Race: Gemini ditembak dulu; Groq baru mulai setelah 2.5 dtk jika Gemini belum selesai.
// Request yang kalah dibatalkan via AbortController.
// Vision tetap Gemini saja.

const config = require('../config');

// ---------- Gemini ----------
async function geminiChat(
  prompt,
  imageBase64,
  mimeType = 'image/jpeg',
  style = config.STYLE,
  signal
) {
  if (!config.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY kosong');

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL}` +
    `:generateContent`;

  const parts = [{ text: String(prompt || '') }];

  if (imageBase64) {
    parts.push({
      inlineData: {
        mimeType: mimeType || 'image/jpeg',
        data: imageBase64,
      },
    });
  }

  const res = await fetch(url, {
    method: 'POST',
    signal: signal || AbortSignal.timeout(5000),
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{ parts }],
      systemInstruction: {
        parts: [{ text: style || config.STYLE }],
      },
    }),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(
      'Gemini error: ' + (json?.error?.message || res.status)
    );
    err.status = res.status || json?.error?.code || 0;
    throw err;
  }

  const text = json?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || '')
    .join('')
    .trim();

  if (!text) throw new Error('Gemini respon kosong');

  return text;
}

// ---------- Groq (chat) ----------
async function groqChat(prompt, style = config.STYLE, signal) {
  if (!config.GROQ_API_KEY) throw new Error('GROQ_API_KEY kosong');

  const res = await fetch(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      signal: signal || AbortSignal.timeout(12000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: config.GROQ_CHAT_MODEL,
        messages: [
          {
            role: 'system',
            content: style || config.STYLE,
          },
          {
            role: 'user',
            content: String(prompt || ''),
          },
        ],
        temperature: 0.7,
        // Groq on-demand membatasi ~1000 output token/menit; 1024 sering
        // ditolak ("Requested 1024 exceed limit"). 512 aman untuk chat.
        max_tokens: 512,
      }),
    }
  );

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(
      'Groq error: ' + (json?.error?.message || res.status)
    );
    err.status = res.status || 0;
    throw err;
  }

  const text = json?.choices?.[0]?.message?.content?.trim();

  if (!text) throw new Error('Groq respon kosong');

  return text;
}

// ---------- Fallback / Race utama ----------
// Teks:
// - Gemini mulai lebih dulu.
// - Groq baru mulai setelah 2.5 detik jika Gemini belum selesai.
// - Jika Gemini selesai duluan, Groq tidak pernah dipanggil.
// - Jika Groq sudah mulai dan salah satu menang, request yang kalah di-abort.
//
// Vision:
// - Hanya Gemini karena Groq chat tidak menangani gambar.
// - Gagal langsung memberi pesan ramah.
async function chatAI(
  prompt,
  imageBase64,
  mimeType,
  style = config.STYLE
) {
  const sys = style || config.STYLE;

  // ---------- Vision ----------
  if (imageBase64) {
    try {
      return await geminiChat(
        prompt,
        imageBase64,
        mimeType,
        sys
      );
    } catch (e) {
      throw new Error(
        'Maaf, AI gambar sedang sibuk/gagal. Coba lagi sebentar ya.'
      );
    }
  }

  // ---------- Hedged Race ----------
  const HEDGE_MS = 2500;
  // Gemini sering memakan 6-8 dtk; 8000ms terlalu ketat dan memaksa Groq
  // menang terus walau Gemini pertama. Beri ruang tanpa memblokir hedge.
  const GEMINI_TIMEOUT_MS = 15000;
  const GROQ_TIMEOUT_MS = 12000;
  const t0 = Date.now();

  const elapsed = () => Date.now() - t0 + 'ms';

  return await new Promise((resolve, reject) => {
    let settled = false;
    let groqStarted = false;
    let doneCount = 0;
    let total = 1;
    let timer = null; // dideklarasi sebelum cleanup agar tidak TDZ

    const errors = [];

    const geminiController = new AbortController();
    const groqController = new AbortController();
    const geminiTimeout = setTimeout(
      () => geminiController.abort(new Error('Gemini timeout')),
      GEMINI_TIMEOUT_MS
    );
    const groqTimeout = setTimeout(
      () => groqController.abort(new Error('Groq timeout')),
      GROQ_TIMEOUT_MS
    );

    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(geminiTimeout);
      clearTimeout(groqTimeout);
    };

    const clientErr = () =>
      errors.find((x) => {
        const st = Number(x?.status || 0);
        return st >= 400 && st < 500;
      }) || errors[errors.length - 1];

    const onOk = (ans, who) => {
      if (settled) return;

      settled = true;
      cleanup();

      // Batalkan request yang kalah jika sudah dimulai.
      if (who === 'gemini') {
        if (groqStarted) {
          groqController.abort();
        }
      } else {
        geminiController.abort();
      }

      console.log(`[chatAI] menang: ${who} (${elapsed()})`);
      resolve(ans);
    };

    const onFailOne = (who) => (e) => {
      // Abort karena racer lain menang bukan error yang perlu
      // dianggap sebagai kegagalan user.
      if (e?.name === 'AbortError' && settled) {
        return;
      }

      console.warn(
        `[chatAI] racer gagal: ${who} (${elapsed()}):`,
        e?.message || e
      );

      errors.push(e);
      doneCount++;

      if (groqStarted) {
        if (doneCount === total && !settled) {
          settled = true;
          cleanup();
          reject(clientErr());
        }
      } else {
        // Gemini gagal sebelum hedge:
        // langsung mulai Groq tanpa menunggu timer.
        clearTimeout(timer);
        startGroq();
      }
    };

    const startGroq = () => {
      if (groqStarted || settled) return;

      groqStarted = true;
      total = 2;

      Promise.resolve(
        groqChat(prompt, sys, groqController.signal)
      ).then(
        (ans) => onOk(ans, 'groq'),
        onFailOne('groq')
      );
    };

    // Groq hanya dimulai kalau Gemini belum selesai setelah 2.5 detik.
    timer = setTimeout(startGroq, HEDGE_MS);

    // Gemini selalu menjadi request pertama.
    Promise.resolve(
      geminiChat(
        prompt,
        undefined,
        undefined,
        sys,
        geminiController.signal
      )
    ).then(
      (ans) => onOk(ans, 'gemini'),
      onFailOne('gemini')
    );
  });
}

// ---------- Fase 6: Tool calling via Groq ----------
// Gemini diprioritaskan; bila gagal, chatAIWithTools mencoba Groq tool-calling
// sebelum jatuh ke chat teks biasa. Groq memakai format OpenAI Chat Completions.

// Gemini memakai tipe huruf besar (OBJECT/STRING); OpenAI butuh JSON Schema
// huruf kecil. Turunkan tipe secara rekursif hanya pada field `type`.
function toOpenAIFunction(tool) {
  const src = tool && typeof tool === 'object' ? tool : {};
  const lowerType = (node) => {
    if (!node || typeof node !== 'object') return node;
    const out = Array.isArray(node) ? [] : {};
    for (const [k, v] of Object.entries(node)) {
      out[k] = k === 'type' && typeof v === 'string' ? v.toLowerCase() : lowerType(v);
    }
    return out;
  };
  return {
    type: 'function',
    function: {
      name: String(src.name || ''),
      description: String(src.description || ''),
      parameters: lowerType(
        src.parameters && typeof src.parameters === 'object'
          ? src.parameters
          : { type: 'object', properties: {} }
      ),
    },
  };
}

async function groqChatWithTools(prompt, tools, style = config.STYLE, signal) {
  if (!config.GROQ_API_KEY) throw new Error('GROQ_API_KEY kosong');

  const declarations = Array.isArray(tools) && tools.length ? tools : [];
  if (!declarations.length) throw new Error('groqChatWithTools butuh tools');

  const res = await fetch(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      signal: signal || AbortSignal.timeout(12000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: config.GROQ_CHAT_MODEL,
        messages: [
          { role: 'system', content: style || config.STYLE },
          { role: 'user', content: String(prompt || '') },
        ],
        tools: declarations.map(toOpenAIFunction),
        tool_choice: 'auto',
        temperature: 0.7,
        // Groq on-demand membatasi ~1000 output token/menit; 512 aman.
        max_tokens: 512,
      }),
    }
  );

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error('Groq tools error: ' + (json?.error?.message || res.status));
    err.status = res.status || 0;
    throw err;
  }

  const msg = json?.choices?.[0]?.message || {};
  const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

  for (const tc of calls) {
    const name = tc?.function?.name;
    if (!name) continue;
    let args = tc.function.arguments;
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch { args = {}; }
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)) args = {};
    const lower = {};
    for (const [k, v] of Object.entries(args)) lower[String(k).toLowerCase()] = v;
    // Format sama seperti geminiChatWithTools agar tool-router tanpa perubahan.
    return {
      type: 'tool',
      call: {
        name: String(name),
        arguments: {
          command: String(lower.command ?? '').trim(),
          args: String(lower.args ?? '').trim(),
          reason: String(lower.reason ?? '').trim(),
        },
      },
    };
  }

  const text = String(msg.content || '').trim();
  return { type: 'text', text };
}

// ---------- Fase 5: Tool calling via Gemini ----------
// Mengirim katalog `toFunctionDeclarations()` ke Gemini generateContent, lalu
// membaca `candidates[0].content.parts[].functionCall` bila ada.
//
// Prioritas: Gemini. Bila format/API menolak tools (error 4xx) ATAU Gemini gagal,
// fallback ke `chatAI` biasa supaya chat tidak pernah mati.
//
// Kembalian:
//   { type:'tool', call:{ name, arguments }, text }  -> ada function call
//   { type:'text', text }                            -> jawaban teks biasa
//
// Catatan: `tools` TIDAK dikirim ke Groq di sini (prioritas Gemini dulu). Bila
// Gemini tidak tersedia, kita tetap memanggil `chatAI` (race Gemini+Groq) yang
// sudah ada, sehingga perilaku lama dipertahankan persis.
function normalizeDeclaration(decl) {
  const out = { ...decl };
  const params = out.parameters;
  if (params && typeof params === 'object') {
    const p = { ...params };
    if (typeof p.type === 'string') p.type = p.type.toUpperCase();
    if (p.properties && typeof p.properties === 'object') {
      const props = {};
      for (const [k, v] of Object.entries(p.properties)) {
        props[k] = v && typeof v === 'object' && typeof v.type === 'string'
          ? { ...v, type: v.type.toUpperCase() }
          : v;
      }
      p.properties = props;
    }
    out.parameters = p;
  }
  return out;
}

async function geminiChatWithTools(prompt, tools, style = config.STYLE, signal) {
  if (!config.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY kosong');

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL}` +
    `:generateContent`;

  const declarations = Array.isArray(tools) && tools.length
    ? tools.map(normalizeDeclaration)
    : [];

  const body = {
    contents: [{ parts: [{ text: String(prompt || '') }] }],
    systemInstruction: { parts: [{ text: style || config.STYLE }] },
    tools: [{ functionDeclarations: declarations }],
    toolConfig: {
      functionCallingConfig: { mode: 'AUTO' },
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    signal: signal || AbortSignal.timeout(15000),
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.GEMINI_API_KEY,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error('Gemini tools error: ' + (json?.error?.message || res.status));
    err.status = res.status || json?.error?.code || 0;
    throw err;
  }

  const parts = json?.candidates?.[0]?.content?.parts || [];

  // Function call lebih diprioritaskan daripada teks (model kadang mengirim keduanya).
  for (const part of parts) {
    const fc = part?.functionCall;
    if (!fc || !fc.name) continue;
    let args = fc.args;
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch { args = {}; }
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)) args = {};
    // Beberapa model mengirim argumen berhuruf besar → normalisasi ke huruf kecil.
    const lower = {};
    for (const [k, v] of Object.entries(args)) lower[String(k).toLowerCase()] = v;
    return {
      type: 'tool',
      call: {
        name: String(fc.name),
        arguments: {
          command: String(lower.command ?? '').trim(),
          args: String(lower.args ?? '').trim(),
          reason: String(lower.reason ?? '').trim(),
        },
      },
    };
  }

  const text = parts.map((p) => p.text || '').join('').trim();
  return { type: 'text', text };
}

async function chatAIWithTools(prompt, tools, style = config.STYLE) {
  // tools default: katalog sonezz_run bila tidak diberikan.
  let declarations = tools;
  if (!Array.isArray(declarations)) {
    try {
      declarations = require('./capabilities').toFunctionDeclarations();
    } catch {
      declarations = [];
    }
  }

  try {
    const r = await geminiChatWithTools(prompt, declarations, style);
    if (r && (r.type === 'tool' || (r.type === 'text' && r.text))) return r;
    // Respon kosong → anggap gagal, coba Groq tool-calling.
  } catch (e) {
    // Tools ditolak API / Gemini gagal → coba Groq sebelum fallback teks.
    console.warn('[chatAIWithTools] Gemini tools gagal, coba Groq:', e?.message || e);
  }

  if (Array.isArray(declarations) && declarations.length) {
    try {
      const r = await groqChatWithTools(prompt, declarations, style);
      if (r && (r.type === 'tool' || (r.type === 'text' && r.text))) return r;
    } catch (e) {
      // Groq menolak tools / error → fallback diam ke chat teks biasa.
      console.warn('[chatAIWithTools] Groq tools gagal, fallback teks:', e?.message || e);
    }
  }

  const text = await chatAI(prompt, undefined, undefined, style);
  return { type: 'text', text };
}

// ---------- Transkrip VN via Groq Whisper ----------
async function transcribeAudio(
  buffer,
  mime = 'audio/ogg'
) {
  if (!config.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY kosong');
  }

  const form = new FormData();
  const blob = new Blob([buffer], { type: mime });

  const ext = mime.includes('mp3')
    ? 'mp3'
    : mime.includes('wav')
      ? 'wav'
      : mime.includes('m4a')
        ? 'm4a'
        : 'ogg';

  form.append('file', blob, `voice.${ext}`);
  form.append('model', config.GROQ_WHISPER_MODEL);
  form.append('language', 'id');

  const res = await fetch(
    'https://api.groq.com/openai/v1/audio/transcriptions',
    {
      method: 'POST',
      signal: AbortSignal.timeout(25000),
      headers: {
        Authorization: `Bearer ${config.GROQ_API_KEY}`,
      },
      body: form,
    }
  );

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      'Whisper error: ' + (json?.error?.message || res.status)
    );
  }

  const text = (json?.text || '').trim();

  if (!text) throw new Error('Transkrip kosong');

  return text;
}

module.exports = {
  chatAI,
  geminiChat,
  groqChat,
  transcribeAudio,
  chatAIWithTools,
  geminiChatWithTools,
  groqChatWithTools,
};
