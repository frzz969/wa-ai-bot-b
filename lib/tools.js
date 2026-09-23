// lib/tools.js — helper WEB & INFO gratis tanpa API key
// search (DuckDuckGo), news (Google News RSS), weather (Open-Meteo), time (Intl + map + Open-Meteo geocoding)

// Wikipedia ringkasan (id) — tahap pertama .search sebelum DDG
async function wikiSummary(q) {
  const title = String(q || '').trim().replace(/\s+/g, '_');
  if (!title) throw new Error('Wiki kosong');
  const res = await fetch(
    `https://id.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    {
      headers: { 'User-Agent': 'WA-AI-Bot/1.0' },
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!res.ok) throw new Error('Wiki HTTP ' + res.status);
  const j = await res.json();
  const extract = String(j.extract || '').trim();
  if (!extract || j.type === 'disambiguation') throw new Error('Wiki kosong');
  return {
    title: j.title || q,
    extract: extract.slice(0, 1200),
    url: j.content_urls?.desktop?.page || '',
  };
}

async function ddgSearch(q) {
  const url =
    `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}` +
    `&format=json&no_html=1&lang=id`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000), // fail fast: kosong/gagal langsung fallback pesan
  });
  if (!res.ok) throw new Error('DDG HTTP ' + res.status);
  const json = await res.json();
  const abstract = String(json.AbstractText || '').trim();
  const topics = (json.RelatedTopics || [])
    .filter((t) => t && t.Text)
    .slice(0, 3)
    .map((t) => ({ text: String(t.Text).slice(0, 300), url: t.FirstURL || '' }));
  return { abstract, topics };
}

function decodeXml(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '');
}

async function googleNews(topic) {
  const url =
    `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}` +
    `&hl=id&gl=ID&ceid=ID:id`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error('News HTTP ' + res.status);
  const xml = await res.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 5);
  const pick = (block, tag) => {
    const r = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
    return r ? decodeXml(r[1].trim()).slice(0, 300) : '';
  };
  return items
    .map((it) => ({
      title: pick(it[1], 'title'),
      link: pick(it[1], 'link'),
      pubDate: pick(it[1], 'pubDate'),
    }))
    .filter((x) => x.title);
}

function weatherDesc(code) {
  const c = Number(code);
  if (c === 0) return 'Cerah';
  if (c >= 1 && c <= 3) return 'Cerah berawan';
  if (c === 45 || c === 48) return 'Berkabut';
  if ([51, 53, 55, 56, 57].includes(c)) return 'Gerimis';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(c)) return 'Hujan';
  if ([71, 73, 75, 77, 85, 86].includes(c)) return 'Salju';
  if ([95, 96, 99].includes(c)) return 'Badai petir';
  return 'Berawan';
}

async function getWeather(city) {
  // Geocoding wajib dulu (forecast butuh lat/lon) — tak bisa paralel;
  // masing-masing fail-fast 8 detik.
  const gRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=id&format=json`,
    { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
  );
  if (!gRes.ok) throw new Error('Geocoding HTTP ' + gRes.status);
  const g = await gRes.json();
  const loc = g.results && g.results[0];
  if (!loc) throw new Error('Kota tidak ditemukan');

  const fRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
    `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m` +
    `&daily=temperature_2m_max,temperature_2m_min&timezone=auto`,
    { signal: AbortSignal.timeout(8000) }
  );
  if (!fRes.ok) throw new Error('Forecast HTTP ' + fRes.status);
  const f = await fRes.json();
  return {
    name: loc.name,
    country: loc.country || '',
    temp: f.current?.temperature_2m,
    humidity: f.current?.relative_humidity_2m,
    wind: f.current?.wind_speed_10m,
    max: f.daily?.temperature_2m_max?.[0],
    min: f.daily?.temperature_2m_min?.[0],
    desc: weatherDesc(f.current?.weather_code),
  };
}

// Mapping kota -> timezone (key sudah normalisasi: lowercase, spasi tunggal)
const TIMEZONES = {
  jakarta: 'Asia/Jakarta',
  bogor: 'Asia/Jakarta',
  depok: 'Asia/Jakarta',
  tangerang: 'Asia/Jakarta',
  bekasi: 'Asia/Jakarta',
  bandung: 'Asia/Jakarta',
  semarang: 'Asia/Jakarta',
  surabaya: 'Asia/Jakarta',
  yogyakarta: 'Asia/Jakarta',
  yogya: 'Asia/Jakarta',
  jogja: 'Asia/Jakarta',
  solo: 'Asia/Jakarta',
  surakarta: 'Asia/Jakarta',
  malang: 'Asia/Jakarta',
  medan: 'Asia/Jakarta',
  palembang: 'Asia/Jakarta',
  padang: 'Asia/Jakarta',
  pekanbaru: 'Asia/Jakarta',
  lampung: 'Asia/Jakarta',
  'bandar lampung': 'Asia/Jakarta',
  pontianak: 'Asia/Jakarta',
  denpasar: 'Asia/Makassar',
  bali: 'Asia/Makassar',
  makassar: 'Asia/Makassar',
  balikpapan: 'Asia/Makassar',
  samarinda: 'Asia/Makassar',
  banjarmasin: 'Asia/Makassar',
  manado: 'Asia/Makassar',
  mataram: 'Asia/Makassar',
  kupang: 'Asia/Makassar',
  jayapura: 'Asia/Jayapura',
  ambon: 'Asia/Jayapura',
  sorong: 'Asia/Jayapura',
  singapura: 'Asia/Singapore',
  singapore: 'Asia/Singapore',
  'kuala lumpur': 'Asia/Kuala_Lumpur',
  kuala: 'Asia/Kuala_Lumpur',
  bangkok: 'Asia/Bangkok',
  tokyo: 'Asia/Tokyo',
  seoul: 'Asia/Seoul',
  beijing: 'Asia/Shanghai',
  shanghai: 'Asia/Shanghai',
  'hong kong': 'Asia/Hong_Kong',
  hongkong: 'Asia/Hong_Kong',
  taipei: 'Asia/Taipei',
  dubai: 'Asia/Dubai',
  london: 'Europe/London',
  paris: 'Europe/Paris',
  moskow: 'Europe/Moscow',
  moscow: 'Europe/Moscow',
  'new york': 'America/New_York',
  york: 'America/New_York',
  'los angeles': 'America/Los_Angeles',
  sydney: 'Australia/Sydney',
};

// Normalisasi input: lowercase, underscore/hyphen jadi spasi, spasi ganda rapikan
function normCity(s) {
  return String(s || '').toLowerCase().trim().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ');
}

function findTimezone(city) {
  const c = normCity(city);
  if (!c) return null;
  if (TIMEZONES[c]) return { label: c, zone: TIMEZONES[c] }; // exact dulu
  for (const key of Object.keys(TIMEZONES)) {
    if (c.includes(key) || key.includes(c)) return { label: key, zone: TIMEZONES[key] };
  }
  return null;
}

// Waktu lokal dihitung langsung via Intl (tanpa API) untuk kota di map.
// Kota di luar map -> null -> handler fallback ke chatAI.
function localTimeIn(zone) {
  const now = new Date();
  const str = new Intl.DateTimeFormat('id-ID', {
    timeZone: zone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(now);
  let abbrev = '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'short',
    }).formatToParts(now);
    abbrev = parts.find((p) => p.type === 'timeZoneName')?.value || '';
  } catch {}
  return { str, abbrev, iso: now.toISOString() };
}

async function getLocalTime(city) {
  // 1. Map lokal (offline, instan)
  const found = findTimezone(city);
  if (found) {
    const l = localTimeIn(found.zone);
    return { kota: city, zone: found.zone, datetime: l.iso, abbrev: l.abbrev, str: l.str, local: true };
  }
  // 2. Kota di luar map: geocoding Open-Meteo (gratis) -> timezone asli.
  // Jadi hampir semua kota beneran kejawab jamnya, tanpa lempar ke AI
  // yang tidak tahu waktu real-time.
  try {
    const gRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=id&format=json`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
    );
    if (gRes.ok) {
      const g = await gRes.json();
      const loc = g.results && g.results[0];
      let zone = loc && loc.timezone;
      if (loc && !zone) {
        const fRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
          `&current=temperature_2m&timezone=auto`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (fRes.ok) zone = (await fRes.json()).timezone;
      }
      if (loc && zone) {
        const l = localTimeIn(zone);
        const label = [loc.name, loc.country].filter(Boolean).join(', ');
        return { kota: label, zone, datetime: l.iso, abbrev: l.abbrev, str: l.str, local: true };
      }
    }
  } catch (e) {
    console.warn('[time] geocoding gagal:', e?.message || e);
  }
  return null; // kota benar-benar tidak dikenal -> handler fallback ke chatAI
}

module.exports = { wikiSummary, ddgSearch, googleNews, getWeather, getLocalTime };
