import type { SetInfo } from '../shared/look.js';

/**
 * Lista de sets del canal @discosraros, sin clave de API. YouTube falla seguido, así que hay
 * tres fuentes, en orden:
 *   1. El feed RSS público (últimos 15 videos, con fecha).
 *   2. La página de videos del canal (últimos ~30, sin fecha exacta).
 *   3. Una lista guardada en el código (SNAPSHOT), para que Sets nunca quede vacío.
 */
const CHANNEL_ID = 'UCOStJ214QjXlm_XHeqfT2JQ';
const FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const CHANNEL_PAGE = 'https://www.youtube.com/@discosraros/videos';
const TTL_MS = 15 * 60 * 1000;
/** Si se está sirviendo la lista de respaldo, volver a probar YouTube más seguido. */
const RETRY_MS = 2 * 60 * 1000;

/** BPM aproximado por género (lo que va entre corchetes en el título). */
const GENRE_BPM: [RegExp, number][] = [
  [/dnb|drum|jungle|breakcore/i, 174],
  [/psy/i, 145],
  [/hard/i, 150],
  [/trance/i, 138],
  [/techno/i, 135],
  [/ukg|garage|2.?step/i, 132],
  [/house|disco/i, 124],
  [/dub|reggae/i, 140],
  [/hip.?hop|rap|trap/i, 90],
  [/rock/i, 120],
  [/cumbia|rkt|reggaeton/i, 95],
];

export function bpmForGenre(genre: string) {
  for (const [re, bpm] of GENRE_BPM) if (re.test(genre)) return bpm;
  return 126;
}

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/**
 * Arma un set a partir de un video, o null si el título no es de un set.
 * Solo entran los "DISCOS RAROS #57 - NO TAN TRANQUI [DNB]": shorts, vivos y demás quedan afuera.
 */
export function toSet(id: string, title: string, published = ''): SetInfo | null {
  const m = /^DISCOS RAROS\s*#\s*(\d+(?:\.\d+)?)(?:\.zip)?\s*[-–]?\s*(.*?)\s*(?:\[([^\]]*)\])?\s*$/i.exec(title.trim());
  if (!m) return null;
  const genre = (m[3] ?? '').trim();
  return {
    id,
    title: title.trim(),
    number: m[1],
    name: (m[2] || genre || title).trim(),
    genre,
    bpm: bpmForGenre(genre),
    published,
    thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    url: `https://www.youtube.com/watch?v=${id}`,
  };
}

export function parseFeed(xml: string): SetInfo[] {
  const out: SetInfo[] = [];
  for (const entry of xml.split('<entry>').slice(1)) {
    const id = /<yt:videoId>([^<]+)/.exec(entry)?.[1];
    const title = decode(/<title>([^<]*)/.exec(entry)?.[1] ?? '');
    const set = id ? toSet(id, title, /<published>([^<]+)/.exec(entry)?.[1] ?? '') : null;
    if (set) out.push(set);
  }
  return out;
}

/** Saca los videos del JSON que viene embebido en la página del canal. */
export function parseChannelPage(html: string): SetInfo[] {
  const out: SetInfo[] = [];
  const seen = new Set<string>();
  for (const part of html.split('"lockupViewModel":').slice(1)) {
    const id = /"contentId":"([\w-]{11})"/.exec(part)?.[1];
    const raw = /"lockupMetadataViewModel":\{"title":\{"content":"((?:[^"\\]|\\.)*)"/.exec(part)?.[1];
    if (!id || !raw || seen.has(id)) continue;
    seen.add(id);
    let title = raw;
    try {
      title = JSON.parse(`"${raw}"`);
    } catch {
      /* se usa tal cual */
    }
    const set = toSet(id, title);
    if (set) out.push(set);
  }
  return out;
}

/**
 * Respaldo: los sets que había al 02/10/2026. Si YouTube no contesta por ningún lado, se
 * muestra esto. Conviene actualizarlo cada tanto (id, título, fecha de publicación).
 */
const SNAPSHOT: [string, string, string][] = [
  ['JCVw93W2nsA', 'DISCOS RAROS #57 - NO TAN TRANQUI [DNB]', '2026-10-02T03:50:17+00:00'],
  ['7BrvtMATa8k', 'DISCOS RAROS #56 - DE NADA SIRVE [PSYTRANCE]', '2026-09-25T00:06:19+00:00'],
  ['byVcjC27sKA', 'DISCOS RAROS #55 - TRES ACORDLES [Drum and bass]', '2026-09-11T04:18:40+00:00'],
  ['lbnc0ZQhp7M', 'DISCOS RAROS #54 - GRACIAS MESSI 2.0 [Drum and bass]', '2026-09-04T00:32:12+00:00'],
  ['2Z-HN8blGCw', 'DISCOS RAROS #53 - GRACIAS Y PERDON [UKG]', '2026-08-28T01:51:20+00:00'],
  ['ruGs7rNkCLs', 'DISCOS RAROS #52 VOLVEMOS ES UNA PREGUNTA PERO WINDOWS NO ME DEJA PONER EL SIGNO ESTE ? [GARAGE]', '2026-08-20T03:14:58+00:00'],
  ['fgy6wDHcogU', 'DISCOS RAROS #51 - LA NOCHE DE VINILOS [MÚSICA]', '2026-01-07T22:58:17+00:00'],
  ['sm2N3SyZgOM', 'DISCOS RAROS #50.zip [todo]', '2025-12-17T11:30:49+00:00'],
  ['wkRAKPvI9gU', 'DISCOS RAROS #50.31 - EL FINAL [GRACIAS]', '2025-11-19T00:00:06+00:00'],
  ['HQ4jykwE3uk', 'DISCOS RAROS #50.30 - ULTIMO ESFUERZO [HOUSE]', '2025-11-11T23:30:13+00:00'],
  ['ian4VKZPnhE', 'DISCOS RAROS #50.29 - FINALMENTE RAROS GANO UN ARAM  [RADIO LOS SANTOS]', '2025-11-07T23:30:30+00:00'],
  ['zOUy0tNb94Q', 'DISCOS RAROS #50.28 - COMPILADO DE ROCK NACIONAL VOL. 1  [ROCK NACIONAL]', '2025-11-04T23:30:31+00:00'],
];
const snapshot = () => SNAPSHOT.map(([id, title, date]) => toSet(id, title, date)).filter((s): s is SetInfo => s !== null);

async function get(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

const fromFeed = async () => parseFeed(await get(FEED, { 'user-agent': 'discosraros.com.ar' }));
const fromPage = async () =>
  parseChannelPage(
    await get(CHANNEL_PAGE, {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'accept-language': 'es-AR,es;q=0.9',
      // Evita la pantalla de consentimiento de cookies (aparece desde servidores en Europa).
      cookie: 'SOCS=CAI; CONSENT=YES+1',
    }),
  );

let cache: { at: number; sets: SetInfo[]; live: boolean } | null = null;

/** Devuelve siempre una lista: la mejor que se pueda conseguir. `source` dice de dónde salió. */
export async function getSets(): Promise<SetInfo[]> {
  if (cache && Date.now() - cache.at < (cache.live ? TTL_MS : RETRY_MS)) return cache.sets;
  for (const [name, source] of [['feed', fromFeed], ['página del canal', fromPage]] as const) {
    try {
      const sets = await source();
      if (!sets.length) throw new Error('lista vacía');
      // La página no trae fechas: se completan con las que ya se conocían.
      const known = new Map([...(cache?.sets ?? []), ...snapshot()].map((s) => [s.id, s.published]));
      for (const s of sets) s.published ||= known.get(s.id) ?? '';
      cache = { at: Date.now(), sets, live: true };
      return sets;
    } catch (e) {
      console.warn(`[sets] falló ${name}:`, (e as Error).message);
    }
  }
  // YouTube no contesta: lo último que se supo, o la lista guardada en el código.
  const sets = cache?.sets.length ? cache.sets : snapshot();
  cache = { at: Date.now(), sets, live: false };
  return sets;
}
