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
        max_tokens: 1024,
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
  const GEMINI_TIMEOUT_MS = 8000;
  const GROQ_TIMEOUT_MS = 12000;
  const t0 = Date.now();

  const elapsed = () => Date.now() - t0 + 'ms';

  return await new Promise((resolve, reject) => {
    let settled = false;
    let groqStarted = false;
    let doneCount = 0;
    let total = 1;

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
    const timer = setTimeout(startGroq, HEDGE_MS);

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
};
