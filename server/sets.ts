import type { SetInfo } from '../shared/look.js';

/** Canal @discosraros. El feed RSS público trae los últimos 15 videos y no pide clave de API. */
const CHANNEL_ID = 'UCOStJ214QjXlm_XHeqfT2JQ';
const FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const TTL_MS = 15 * 60 * 1000;

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

export function parseFeed(xml: string): SetInfo[] {
  const out: SetInfo[] = [];
  for (const entry of xml.split('<entry>').slice(1)) {
    const id = /<yt:videoId>([^<]+)/.exec(entry)?.[1];
    const title = decode(/<title>([^<]*)/.exec(entry)?.[1] ?? '').trim();
    const published = /<published>([^<]+)/.exec(entry)?.[1] ?? '';
    // Solo los sets: "DISCOS RAROS #57 - NO TAN TRANQUI [DNB]". Shorts, vivos y demás quedan afuera.
    const m = /^DISCOS RAROS\s*#\s*(\d+(?:\.\d+)?)(?:\.zip)?\s*[-–]?\s*(.*?)\s*(?:\[([^\]]*)\])?\s*$/i.exec(title);
    if (!id || !m) continue;
    const genre = (m[3] ?? '').trim();
    out.push({
      id,
      title,
      number: m[1],
      name: (m[2] || genre || title).trim(),
      genre,
      bpm: bpmForGenre(genre),
      published,
      thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${id}`,
    });
  }
  return out;
}

let cache: { at: number; sets: SetInfo[] } | null = null;

export async function getSets(): Promise<SetInfo[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.sets;
  try {
    const res = await fetch(FEED, { headers: { 'user-agent': 'discosraros.com.ar' } });
    if (!res.ok) throw new Error(`feed ${res.status}`);
    const sets = parseFeed(await res.text());
    if (sets.length) cache = { at: Date.now(), sets };
    return sets.length ? sets : (cache?.sets ?? []);
  } catch (e) {
    // Si YouTube no contesta, mejor lo último que se supo que nada.
    if (cache) return cache.sets;
    throw e;
  }
}
