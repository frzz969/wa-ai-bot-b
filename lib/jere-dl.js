// lib/jere-dl.js — Port downloader Jere API untuk wa-ai-bot-b.
// Referensi pola URL dari jere-md: `${global.web}/api/downloader/<nama>?apikey=${apiKey}&url=...`
// Di sini dipakai wrapper jereGet dari ./jere-api.js:
//   - key dibaca dari require('../config').JERE_API_KEY (error ramah bila kosong)
//   - key dikirim sebagai query `key`, JANGAN pernah di-log/di-print
//   - jereGet melempar bila status gagal & mengembalikan `data.result ?? data.data ?? data`
// Standalone: JANGAN wiring ke router/handler dari file ini.
// CommonJS, fetch native (Node 18+), tanpa dependensi baru.

const { jereGet } = require('./jere-api');

function isHttpUrl(value) {
  try {
    const u = new URL(String(value || ''));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function requireUrl(value, label = 'URL') {
  if (!isHttpUrl(value)) throw new Error(`${label} harus berupa link http/https yang valid.`);
  return String(value).trim();
}

function str(v) {
  return v === undefined || v === null ? '' : String(v);
}

function firstString(...vals) {
  for (const v of vals) {
    const s = str(v).trim();
    if (s) return s;
  }
  return '';
}

function asArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function mediaItemUrl(item) {
  if (!item) return '';
  if (typeof item === 'string') return item.trim();
  if (typeof item === 'object') {
    return firstString(item.url, item.download_url, item.downloadUrl, item.download, item.link);
  }
  return '';
}

function isVideoUrl(url, hintType = '') {
  if (String(hintType).toLowerCase() === 'video') return true;
  return /\.(mp4|mkv|mov|avi|webm)($|\?)/i.test(str(url));
}

// Unduh file jauh menjadi Buffer (untuk audio/dokumen: spotify, soundcloud, applemusic, ytmp3).
// Dipakai opsional oleh pemanggil Baileys bila ingin kirim Buffer, bukan URL langsung.
async function fetchFileBuffer(fileUrl, timeoutMs = 120000) {
  const target = requireUrl(fileUrl, 'URL file');
  const res = await fetch(target, {
    headers: { 'User-Agent': 'wa-ai-bot-b/1.0' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Gagal mengunduh file (HTTP ${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error('File yang diunduh kosong.');
  return buf;
}

// ---------- TikTok ----------

async function jereTiktok(url) {
  const target = requireUrl(url, 'URL TikTok');
  const r = (await jereGet('/api/downloader/tiktok', { url: target }, 90000)) || {};
  const raw = (r && typeof r === 'object' && (r.raw_data || r.data)) || {};
  const title = firstString(r.description, raw.title, r.title, 'TikTok Video');
  const images = asArray(raw.images || r.images || r.data?.images || r.result?.images)
    .map(mediaItemUrl)
    .filter(Boolean);
  const links = asArray(r.links);
  const withoutWm = links.find((l) => /without|nowm/i.test(str(l && l.label))) || {};
  const videoUrl = firstString(
    withoutWm.url,
    raw.play,
    links[0] && links[0].url,
    r.play,
    r.video,
    r.no_watermark,
    r.url,
  );
  const musicUrl = firstString(
    links.find((l) => /audio|mp3|music/i.test(str(l && l.label)))?.url,
    raw.music_info?.play_url,
    raw.music,
    r.music,
  );
  if (!videoUrl && !images.length) throw new Error('Jere API tidak mengembalikan link video TikTok.');
  return {
    url: images.length ? images : videoUrl,
    title,
    meta: {
      author: firstString(raw.author?.nickname, raw.nickname, r.author, '-'),
      username: firstString(raw.author?.unique_id, raw.unique_id, r.username, ''),
      duration: raw.duration ? `${raw.duration} detik` : firstString(r.duration, '-'),
      views: raw.play_count ?? r.views ?? '-',
      likes: raw.digg_count ?? r.likes ?? '-',
      comments: raw.comment_count ?? r.comments ?? '-',
      shares: raw.share_count ?? r.shares ?? '-',
      musicTitle: firstString(raw.music_info?.title, raw.music, r.musicTitle, '-'),
      musicUrl,
      type: images.length ? 'slide' : 'video',
    },
  };
}

async function jereSaveTt(url) {
  const target = requireUrl(url, 'URL TikTok');
  const r = (await jereGet('/api/downloader/savett', { url: target }, 90000)) || {};
  const title = firstString(r.title, 'TikTok Video');
  const images = asArray(r.images).map(mediaItemUrl).filter(Boolean);
  const videoUrl = firstString(r.nowm, r.video, r.download_url, r.url);
  const musicUrl = firstString(typeof r.music === 'string' ? r.music : r.music?.url);
  if (!videoUrl && !images.length) throw new Error('Jere API tidak mengembalikan link video SaveTT.');
  return {
    url: images.length ? images : videoUrl,
    title,
    meta: {
      author: firstString(r.author, '-'),
      duration: firstString(r.duration, '-'),
      type: r.type || (images.length ? 'slide' : 'video'),
      musicUrl,
    },
  };
}

// ---------- YouTube ----------

async function jereYoutube(url, format = 'mp3') {
  const target = requireUrl(url, 'URL YouTube');
  const fmt = str(format).toLowerCase() === 'mp4' ? 'mp4' : 'mp3';
  const r = (await jereGet('/api/downloader/youtube', { url: target, format: fmt }, 90000)) || {};
  const fileUrl = firstString(r.download, r.url, r.downloadUrl, r.download_url);
  if (!fileUrl) throw new Error('Jere API tidak mengembalikan link unduhan YouTube.');
  return {
    url: fileUrl,
    title: firstString(r.title, 'YouTube Media'),
    meta: {
      format: fmt,
      channel: firstString(r.channel, r.author, 'YouTube'),
      duration: firstString(r.duration, '-'),
      thumbnail: firstString(r.thumbnail, r.id ? `https://i.ytimg.com/vi/${r.id}/hqdefault.jpg` : ''),
    },
  };
}

async function jereYtmp3(url) {
  const target = requireUrl(url, 'URL YouTube');
  const r = (await jereGet('/api/downloader/ytmp3', { url: target }, 90000)) || {};
  const fileUrl = firstString(r.downloadUrl, r.url, r.download, r.download_url);
  if (!fileUrl) throw new Error('Jere API tidak mengembalikan link audio YouTube.');
  return {
    url: fileUrl,
    title: firstString(r.title, 'YouTube Audio'),
    meta: {
      channel: firstString(r.channel, r.author, 'YouTube'),
      duration: firstString(r.duration, '-'),
      thumbnail: firstString(r.thumbnail, r.id ? `https://i.ytimg.com/vi/${r.id}/hqdefault.jpg` : ''),
    },
  };
}

async function jereYtmp3v2(url) {
  const target = requireUrl(url, 'URL YouTube');
  const r = (await jereGet('/api/downloader/ytmp3v2', { url: target }, 90000)) || {};
  const fileUrl = firstString(r.download_url, r.downloadUrl, r.download, r.url);
  if (!fileUrl) throw new Error('Jere API tidak mengembalikan link audio YouTube (v2).');
  return {
    url: fileUrl,
    title: firstString(r.title, 'YouTube Audio'),
    meta: {
      channel: firstString(r.channel, r.author, 'YouTube'),
      duration: firstString(r.duration, '-'),
      thumbnail: firstString(r.thumbnail, r.video_id ? `https://i.ytimg.com/vi/${r.video_id}/hqdefault.jpg` : ''),
    },
  };
}

async function jereYtmp4(url, quality = '720') {
  const target = requireUrl(url, 'URL YouTube');
  const q = str(quality || '720').replace(/p$/i, '') || '720';
  const r = (await jereGet('/api/downloader/ytmp4', { url: target, quality: q }, 90000)) || {};
  const fileUrl = firstString(r.downloadUrl, r.url, r.download, r.download_url);
  if (!fileUrl) throw new Error('Jere API tidak mengembalikan link video YouTube.');
  return {
    url: fileUrl,
    title: firstString(r.title, 'YouTube Video'),
    meta: {
      quality: `${q}p`,
      channel: firstString(r.channel, r.author, ''),
      duration: firstString(r.duration, ''),
      thumbnail: firstString(r.thumbnail, ''),
    },
  };
}

async function jereYtmp4v2(url) {
  const target = requireUrl(url, 'URL YouTube');
  const r = await jereGet('/api/downloader/ytmp4v2', { url: target }, 90000);
  const list = asArray(Array.isArray(r) ? r : r?.result || r?.data || r?.medias || []);
  if (!list.length) throw new Error('Jere API tidak mengembalikan daftar video YouTube (v2).');
  const best =
    list.find((v) => ['720p', '1080p'].includes(str(v && v.quality))) || list[0];
  const fileUrl = firstString(best && best.url, best && best.download_url);
  if (!fileUrl) throw new Error('Jere API tidak mengembalikan link video YouTube (v2).');
  return {
    url: fileUrl,
    title: firstString(best.title, r.title, 'YouTube Video'),
    meta: {
      quality: firstString(best.quality, 'Standard'),
      list: list.map((v) => ({ quality: str(v.quality || ''), url: str(v.url || '') })),
    },
  };
}

// ---------- Instagram / Threads ----------

async function jereInstagram(url) {
  const target = requireUrl(url, 'URL Instagram');
  const r = (await jereGet('/api/downloader/instagram', { url: target }, 90000)) || {};
  const urls = asArray(r.urls || (Array.isArray(r) ? r : r.result || []));
  const items = urls
    .map((it) => ({
      url: mediaItemUrl(it),
      type: typeof it === 'object' && it ? str(it.type || '') : '',
    }))
    .filter((it) => it.url);
  if (!items.length) throw new Error('Jere API tidak mengembalikan media Instagram.');
  const flat = items.map((it) => it.url);
  return {
    url: flat.length === 1 ? flat[0] : flat,
    title: firstString(r.title, 'Instagram Media'),
    meta: { count: items.length, items },
  };
}

async function jereThreads(url) {
  const target = requireUrl(url, 'URL Threads');
  const r = (await jereGet('/api/downloader/threads', { url: target }, 90000)) || {};
  const mediaList = asArray(r.media || r.result || (Array.isArray(r) ? r : []));
  if (!mediaList.length) throw new Error('Jere API tidak mengembalikan media Threads.');
  const items = mediaList
    .map((it) => ({
      url: typeof it === 'string' ? it.trim() : firstString(it.url, it.download_url),
      type: typeof it === 'object' && it ? str(it.type || '') : '',
    }))
    .filter((it) => it.url);
  if (!items.length) throw new Error('Jere API tidak mengembalikan media Threads.');
  const flat = items.map((it) => it.url);
  return {
    url: flat.length === 1 ? flat[0] : flat,
    title: firstString(r.caption, r.post?.caption, 'Threads Media'),
    meta: {
      author: firstString(r.author?.username, r.user?.username, ''),
      fullName: firstString(r.author?.full_name, r.user?.full_name, ''),
      likes: r.likes ?? r.post?.like_count ?? '-',
      items,
    },
  };
}

async function jereThreadsV2(url) {
  const target = requireUrl(url, 'URL Threads');
  const r = (await jereGet('/api/downloader/threadsv2', { url: target }, 90000)) || {};
  const mediaList = asArray(r.media || r.result || (Array.isArray(r) ? r : []));
  const items = mediaList
    .map((it) => ({
      url: typeof it === 'string' ? it.trim() : firstString(it.download, it.url, it.download_url),
      type: typeof it === 'object' && it ? str(it.type || '') : '',
    }))
    .filter((it) => it.url);
  if (!items.length) throw new Error('Jere API tidak mengembalikan media Threads (v2).');
  const flat = items.map((it) => it.url);
  return {
    url: flat.length === 1 ? flat[0] : flat,
    title: firstString(r.caption, r.author?.caption, 'Threads Media'),
    meta: {
      author: firstString(r.author?.username, ''),
      caption: firstString(r.author?.caption, r.caption, ''),
      items,
    },
  };
}

async function jereSssThreads(url) {
  const target = requireUrl(url, 'URL Threads');
  const r = (await jereGet('/api/downloader/sssthreads', { url: target }, 90000)) || {};
  const mediaList = asArray(r.media || (Array.isArray(r) ? r : [r]));
  const items = mediaList
    .map((it) => ({
      url: typeof it === 'string' ? it.trim() : firstString(it.download, it.url, it.download_url),
      type: typeof it === 'object' && it ? str(it.type || '') : '',
    }))
    .filter((it) => it.url);
  if (!items.length) throw new Error('Jere API tidak mengembalikan media Threads.');
  const flat = items.map((it) => it.url);
  return {
    url: flat.length === 1 ? flat[0] : flat,
    title: firstString(r.author?.caption, 'Threads Media'),
    meta: { author: firstString(r.author?.username, ''), items },
  };
}

// ---------- Facebook ----------

async function jereFacebook(url) {
  const target = requireUrl(url, 'URL Facebook');
  const r = (await jereGet('/api/downloader/facebook', { url: target }, 90000)) || {};
  const fileUrl = firstString(r.video_hd, r.video_sd, r.result?.hd, r.result?.sd, r.result?.url, r.url);
  if (!fileUrl) throw new Error('Jere API tidak mengembalikan link video Facebook.');
  return {
    url: fileUrl,
    title: firstString(r.title, r.result?.title, 'Facebook Video'),
    meta: {
      duration: firstString(r.duration, r.result?.duration, '-'),
      quality: r.video_hd ? 'HD' : 'SD',
    },
  };
}

// ---------- Spotify ----------

async function jereSpotify(url) {
  const target = requireUrl(url, 'URL Spotify');
  const r = (await jereGet('/api/downloader/spotify', { url: target }, 120000)) || {};
  const t = r && typeof r === 'object' ? r : {};
  const fileUrl = firstString(t.download, t.download_url, t.url, t.audio, t.link);
  if (!fileUrl) throw new Error('Jere API tidak mengembalikan link audio Spotify.');
  return {
    url: fileUrl,
    title: firstString(t.title, t.name, 'Spotify Track'),
    meta: {
      artist: firstString(t.artist, t.artists, '-'),
      album: firstString(t.album, '-'),
      duration: firstString(t.duration, '-'),
      thumbnail: firstString(t.thumbnail, t.cover, t.image, ''),
    },
  };
}

async function jereSpotifyV2(url) {
  const target = requireUrl(url, 'URL Spotify');
  const r = (await jereGet('/api/downloader/spotifyv2', { url: target }, 120000)) || {};
  const d = r && typeof r === 'object' ? r : {};
  const fileUrl = firstString(d.downloadUrl, d.download, d.url);
  if (!fileUrl) throw new Error('Jere API tidak mengembalikan link audio Spotify (v2).');
  return {
    url: fileUrl,
    title: firstString(d.title, 'Spotify Track'),
    meta: {
      artist: firstString(d.artist, '-'),
      album: firstString(d.album, '-'),
      duration: firstString(d.duration, '-'),
      thumbnail: firstString(d.thumbnail, d.cover, ''),
    },
  };
}

async function jereSpotifyV3(url) {
  const target = requireUrl(url, 'URL Spotify');
  const r = (await jereGet('/api/downloader/spotifyv3', { url: target }, 120000)) || {};
  const metaRaw = (r && typeof r === 'object' && (r.metadata || r.meta)) || {};
  const links = (r && typeof r === 'object' && r.links) || r || {};
  const fileUrl = firstString(links.download, links.url, links.mp3, r.download_url, r.url);
  if (!fileUrl) throw new Error('Jere API tidak mengembalikan link audio Spotify (v3).');
  return {
    url: fileUrl,
    title: firstString(metaRaw.name, metaRaw.title, 'Spotify Track'),
    meta: {
      artist: firstString(metaRaw.artist, '-'),
      album: firstString(metaRaw.album, '-'),
      duration: firstString(metaRaw.duration, '-'),
      thumbnail: firstString(metaRaw.cover, metaRaw.thumbnail, ''),
    },
  };
}

// ---------- CapCut ----------

async function jereCapcut(url) {
  const target = requireUrl(url, 'URL CapCut');
  const r = (await jereGet('/api/downloader/capcut', { url: target }, 90000)) || {};
  const arrVideo = Array.isArray(r.video)
    ? (r.video.find((v) => v && v.kualitas === 'tinggi') || r.video[0])
    : null;
  const fileUrl = firstString(
    r.result?.video_url,
    r.result?.videoUrl,
    arrVideo && arrVideo.url,
    r.video_url,
    r.url,
  );
  if (!fileUrl) throw new Error('Jere API tidak mengembalikan link video CapCut.');
  return {
    url: fileUrl,
    title: firstString(r.result?.title, r.judul, 'CapCut Video'),
    meta: { author: firstString(r.result?.author_name, r.author, '-') },
  };
}

// ---------- MediaFire ----------

async function jereMediafire(url) {
  const target = requireUrl(url, 'URL MediaFire');
  const r = (await jereGet('/api/downloader/mediafire', { url: target }, 90000)) || {};
  const fileUrl = firstString(r.download, r.download_url, r.url, r.result?.download_url, r.result?.url);
  if (!fileUrl) throw new Error('Jere API tidak mengembalikan link file MediaFire.');
  const filename = firstString(r.filename, r.result?.filename, 'mediafire_file');
  return {
    url: fileUrl,
    title: filename,
    meta: {
      filename,
      filesize: firstString(r.filesize, r.size, r.result?.filesize, '-'),
      ext: firstString(r.ext, r.result?.ext, ''),
    },
  };
}

async function jereMediafireDl(url) {
  const target = requireUrl(url, 'URL MediaFire');
  const r = (await jereGet('/api/downloader/mediafiredl', { url: target }, 90000)) || {};
  const fileUrl = firstString(r.download, r.download_url, r.url, r.result?.download_url, r.result?.url);
  if (!fileUrl) throw new Error('Jere API tidak mengembalikan link file MediaFire.');
  const filename = firstString(r.filename, r.result?.filename, 'mediafire_file');
  return {
    url: fileUrl,
    title: filename,
    meta: {
      filename,
      filesize: firstString(r.filesize, r.size, r.result?.filesize, '-'),
      ext: firstString(r.ext, r.result?.ext, ''),
    },
  };
}

// ---------- TeraBox ----------

async function jereTerabox(url) {
  const target = requireUrl(url, 'URL TeraBox');
  const r = (await jereGet('/api/downloader/terabox', { url: target }, 90000)) || {};
  const d = r && typeof r === 'object' ? r : {};
  const fileUrl = firstString(d.direct_link, d.download_link, d.url, d.downloadUrl, d.download);
  if (!fileUrl) throw new Error('Jere API tidak mengembalikan link file TeraBox.');
  const filename = firstString(d.title, d.filename, d.file_name, 'terabox_download');
  return {
    url: fileUrl,
    title: filename,
    meta: { filename, size: firstString(d.size, d.filesize, '-') },
  };
}

async function jereTeraboxDl(url) {
  const target = requireUrl(url, 'URL TeraBox');
  const r = (await jereGet('/api/downloader/terabox-dl', { url: target }, 90000)) || {};
  const d = r && typeof r === 'object' ? r : {};
  const fileUrl = firstString(d.download_url, d.fast_download_url, d.url, d.download);
  if (!fileUrl) throw new Error('Jere API tidak mengembalikan link file TeraBox.');
  const filename = firstString(d.filename, d.file_name, 'terabox_download');
  return {
    url: fileUrl,
    title: filename,
    meta: { filename, size: firstString(d.size, '-') },
  };
}

// ---------- SFile ----------

async function jereSfile(url) {
  const target = requireUrl(url, 'URL SFile');
  const r = (await jereGet('/api/downloader/sfilemobidl', { url: target }, 90000)) || {};
  const d = r && typeof r === 'object' ? r : {};
  const fileUrl = firstString(d.download_url, d.download, d.url);
  if (!fileUrl) throw new Error('Jere API tidak mengembalikan link file SFile.');
  const filename = firstString(d.file_name, d.filename, 'sfile_download');
  return {
    url: fileUrl,
    title: filename,
    meta: {
      filename,
      size: firstString(d.size_from_text, d.size, '-'),
      uploader: firstString(d.author_name, d.uploader, '-'),
    },
  };
}

// ---------- Douyin / SnackVideo ----------

async function jereDouyin(url) {
  const target = requireUrl(url, 'URL Douyin');
  const r = (await jereGet('/api/downloader/douyin', { url: target }, 90000)) || {};
  const d = r && typeof r === 'object' ? r : {};
  const title = firstString(d.title, 'Douyin Video');
  const images = asArray(d.images).map(mediaItemUrl).filter(Boolean);
  const videoUrl = firstString(d.video, d.nowm, d.download_url, d.url);
  const musicUrl = firstString(typeof d.music === 'string' ? d.music : d.music?.url);
  if (!videoUrl && !images.length) throw new Error('Jere API tidak mengembalikan link video Douyin.');
  return {
    url: images.length ? images : videoUrl,
    title,
    meta: {
      author: firstString(d.author, '-'),
      type: images.length ? 'slide' : 'video',
      musicUrl,
    },
  };
}

async function jereSnackVideo(url) {
  const target = requireUrl(url, 'URL SnackVideo');
  const r = (await jereGet('/api/downloader/snackvideo', { url: target }, 90000)) || {};
  const d = r && typeof r === 'object' ? r : {};
  const fileUrl = firstString(d.video, d.download_url, d.url);
  if (!fileUrl) throw new Error('Jere API tidak mengembalikan link video SnackVideo.');
  return {
    url: fileUrl,
    title: firstString(d.title, d.description, 'SnackVideo'),
    meta: {
      author: firstString(d.author, '-'),
      likes: d.likes ?? '-',
      comments: d.comments ?? '-',
    },
  };
}

// ---------- Twitter / X ----------

async function jereTwitter(url) {
  const target = requireUrl(url, 'URL X/Twitter');
  const r = (await jereGet('/api/downloader/x', { url: target }, 90000)) || {};
  const d = r && typeof r === 'object' ? r : {};
  let media = asArray(d.media || d.medias || []);
  if (!media.length && (d.video_url || d.image_url || d.url || d.download_url)) {
    media = [
      {
        type: d.video_url ? 'video' : 'image',
        url: firstString(d.video_url, d.image_url, d.url, d.download_url),
      },
    ];
  }
  const items = media
    .map((it) => ({
      url: mediaItemUrl(it),
      type: typeof it === 'object' && it ? str(it.type || '') : '',
    }))
    .filter((it) => it.url);
  if (!items.length) throw new Error('Jere API tidak mengembalikan media X/Twitter.');
  const flat = items.map((it) => it.url);
  const tweetText = firstString(d.text, d.description, 'X Media');
  return {
    url: flat.length === 1 ? flat[0] : flat,
    title: tweetText.length > 120 ? `${tweetText.slice(0, 120)}…` : tweetText,
    meta: {
      author: firstString(d.author_name, d.author, '-'),
      username: firstString(d.author_screen_name, d.username, ''),
      text: tweetText,
      likes: d.likes ?? '-',
      retweets: d.retweets ?? '-',
      items,
    },
  };
}

async function jereSssTweet(url) {
  const target = requireUrl(url, 'URL X/Twitter');
  const r = await jereGet('/api/downloader/ssstweet', { url: target }, 90000);
  const list = asArray(Array.isArray(r) ? r : r?.media || [r]);
  const items = list
    .map((it) => ({
      url: mediaItemUrl(it),
      type: typeof it === 'object' && it ? str(it.type || '') : '',
    }))
    .filter((it) => it.url);
  if (!items.length) throw new Error('Jere API tidak mengembalikan media tweet.');
  const flat = items.map((it) => it.url);
  return {
    url: flat.length === 1 ? flat[0] : flat,
    title: 'X Media',
    meta: { count: items.length, items },
  };
}

// ---------- SoundCloud / Apple Music ----------

async function jereSoundcloud(url) {
  const target = requireUrl(url, 'URL SoundCloud');
  const r = (await jereGet('/api/downloader/soundcloud', { url: target }, 120000)) || {};
  const d = r && typeof r === 'object' ? r : {};
  const fileUrl = firstString(d.download_url, d.download, d.url);
  if (!fileUrl) throw new Error('Jere API tidak mengembalikan link audio SoundCloud.');
  return {
    url: fileUrl,
    title: firstString(d.title, 'SoundCloud Track'),
    meta: {
      uploader: firstString(d.uploader, d.author, '-'),
      duration: firstString(d.duration, '-'),
      size: firstString(d.size, '-'),
      views: d.views ?? '-',
      likes: d.likes ?? '-',
    },
  };
}

async function jereAppleMusic(url) {
  const target = requireUrl(url, 'URL Apple Music');
  const r = (await jereGet('/api/downloader/applemusicdl', { url: target }, 120000)) || {};
  const d = r && typeof r === 'object' ? r : {};
  const fileUrl = firstString(d.url_dl, d.download, d.download_url, d.url);
  if (!fileUrl) throw new Error('Jere API tidak mengembalikan link audio Apple Music.');
  return {
    url: fileUrl,
    title: firstString(d.title, d.name, 'Apple Music Track'),
    meta: {
      artist: firstString(d.artist, '-'),
      album: firstString(d.album, '-'),
      duration: firstString(d.duration, '-'),
    },
  };
}

// ---------- Pinterest ----------

async function jerePinterest(url) {
  const target = requireUrl(url, 'URL Pinterest');
  const r = (await jereGet('/api/downloader/pin', { url: target }, 90000)) || {};
  const d = r && typeof r === 'object' ? r : {};
  const fileUrl =
    typeof r === 'string' && isHttpUrl(r)
      ? r
      : firstString(d.url, d.download_url, d.image, d.video);
  if (!fileUrl) throw new Error('Jere API tidak mengembalikan media Pinterest.');
  return {
    url: fileUrl,
    title: firstString(d.title, 'Pinterest Media'),
    meta: {
      type: firstString(d.type, isVideoUrl(fileUrl) ? 'video' : 'image'),
    },
  };
}

async function jerePinterestDl(url) {
  const target = requireUrl(url, 'URL Pinterest');
  const r = (await jereGet('/api/downloader/pinterest-downloader', { url: target }, 90000)) || {};
  const d = r && typeof r === 'object' ? r : {};
  const fileUrl =
    typeof r === 'string' && isHttpUrl(r)
      ? r
      : firstString(d.url, d.download_url, d.image, d.video);
  if (!fileUrl) throw new Error('Jere API tidak mengembalikan media Pinterest.');
  return {
    url: fileUrl,
    title: firstString(d.title, 'Pinterest Media'),
    meta: {
      type: firstString(d.type, isVideoUrl(fileUrl) ? 'video' : 'image'),
    },
  };
}

// ---------- AIO / FastDL ----------

async function jereAio(url) {
  const target = requireUrl(url, 'URL');
  const r = (await jereGet('/api/downloader/aio', { url: target }, 90000)) || {};
  const medias = asArray(r.medias || r.result?.medias || (r.url ? [{ url: r.url }] : []));
  const first = medias[0];
  const fileUrl = mediaItemUrl(first);
  if (!fileUrl) throw new Error('Jere API tidak mengembalikan media (AIO).');
  return {
    url: fileUrl,
    title: firstString(r.title, r.result?.title, 'AIO Media'),
    meta: { count: medias.length, medias },
  };
}

async function jereAioV2(url) {
  const target = requireUrl(url, 'URL');
  const r = (await jereGet('/api/downloader/aiov2', { url: target }, 90000)) || {};
  const medias = asArray(r.medias || r.result?.medias || (r.url ? [{ url: r.url }] : []));
  const first = medias[0];
  const fileUrl = mediaItemUrl(first);
  if (!fileUrl) throw new Error('Jere API tidak mengembalikan media (AIO v2).');
  return {
    url: fileUrl,
    title: firstString(r.title, r.result?.title, 'AIO Media'),
    meta: { count: medias.length, medias },
  };
}

async function jereFastDl(url) {
  const target = requireUrl(url, 'URL');
  const r = await jereGet('/api/downloader/fastdl', { url: target }, 90000);
  const list = asArray(Array.isArray(r) ? r : r?.result || [r]);
  const items = list
    .map((it) => ({
      url: mediaItemUrl(it),
      type: typeof it === 'object' && it ? str(it.type || '') : '',
    }))
    .filter((it) => it.url);
  if (!items.length) throw new Error('Jere API tidak mengembalikan media (FastDL).');
  const flat = items.map((it) => it.url);
  return {
    url: flat.length === 1 ? flat[0] : flat,
    title: 'FastDL Media',
    meta: { count: items.length, items },
  };
}

// ---------- Stiker Telegram ----------

async function jereStickerTele(url) {
  const target = requireUrl(url, 'URL Stiker Telegram');
  const r = (await jereGet('/api/downloader/stickertele', { url: target }, 90000)) || {};
  const d = r && typeof r === 'object' ? r : {};
  const stickers = asArray(d.stickers)
    .map((s) => ({
      url: typeof s === 'string' ? s.trim() : firstString(s.url),
      emoji: typeof s === 'object' && s ? str(s.emoji || '') : '',
    }))
    .filter((s) => s.url);
  if (!stickers.length) throw new Error('Jere API tidak mengembalikan stiker Telegram.');
  return {
    url: stickers.map((s) => s.url),
    title: firstString(d.title, 'Telegram Stickers'),
    meta: {
      type: firstString(d.type, ''),
      count: stickers.length,
      stickers,
    },
  };
}

module.exports = {
  fetchFileBuffer,
  jereTiktok,
  jereSaveTt,
  jereSaveTT: jereSaveTt,
  jereYoutube,
  jereYtmp3,
  jereYtmp3v2,
  jereYtmp3V2: jereYtmp3v2,
  jereYtmp4,
  jereYtmp4v2,
  jereYtmp4V2: jereYtmp4v2,
  jereInstagram,
  jereThreads,
  jereThreadsV2,
  jereSssThreads,
  jereFacebook,
  jereFb: jereFacebook,
  jereSpotify,
  jereSpotifyV2,
  jereSpotifyV3,
  jereCapcut,
  jereMediafire,
  jereMediafireDl,
  jereTerabox,
  jereTeraboxDl,
  jereSfile,
  jereSfileMobi: jereSfile,
  jereDouyin,
  jereSnackVideo,
  jereTwitter,
  jereX: jereTwitter,
  jereSssTweet,
  jereSoundcloud,
  jereAppleMusic,
  jereAppleMusicDl: jereAppleMusic,
  jerePinterest,
  jerePin: jerePinterest,
  jerePinterestDl,
  jereAio,
  jereAioV2,
  jereFastDl,
  jereStickerTele,
};
