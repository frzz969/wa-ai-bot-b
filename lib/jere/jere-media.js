// lib/jere-media.js — Port maker/media/anime/donghua/komik/movie/stalker dari jere-md (Jere API).
// Sumber: jere-md_with_autofollow "jere-md with jereapi"/plugins/{maker,anime,donghua,komik,movie,stalker}.
// Sengaja TIDAK mem-port ulang iqc (sudah ada di ./jere-api.js sebagai jereIqc).
// Semua akses HTTP lewat jereGet dari ./jere-api.js (key disuntik di sana, jangan log key).
// Konvensi: fungsi maker/*kalender mengembalikan Buffer gambar; fungsi
// search/detail/stalker mengembalikan data mentah + formatter teks terstruktur.
// CommonJS, tanpa dependensi baru (hanya fetch global Node 18+).

const { jereGet } = require('./jere-api');

function wibNow() {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date()).replace(':', '.');
  } catch {
    return '';
  }
}

function isHttpUrl(value) {
  try {
    const u = new URL(String(value || ''));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function requireText(value, label) {
  const s = String(value == null ? '' : value).trim();
  if (!s) throw new Error(`${label} kosong.`);
  return s;
}

function requireImageUrl(value, label = 'URL gambar') {
  const s = String(value || '').trim();
  if (!isHttpUrl(s)) throw new Error(`${label} harus berupa link http/https yang valid.`);
  return s;
}

function assertBuffer(buf, label = 'gambar') {
  if (!Buffer.isBuffer(buf) || !buf.length) throw new Error(`Jere API mengembalikan ${label} kosong.`);
  return buf;
}

function slugFromUrl(url, fallback = '') {
  const m = String(url || '').match(/\/(anime|episode|lengkap)\/([^/?#]+)\/?$/);
  if (m) return m[2];
  return String(fallback || url || '-');
}

function joinNames(list) {
  if (!Array.isArray(list)) return String(list || '-');
  return list.map((g) => (g && typeof g === 'object' ? (g.name || g.title || '') : String(g))).filter(Boolean).join(', ') || '-';
}

function clip(s, n = 250) {
  const t = String(s == null ? '' : s);
  return t.length > n ? t.slice(0, n) + '...' : t;
}

// ---------------------------------------------------------------------------
// MAKER — QC varian (iqcdark / igqc / ttqc / qcwa)
// ---------------------------------------------------------------------------

async function jereIqcDark(text, avatarUrl, timeStr) {
  const txt = requireText(text, 'Teks iqcdark');
  const params = { txt, imgUrl: String(avatarUrl || '').trim(), timeStr: String(timeStr || '').trim() || wibNow() };
  const res = await jereGet('/api/maker/iqcdark', params, 60000);
  return assertBuffer(res, 'gambar iqcdark');
}

async function jereIgQc(text, avatarUrl, timeStr) {
  const txt = requireText(text, 'Teks igqc');
  const params = { txt, imgUrl: String(avatarUrl || '').trim(), menuTimeStr: String(timeStr || '').trim() || wibNow() };
  const res = await jereGet('/api/maker/igqc', params, 60000);
  return assertBuffer(res, 'gambar igqc');
}

async function jereTtQc(text, username, avatarUrl) {
  const msg = requireText(text, 'Teks ttqc');
  const res = await jereGet('/api/maker/ttqc', {
    text: msg,
    username: String(username || 'User').trim() || 'User',
    pp: String(avatarUrl || '').trim(),
  }, 60000);
  return assertBuffer(res, 'gambar ttqc');
}

async function jereQcWa(text, username, avatarUrl, phone) {
  const msg = requireText(text, 'Teks qcwa');
  const res = await jereGet('/api/maker/qcwa', {
    text: msg,
    username: String(username || '').trim(),
    pp: String(avatarUrl || '').trim(),
    phone: String(phone || '').trim(),
  }, 60000);
  return assertBuffer(res, 'gambar qcwa');
}

// ---------------------------------------------------------------------------
// MAKER — meme (smeme / drake / twobuttons / jarvis / beautiful)
// ---------------------------------------------------------------------------

async function jereSmeme(atas, bawah, imageUrl) {
  const top = requireText(atas, 'Teks atas smeme');
  const res = await jereGet('/api/maker/smeme', {
    atas: top,
    bawah: String(bawah || '_').trim() || '_',
    url: requireImageUrl(imageUrl, 'URL gambar smeme'),
  }, 60000);
  return assertBuffer(res, 'gambar smeme');
}

async function jereDrake(text1, text2) {
  const a = requireText(text1, 'Teks 1 drakememe');
  const b = requireText(text2, 'Teks 2 drakememe');
  const res = await jereGet('/api/maker/drakememe', { text1: a, text2: b }, 60000);
  return assertBuffer(res, 'gambar drakememe');
}

async function jereTwoButtons(teks1, teks2, teks3) {
  const a = requireText(teks1, 'Teks 1 twobuttonsmeme');
  const b = requireText(teks2, 'Teks 2 twobuttonsmeme');
  const params = { teks1: a, teks2: b };
  if (String(teks3 || '').trim()) params.teks3 = String(teks3).trim();
  const res = await jereGet('/api/maker/twobuttonsmeme', params, 60000);
  return assertBuffer(res, 'gambar twobuttonsmeme');
}

async function jereJarvis(text) {
  const msg = requireText(text, 'Teks jarvismeme');
  const res = await jereGet('/api/maker/jarvismeme', { text: msg }, 60000);
  return assertBuffer(res, 'gambar jarvismeme');
}

async function jereBeautiful(image1, image2) {
  const res = await jereGet('/api/maker/beautifulmeme', {
    image1: requireImageUrl(image1, 'URL gambar 1 beautifulmeme'),
    image2: requireImageUrl(image2, 'URL gambar 2 beautifulmeme'),
  }, 60000);
  return assertBuffer(res, 'gambar beautifulmeme');
}

// ---------------------------------------------------------------------------
// MAKER — fake (fakewa / fakecallios / fakeigprofile / fakeafinitasml / fakelobbyff)
// ---------------------------------------------------------------------------

async function jereFakeWa(nama, tentang, telepon, avatarUrl) {
  const res = await jereGet('/api/maker/fakewa', {
    nama: requireText(nama, 'Nama fakewa'),
    tentang: requireText(tentang, 'Tentang fakewa'),
    telepon: requireText(telepon, 'Telepon fakewa'),
    pp: String(avatarUrl || '').trim(),
  }, 60000);
  return assertBuffer(res, 'gambar fakewa');
}

async function jereFakeCallIos(nama, durasi, avatarUrl) {
  const res = await jereGet('/api/maker/fakecallios', {
    nama: requireText(nama, 'Nama fakecallios'),
    durasi: requireText(durasi, 'Durasi fakecallios (cth. 01:23:45)'),
    url: String(avatarUrl || '').trim(),
  }, 60000);
  return assertBuffer(res, 'gambar fakecallios');
}

async function jereFakeIgProfile(opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const res = await jereGet('/api/maker/fakeigprofile', {
    pp: String(o.pp || o.avatarUrl || '').trim(),
    username: requireText(o.username, 'Username fakeigprofile'),
    bio: requireText(o.bio, 'Bio fakeigprofile'),
    pengikut: requireText(o.pengikut ?? o.followers, 'Pengikut fakeigprofile'),
    mengikuti: requireText(o.mengikuti ?? o.following, 'Mengikuti fakeigprofile'),
    postingan: requireText(o.postingan ?? o.posts, 'Postingan fakeigprofile'),
  }, 60000);
  return assertBuffer(res, 'gambar fakeigprofile');
}

async function jereFakeAfinitasMl(imageUrl) {
  const res = await jereGet('/api/maker/fakeafinitasml', {
    url: requireImageUrl(imageUrl, 'URL gambar fakeafinitasml'),
  }, 60000);
  return assertBuffer(res, 'gambar fakeafinitasml');
}

async function jereFakeLobbyFf(nama, lobby) {
  const params = { nama: requireText(nama, 'Nama fakelobbyff') };
  if (String(lobby || '').trim()) params.lobby = String(lobby).trim();
  const res = await jereGet('/api/maker/fakelobbyff', params, 60000);
  return assertBuffer(res, 'gambar fakelobbyff');
}

// ---------------------------------------------------------------------------
// MAKER — igpost / igstory / kalender
// ---------------------------------------------------------------------------

async function jereIgPost(mainPhoto, profilePhoto, opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const params = {
    mainPhoto: requireImageUrl(mainPhoto, 'URL foto utama igpost'),
    profilePhoto: String(profilePhoto || o.pp || '').trim(),
  };
  for (const k of ['username', 'like', 'comment', 'repost']) {
    if (String(o[k] || '').trim()) params[k] = String(o[k]).trim();
  }
  const res = await jereGet('/api/maker/igpost', params, 60000);
  return assertBuffer(res, 'gambar igpost');
}

async function jereIgStory(photo, pp, opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const params = {
    photo: requireImageUrl(photo, 'URL foto igstory'),
    pp: String(pp || o.profilePhoto || '').trim(),
  };
  for (const k of ['username', 'caption', 'like', 'timeStr']) {
    if (String(o[k] || '').trim()) params[k] = String(o[k]).trim();
  }
  const res = await jereGet('/api/maker/igstoryimg', params, 60000);
  return assertBuffer(res, 'gambar igstory');
}

async function jereKalender(query) {
  const q = requireText(query, 'Query kalender');
  const res = await jereGet('/api/maker/kalender', { q }, 60000);
  return assertBuffer(res, 'gambar kalender');
}

// ---------------------------------------------------------------------------
// ANIME — otakudesu search / detail
// ---------------------------------------------------------------------------

async function jereOtakudesuSearch(query) {
  const q = requireText(query, 'Judul anime');
  return jereGet('/api/anime/otakudesu-search', { query: q }, 60000);
}

function formatOtakudesuSearch(result, query) {
  const r = result && typeof result === 'object' ? result : {};
  const items = Array.isArray(r.items) ? r.items : (Array.isArray(result) ? result : []);
  if (!items.length) return `Anime "${String(query || '').trim()}" tidak ditemukan.`;
  let txt = `*OTAKUDESU SEARCH*\nKeyword: ${String(query || '').trim()}\nDitemukan: ${items.length} anime\n\n`;
  items.slice(0, 10).forEach((a, i) => {
    const slug = slugFromUrl(a.url, a.slug);
    txt += `*${i + 1}. ${a.title || a.name || 'Anime'}*\n`;
    if (a.rating) txt += `Rating: ${a.rating}\n`;
    if (a.status) txt += `Status: ${a.status}\n`;
    const genres = Array.isArray(a.genres) ? a.genres.join(', ') : a.genres;
    if (genres) txt += `Genre: ${genres}\n`;
    txt += `Slug: \`${slug}\`\n\n`;
  });
  txt += `Tips: ketik otakudetail <slug> untuk sinopsis & episode.`;
  return txt.trim();
}

async function jereOtakudesuDetail(slug) {
  const s = requireText(slug, 'Slug anime/episode');
  return jereGet('/api/anime/otakudesu-detail-download', { slug: s }, 60000);
}

function formatOtakudesuDetail(data) {
  const d = data && typeof data === 'object' ? data : {};
  let txt = `*OTAKUDESU DETAIL*\n\n`;
  if (d.title) txt += `Judul: ${d.title}\n`;
  if (d.type) txt += `Tipe: ${String(d.type).toUpperCase()}\n`;
  if (d.info && typeof d.info === 'object') {
    txt += `\n*INFORMASI:*\n`;
    for (const k of Object.keys(d.info)) {
      if (typeof d.info[k] === 'object' || typeof d.info[k] === 'function') continue;
      txt += `- ${k.replace(/_/g, ' ').toUpperCase()}: ${d.info[k]}\n`;
    }
  }
  if (d.sinopsis) txt += `\n*SINOPSIS:*\n${d.sinopsis}\n`;
  if (Array.isArray(d.episodes) && d.episodes.length) {
    txt += `\n*EPISODE (${d.episodes.length}):*\n`;
    d.episodes.slice(0, 15).forEach((ep) => {
      txt += `- ${ep.title || 'Episode'} | Slug: \`${ep.slug || '-'}\`${ep.releaseDate ? ` | ${ep.releaseDate}` : ''}\n`;
    });
    if (d.episodes.length > 15) txt += `... dan ${d.episodes.length - 15} episode lainnya.\n`;
  }
  if (Array.isArray(d.downloads) && d.downloads.length) {
    txt += `\n*DOWNLOAD:*\n`;
    for (const g of d.downloads.slice(0, 5)) {
      txt += `[ ${g.group || 'Download'} ]\n`;
      for (const item of (g.items || []).slice(0, 5)) {
        txt += `- ${item.resolution || '-'} (${item.size || '-'}):\n`;
        for (const l of (item.links || []).slice(0, 5)) txt += `  - ${l.host || 'Link'}: ${l.url || '-'}\n`;
      }
    }
  }
  return txt.trim();
}

// ---------------------------------------------------------------------------
// DONGHUA — donghub search / detail / episode
// ---------------------------------------------------------------------------

async function jereDonghubSearch(query, page) {
  const q = requireText(query, 'Judul donghua');
  const params = { query: q };
  if (String(page || '').trim()) params.page = String(page).trim();
  return jereGet('/api/donghua/donghub-search', params, 60000);
}

function formatDonghubSearch(result, query) {
  const r = result && typeof result === 'object' ? result : {};
  const list = Array.isArray(r.results) ? r.results : (Array.isArray(result) ? result : []);
  if (!list.length) return `Donghua "${String(query || '').trim()}" tidak ditemukan.`;
  const pg = r.pagination || {};
  let txt = `*DONGHUA SEARCH*\nKeyword: ${String(query || '').trim()}`;
  if (pg.currentPage) txt += ` (Hal ${pg.currentPage}/${pg.totalPages || 1})`;
  txt += `\nTotal: ${list.length}\n\n`;
  list.slice(0, 10).forEach((it, i) => {
    txt += `*${i + 1}. ${it.title || 'Donghua'}*\n`;
    if (it.type) txt += `Tipe: ${it.type}\n`;
    if (it.status) txt += `Status: ${it.status}\n`;
    if (it.episode || it.subStatus) txt += `Episode: ${it.episode || '-'} (${it.subStatus || '-'})\n`;
    if (it.slug) txt += `Slug: \`${it.slug}\`\n`;
    txt += `\n`;
  });
  txt += `Tips: ketik donghub-detail <slug> untuk sinopsis & episode.`;
  return txt.trim();
}

async function jereDonghubDetail(slug) {
  const s = requireText(slug, 'Slug donghua');
  return jereGet('/api/donghua/donghub-detail', { slug: s }, 60000);
}

function formatDonghubDetail(data) {
  const d = data && typeof data === 'object' ? data : {};
  let txt = `*DONGHUA DETAIL*\n\nJudul: ${d.title || '-'}\n`;
  if (d.metadata && typeof d.metadata === 'object') {
    txt += `\n*INFORMASI:*\n`;
    for (const k of Object.keys(d.metadata)) txt += `- ${k}: ${d.metadata[k]}\n`;
  }
  if (Array.isArray(d.genres) && d.genres.length) txt += `Genre: ${joinNames(d.genres)}\n`;
  if (d.synopsis) txt += `\n*SINOPSIS:*\n${d.synopsis}\n`;
  if (Array.isArray(d.episodes) && d.episodes.length) {
    txt += `\n*EPISODE (${d.episodes.length}):*\n`;
    d.episodes.slice(0, 15).forEach((ep) => {
      txt += `- ${ep.title || 'Episode'} (${ep.subStatus || '-'}) | Slug: \`${ep.slug || '-'}\` | ${ep.date || '-'}\n`;
    });
    if (d.episodes.length > 15) txt += `... dan ${d.episodes.length - 15} episode lainnya.\n`;
  }
  return txt.trim();
}

async function jereDonghubEpisode(slug) {
  const s = requireText(slug, 'Slug episode donghua');
  return jereGet('/api/donghua/donghub-episode', { slug: s }, 60000);
}

function formatDonghubEpisode(data) {
  const d = data && typeof data === 'object' ? data : {};
  let txt = `*DONGHUA STREAMING*\n\nEpisode: ${d.title || '-'}\n`;
  if (d.series && d.series.name) txt += `Series: ${d.series.name}\n`;
  if (d.prev) txt += `Prev: \`${d.prev}\`\n`;
  if (d.next) txt += `Next: \`${d.next}\`\n`;
  if (Array.isArray(d.mirrors) && d.mirrors.length) {
    txt += `\n*STREAMING MIRRORS:*\n`;
    d.mirrors.slice(0, 10).forEach((mItem, i) => {
      txt += `${i + 1}. ${mItem.name || 'Mirror'}\n`;
      if (mItem.streamUrl) txt += `   Link: ${mItem.streamUrl}\n`;
    });
  }
  if (Array.isArray(d.relatedEpisodes) && d.relatedEpisodes.length) {
    txt += `\n*EPISODE LAIN:*\n`;
    d.relatedEpisodes.slice(0, 5).forEach((rep) => {
      txt += `- ${rep.title || 'Episode'} | Slug: \`${rep.slug || '-'}\`\n`;
    });
  }
  return txt.trim();
}

// ---------------------------------------------------------------------------
// KOMIK — komikindo search / detail / stream
// ---------------------------------------------------------------------------

async function jereKomikindoSearch(query) {
  const q = requireText(query, 'Judul komik');
  return jereGet('/api/komik/komikindo-search', { query: q }, 60000);
}

function formatKomikindoSearch(result, query) {
  const list = Array.isArray(result) ? result : (result && Array.isArray(result.comics) ? result.comics : []);
  if (!list.length) return `Komik "${String(query || '').trim()}" tidak ditemukan.`;
  let txt = `*KOMIKINDO SEARCH*\nKeyword: ${String(query || '').trim()}\nDitemukan: ${list.length}\n\n`;
  list.slice(0, 10).forEach((it, i) => {
    txt += `*${i + 1}. ${it.title || 'Komik'}*\n`;
    if (it.type) txt += `Tipe: ${it.type}\n`;
    if (it.chapter || it.latestChapter) txt += `Chapter: ${it.chapter || it.latestChapter}\n`;
    if (it.score || it.rating) txt += `Rating: ${it.score || it.rating}\n`;
    if (it.slug) txt += `Slug: \`${it.slug}\`\n`;
    txt += `\n`;
  });
  txt += `Tips: ketik komikdetail <slug> untuk sinopsis & chapter.`;
  return txt.trim();
}

async function jereKomikindoDetail(slug) {
  const s = requireText(slug, 'Slug komik');
  return jereGet('/api/komik/komikindo-detail', { slug: s }, 60000);
}

function formatKomikindoDetail(data) {
  const d = data && typeof data === 'object' ? data : {};
  let txt = `*KOMIKINDO DETAIL*\n\nJudul: ${d.title || '-'}\n`;
  if (d.altTitle || d.alternativeTitle) txt += `Alternatif: ${d.altTitle || d.alternativeTitle}\n`;
  if (d.status) txt += `Status: ${d.status}\n`;
  if (d.author) txt += `Penulis: ${d.author}\n`;
  if (d.illustrator) txt += `Ilustrator: ${d.illustrator}\n`;
  if (d.score || d.rating) txt += `Rating: ${d.score || d.rating}\n`;
  if (Array.isArray(d.genres) && d.genres.length) txt += `Genre: ${joinNames(d.genres)}\n`;
  if (d.synopsis || d.description) txt += `\n*SINOPSIS:*\n${d.synopsis || d.description}\n`;
  if (Array.isArray(d.chapters) && d.chapters.length) {
    txt += `\n*CHAPTER (${d.chapters.length}):*\n`;
    d.chapters.slice(0, 15).forEach((ch) => {
      txt += `- ${ch.title || 'Chapter'} | Slug: \`${ch.slug || '-'}\`${ch.date ? ` | ${ch.date}` : ''}\n`;
    });
    if (d.chapters.length > 15) txt += `... dan ${d.chapters.length - 15} chapter lainnya.\n`;
  }
  return txt.trim();
}

async function jereKomikindoStream(slug) {
  const s = requireText(slug, 'Slug chapter komik');
  return jereGet('/api/komik/komikindo-stream', { slug: s }, 60000);
}

function formatKomikindoStream(data, fallbackSlug) {
  const d = data && typeof data === 'object' ? data : {};
  let txt = `*KOMIKINDO BACA CHAPTER*\n\nChapter: ${d.title || String(fallbackSlug || '-').trim()}\n`;
  if (d.comicTitle) txt += `Komik: ${d.comicTitle}\n`;
  if (d.prev) txt += `Prev: \`${d.prev}\`\n`;
  if (d.next) txt += `Next: \`${d.next}\`\n`;
  const total = d.totalPages || (Array.isArray(d.images) ? d.images.length : 0);
  txt += `Total halaman: ${total}\n`;
  if (Array.isArray(d.images) && d.images.length) {
    txt += `\n*PANEL:*\n`;
    d.images.slice(0, 10).forEach((u, i) => { txt += `Hal ${i + 1}: ${u}\n`; });
    if (d.images.length > 10) txt += `... dan ${d.images.length - 10} halaman lainnya.\n`;
  }
  return txt.trim();
}

// ---------------------------------------------------------------------------
// MOVIE — moviebox / hurawatch / viu search & detail
// ---------------------------------------------------------------------------

async function jereMovieboxSearch(query, page, perPage, subjectType) {
  const q = requireText(query, 'Query moviebox');
  const params = { query: q };
  if (String(page || '').trim()) params.page = String(page).trim();
  if (String(perPage || '').trim()) params.perPage = String(perPage).trim();
  if (String(subjectType || '').trim()) params.subjectType = String(subjectType).trim();
  return jereGet('/api/movie/moviebox_search', params, 60000);
}

async function jereMovieboxDetail(path, subjectId) {
  const params = {};
  if (String(path || '').trim()) params.path = String(path).trim();
  if (String(subjectId || '').trim()) params.subjectId = String(subjectId).trim();
  if (!params.path && !params.subjectId) throw new Error('Path/subjectId moviebox kosong. Contoh: movieboxdetail <path>|<subjectId>');
  return jereGet('/api/movie/moviebox_detail', params, 60000);
}

async function jereHurawatchSearch(query, page) {
  const q = requireText(query, 'Query hurawatch');
  const params = { query: q };
  if (String(page || '').trim()) params.page = String(page).trim();
  return jereGet('/api/movie/hurawatch_search', params, 60000);
}

async function jereHurawatchDetail(type, id) {
  const t = requireText(type, 'Tipe hurawatch (movie/tv)');
  const i = requireText(id, 'ID hurawatch');
  return jereGet('/api/movie/hurawatch_detail', { type: t, id: i }, 60000);
}

async function jereViu(query) {
  const q = requireText(query, 'Query viu');
  return jereGet('/api/movie/viu', { q }, 60000);
}

function formatMovieResult(result, title = 'MOVIE') {
  if (typeof result === 'string') return result;
  const r = result && typeof result === 'object' ? result : {};
  if (Array.isArray(result)) {
    let txt = `*${String(title).toUpperCase()}* (${result.length})\n\n`;
    result.slice(0, 10).forEach((it, i) => {
      if (!it || typeof it !== 'object') { txt += `${i + 1}. ${String(it)}\n`; return; }
      txt += `*${i + 1}. ${it.title || it.name || 'Tanpa judul'}*\n`;
      for (const k of ['year', 'type', 'rating', 'subjectId', 'id', 'path']) {
        if (it[k] !== undefined && it[k] !== null && String(it[k]).trim() !== '') txt += `${k}: ${it[k]}\n`;
      }
      txt += `\n`;
    });
    return txt.trim();
  }
  let txt = `*${String(title).toUpperCase()}*\n\n`;
  for (const k of Object.keys(r)) {
    if (r[k] !== null && typeof r[k] !== 'object' && typeof r[k] !== 'function') txt += `*${k}:* ${r[k]}\n`;
  }
  if (Array.isArray(r.episodes) && r.episodes.length) {
    txt += `\n*EPISODE (${r.episodes.length}):*\n`;
    r.episodes.slice(0, 10).forEach((ep) => { txt += `- ${ep.title || ep.name || 'Episode'}\n`; });
  }
  return txt.trim() || 'Data film kosong.';
}

// ---------------------------------------------------------------------------
// STALKER — ig / tiktok / yt / roblox / github / npm
// ---------------------------------------------------------------------------

async function jereIgStalk(username) {
  const clean = String(username || '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').split('/')[0].replace(/^@/, '').trim();
  if (!clean) throw new Error('Username Instagram kosong. Contoh: igstalk instagram');
  try {
    return await jereGet('/api/stalker/igstalk', { username: clean }, 60000);
  } catch {
    const fb = await jereGet('/api/tools/instagram-stalker', { username: clean }, 60000);
    const r = fb && typeof fb === 'object' ? fb : {};
    return {
      username: r.username || clean,
      metadata: { posts: r.posts || '0', followers: r.followers || '0', following: r.following || '0', avatar: r.profilePic || '' },
      stories: { data: { user: { full_name: r.name || '-', biography: r.bio || '-', profile_pic_url: r.profilePic || '', is_private: false, is_verified: false } } },
    };
  }
}

function formatIgStalk(data, fallback) {
  const d = data && typeof data === 'object' ? data : {};
  const uname = d.username || fallback || '-';
  const meta = d.metadata || {};
  const u = (d.stories && d.stories.data && d.stories.data.user) || {};
  let txt = `*INSTAGRAM PROFILE*\n\nUsername: @${uname}\n`;
  txt += `Nama: ${u.full_name || meta.fullName || '-'}\n`;
  txt += `Bio: ${clip(u.biography || meta.bio || '-', 300)}\n`;
  txt += `Followers: ${meta.followers || '-'} | Following: ${meta.following || '-'} | Posts: ${meta.posts || '-'}\n`;
  if (typeof u.is_verified === 'boolean') txt += `Verified: ${u.is_verified ? 'Ya' : 'Tidak'}\n`;
  if (typeof u.is_private === 'boolean') txt += `Private: ${u.is_private ? 'Ya' : 'Tidak'}\n`;
  txt += `Link: https://www.instagram.com/${uname}`;
  return txt.trim();
}

async function jereTiktokStalk(username) {
  const clean = String(username || '').replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, '').split('/')[0].replace(/^@/, '').trim();
  if (!clean) throw new Error('Username TikTok kosong. Contoh: tiktokstalk tiktok');
  const search = await jereGet('/api/search/tiktok', { query: clean }, 60000).catch(() => []);
  const videos = Array.isArray(search) ? search : (search && Array.isArray(search.result) ? search.result : []);
  let repost = null;
  try {
    repost = await jereGet('/api/stalker/tiktokrepost', { username: clean }, 60000);
  } catch { repost = null; }
  if ((!videos || !videos.length) && !repost) throw new Error('Akun TikTok tidak ditemukan.');
  return { username: clean, videos, repost };
}

function formatTiktokStalk(data) {
  const d = data && typeof data === 'object' ? data : {};
  const videos = Array.isArray(d.videos) ? d.videos : [];
  const top = videos[0] || null;
  let txt = `*TIKTOK PROFILE*\n\nUsername: @${d.username || '-'}\n`;
  if (top && top.author) txt += `Nickname: ${top.author}\n`;
  if (top && top.title) txt += `Caption terbaru: ${clip(top.title, 200)}\n`;
  if (top && top.stats) txt += `Views: ${top.stats.views || 0} | Likes: ${top.stats.likes || 0} | Komen: ${top.stats.comments || 0} | Share: ${top.stats.shares || 0}\n`;
  if (d.repost && d.repost.total !== undefined) txt += `Total repost: ${d.repost.total}\n`;
  txt += `Link: https://www.tiktok.com/@${d.username || ''}`;
  return txt.trim();
}

async function jereYtStalk(query) {
  const q = String(query || '').replace(/^https?:\/\/(www\.)?youtube\.com\/(@|channel\/|user\/)?/i, '').trim();
  if (!q) throw new Error('Query YouTube kosong. Contoh: ytstalk MrBeast');
  return jereGet('/api/stalker/ytstalk', { query: q }, 60000);
}

function formatYtStalk(data, fallback) {
  const p = data && typeof data === 'object' ? data : {};
  let txt = `*YOUTUBE CHANNEL*\n\nNama: ${p.name || fallback || '-'}\n`;
  if (p.id) txt += `ID: ${p.id}\n`;
  txt += `Subscribers: ${p.subscribers || '-'}\n`;
  txt += `Total video: ${p.video_count || '-'}\n`;
  if (typeof p.verified === 'boolean') txt += `Verified: ${p.verified ? 'Ya' : 'Tidak'}\n`;
  if (p.about) txt += `About: ${clip(p.about, 250)}\n`;
  if (p.url) txt += `Link: ${p.url}`;
  return txt.trim();
}

async function jereRoblox(username) {
  const clean = String(username || '').replace(/^https?:\/\/(www\.)?roblox\.com\/(users|player)\/(\d+)\/profile/i, '$3').trim();
  if (!clean) throw new Error('Username/ID Roblox kosong. Contoh: robloxstalk builderman');
  return jereGet('/api/stalker/roblox', { username: clean }, 60000);
}

function formatRoblox(data) {
  const d = data && typeof data === 'object' ? data : {};
  const r = d.roblox || d;
  let txt = `*ROBLOX PROFILE*\n\nUsername: ${r.username || '-'}\n`;
  txt += `Display: ${r.display_name || r.displayName || r.username || '-'}\n`;
  if (r.id) txt += `ID: ${r.id}\n`;
  if (r.description) txt += `Bio: ${clip(r.description, 250)}\n`;
  if (r.social) txt += `Followers: ${r.social.followers_count ?? 0} | Friends: ${r.social.friends_count ?? 0}\n`;
  if (typeof r.has_verified_badge === 'boolean') txt += `Verified: ${r.has_verified_badge ? 'Ya' : 'Tidak'}\n`;
  if (r.created_date || r.created) txt += `Dibuat: ${r.created_date || r.created}\n`;
  if (r.presence) txt += `Presence: ${r.presence.status || 'Offline'}\n`;
  if (r.id) txt += `Link: https://www.roblox.com/users/${r.id}/profile`;
  return txt.trim();
}

async function jereGithub(username) {
  const clean = String(username || '').replace(/^https?:\/\/(www\.)?github\.com\//i, '').split('/')[0].replace(/^@/, '').trim();
  if (!clean) throw new Error('Username GitHub kosong. Contoh: githubstalk torvalds');
  return jereGet('/api/stalker/stalkgithub', { username: clean }, 60000);
}

function formatGithub(data, fallback) {
  const p = data && typeof data === 'object' ? data : {};
  let txt = `*GITHUB PROFILE*\n\nUsername: @${p.username || fallback || '-'}\n`;
  txt += `Nama: ${p.name || '-'}\nBio: ${clip(p.bio || '-', 250)}\n`;
  txt += `Followers: ${p.followers ?? 0} | Following: ${p.following ?? 0}\n`;
  txt += `Repos: ${p.public_repos ?? 0} | Gists: ${p.public_gists ?? 0}\n`;
  if (p.company) txt += `Company: ${p.company}\n`;
  if (p.location) txt += `Location: ${p.location}\n`;
  if (p.blog) txt += `Blog: ${p.blog}\n`;
  txt += `Link: ${p.url || `https://github.com/${p.username || fallback || ''}`}`;
  return txt.trim();
}

async function jereNpm(query, limit = 5) {
  const q = requireText(query, 'Nama package npm');
  const res = await jereGet('/api/search/npm', { query: q, limit: Number(limit) || 5 }, 60000);
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.result)) return res.result;
  return res;
}

function formatNpm(pkg) {
  const p = pkg && typeof pkg === 'object' ? pkg : {};
  let txt = `*NPM PACKAGE*\n\nPaket: ${p.name || '-'}\nVersi: ${p.version || '-'}\n`;
  if (p.description) txt += `Deskripsi: ${clip(p.description, 250)}\n`;
  txt += `Author: ${p.author || '-'}\n`;
  if (Array.isArray(p.maintainers)) txt += `Maintainers: ${p.maintainers.slice(0, 5).join(', ')}\n`;
  if (p.license) txt += `License: ${p.license}\n`;
  if (p.date) txt += `Rilis: ${p.date}\n`;
  if (p.links && p.links.npm) txt += `Link: ${p.links.npm}`;
  return txt.trim();
}

module.exports = {
  // maker QC
  jereIqcDark,
  jereIgQc,
  jereTtQc,
  jereQcWa,
  // maker meme
  jereSmeme,
  jereDrake,
  jereTwoButtons,
  jereJarvis,
  jereBeautiful,
  // maker fake
  jereFakeWa,
  jereFakeCallIos,
  jereFakeIgProfile,
  jereFakeAfinitasMl,
  jereFakeLobbyFf,
  // maker igpost/story/kalender
  jereIgPost,
  jereIgStory,
  jereKalender,
  // anime
  jereOtakudesuSearch,
  formatOtakudesuSearch,
  jereOtakudesuDetail,
  formatOtakudesuDetail,
  // donghua
  jereDonghubSearch,
  formatDonghubSearch,
  jereDonghubDetail,
  formatDonghubDetail,
  jereDonghubEpisode,
  formatDonghubEpisode,
  // komik
  jereKomikindoSearch,
  formatKomikindoSearch,
  jereKomikindoDetail,
  formatKomikindoDetail,
  jereKomikindoStream,
  formatKomikindoStream,
  // movie
  jereMovieboxSearch,
  jereMovieboxDetail,
  jereHurawatchSearch,
  jereHurawatchDetail,
  jereViu,
  formatMovieResult,
  // stalker
  jereIgStalk,
  formatIgStalk,
  jereTiktokStalk,
  formatTiktokStalk,
  jereYtStalk,
  formatYtStalk,
  jereRoblox,
  formatRoblox,
  jereGithub,
  formatGithub,
  jereNpm,
  formatNpm,
};
