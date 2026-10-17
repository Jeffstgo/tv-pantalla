// Actualiza data/headlines.json y data/live.json para la pantalla del TV.
// Lo ejecuta GitHub Actions cada 30 minutos (ver .github/workflows/update.yml).
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Safari/537.36';

const FEEDS = [
  { source: 'La Tercera', url: 'https://www.latercera.com/arc/outboundfeeds/rss/?outputType=xml' },
  { source: 'Cooperativa', url: 'https://www.cooperativa.cl/noticias/site/tax/port/all/rss____1.xml' },
  { source: 'BBC Mundo', url: 'https://feeds.bbci.co.uk/mundo/rss.xml' },
  { source: 'CIPER', url: 'https://www.ciperchile.cl/feed/' },
];

// En orden de preferencia: se usa el primero que esté en vivo y permita incrustarse.
const CHANNELS = [
  { name: 'CNN Chile', handle: 'CNNChile', id: 'UCpOAcjJNAp0Y0fhznRrXIJQ' },
  { name: 'CNN en Español', handle: 'CNNEE', id: 'UC_lEiu6917IJz03TnntWUaQ' },
  { name: 'T13', handle: 'teletrece', id: 'UCPClE65B0W8cc82dytDKIrw' },
  { name: 'France 24 Español', handle: 'France24_es', id: 'UCUdOoVWuWmgo1wByzcsyKDQ' },
  { name: 'DW Español', handle: 'dwespanol', id: 'UCT4Jg8h03dD0iN3Pb5L0PMA' },
];

const PER_SOURCE = 8;
const MAX_TOTAL = 32;

async function get(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'es-CL,es;q=0.9' },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

function decode(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : '';
}

async function headlinesFrom({ source, url }) {
  const xml = await get(url);
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  return items
    .map((it) => ({ source, title: tag(it, 'title'), link: tag(it, 'link'), date: new Date(tag(it, 'pubDate')).toISOString() }))
    .filter((h) => h.title && !Number.isNaN(Date.parse(h.date)))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, PER_SOURCE);
}

async function liveFrom(ch) {
  const html = await get(`https://www.youtube.com/@${ch.handle}/live`);
  const id = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/)?.[1];
  if (!id || !/"isLiveNow":true/.test(html) || /"playableInEmbed":false/.test(html)) return null;
  const oembed = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`, { signal: AbortSignal.timeout(20000) });
  if (!oembed.ok) return null;
  const { title } = await oembed.json();
  return { videoId: id, channel: ch.name, channelId: ch.id, title };
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; }
}

// Escribe solo si cambió el contenido (sin contar la fecha de actualización), para no generar commits vacíos.
async function save(path, data) {
  const old = await readJson(path);
  const strip = (o) => JSON.stringify({ ...o, updatedAt: undefined });
  if (old && strip(old) === strip(data)) return false;
  await writeFile(path, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 1) + '\n');
  return true;
}

await mkdir('data', { recursive: true });

const results = await Promise.allSettled(FEEDS.map(headlinesFrom));
const items = results.flatMap((r, i) => {
  if (r.status === 'rejected') console.warn(`Titulares ${FEEDS[i].source}: ${r.reason.message}`);
  return r.status === 'fulfilled' ? r.value : [];
});
items.sort((a, b) => b.date.localeCompare(a.date));
if (items.length) {
  const changed = await save('data/headlines.json', { items: items.slice(0, MAX_TOTAL) });
  console.log(`Titulares: ${items.length} (${changed ? 'actualizados' : 'sin cambios'})`);
}

let live = null;
for (const ch of CHANNELS) {
  try {
    live = await liveFrom(ch);
  } catch (e) {
    console.warn(`En vivo ${ch.name}: ${e.message}`);
  }
  if (live) break;
}
const changedLive = await save('data/live.json', { ...(live ?? { videoId: null }), fallbacks: CHANNELS.map(({ name, id }) => ({ name, id })) });
console.log(`En vivo: ${live ? `${live.channel} ${live.videoId}` : 'ninguno, la página usará el respaldo por canal'} (${changedLive ? 'actualizado' : 'sin cambios'})`);
