require('dotenv').config();

async function test() {
  const start = Date.now();

  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: 'balas singkat: hai' }],
            },
          ],
        }),
      }
    );

    const json = await res.json();

    console.log('Status:', res.status);
    console.log('Waktu:', Date.now() - start, 'ms');
    console.log('Response:', JSON.stringify(json, null, 2));
  } catch (err) {
    console.log('Error:', err.message);
    console.log('Waktu:', Date.now() - start, 'ms');
  }
}

test();