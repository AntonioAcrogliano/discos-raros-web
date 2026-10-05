/**
 * Opciones del personaje del visitante ("raro"). Lo comparten el creador (cliente), la pista
 * (render) y el servidor (validación). Un look es un índice por cada campo: ocupa nada y no
 * hay forma de mandar algo que no esté en la lista.
 * Ojo: agregar opciones al final de cada lista, nunca en el medio (los guardados usan el índice).
 */
export const LOOK = {
  cuerpo: ['NORMAL', 'FLACO', 'GRANDOTE', 'PETISO', 'LUNGO'],
  piel: ['#f0d0b8', '#e8c0a0', '#c89a78', '#9c7358', '#6e4a34', '#7dff6a', '#8fa8ff'],
  pelo: ['CORTO', 'LARGO', 'CRESTA', 'RULOS', 'PELADO'],
  peloColor: ['#141210', '#3e2a1e', '#6a4a2a', '#c09050', '#d8d8d8', '#ff004a', '#3f49ad', '#028a50'],
  remera: ['#ff004a', '#ffe600', '#016239', '#fee0ea', '#f9f2e8', '#0f1217', '#2f6bb0', '#8a3ab0', '#ff7a3c', '#2ab0b0'],
  pantalon: ['#22283a', '#1a1a1a', '#5a6a8a', '#6a4a2a', '#f9f2e8', '#7a0024'],
  accesorio: ['NADA', 'GORRA', 'PILUSO', 'LENTES', 'CUERNOS', 'AUREOLA', 'CAJA EN LA CABEZA'],
  baile: ['SALTITO', 'MANOS ARRIBA', 'PUÑO', 'ROBOT', 'CABECEO'],
} as const;

export type LookKey = keyof typeof LOOK;
export type Look = Record<LookKey, number>;
export const LOOK_KEYS = Object.keys(LOOK) as LookKey[];

/** Nombre del campo como se muestra en el menú. */
export const LOOK_LABELS: Record<LookKey, string> = {
  cuerpo: 'CUERPO',
  piel: 'PIEL',
  pelo: 'PELO',
  peloColor: 'COLOR DE PELO',
  remera: 'REMERA',
  pantalon: 'PANTALÓN',
  accesorio: 'ACCESORIO',
  baile: 'BAILE',
};

/** Devuelve el look limpio, o null si trae algo fuera de las listas. */
export function validLook(x: unknown): Look | null {
  if (!x || typeof x !== 'object') return null;
  const out = {} as Look;
  for (const k of LOOK_KEYS) {
    const v = (x as Record<string, unknown>)[k];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= LOOK[k].length) return null;
    out[k] = v;
  }
  return out;
}

export function randomLook(rnd: () => number = Math.random): Look {
  const out = {} as Look;
  for (const k of LOOK_KEYS) out[k] = Math.floor(rnd() * LOOK[k].length);
  // Que la mayoría no tenga accesorio ni piel de alien: si no, la pista es un carnaval.
  if (rnd() < 0.55) out.accesorio = 0;
  if (rnd() < 0.85) out.piel = Math.floor(rnd() * 5);
  return out;
}

export const NAME_MAX = 12;

const BLOCKED = ['PUTO', 'PUTA', 'TROLO', 'TROLA', 'NAZI', 'HITLER', 'VIOLA', 'PEDOFIL', 'NEGRO DE M', 'MOGOLIC', 'RETRASAD', 'SIDOSO', 'MARICON', 'JUDIO DE M', 'CONCHA', 'PIJA', 'VERGA', 'NIGGER', 'NIGGA', 'FAGGOT'];

/** Nombre visible: mayúsculas, sin símbolos raros. Devuelve null si queda vacío o es un insulto. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw
    .toLocaleUpperCase('es')
    .replace(/[^A-Z0-9ÑÁÉÍÓÚÜ _\-!?.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
  if (!s) return null;
  // Comparar sin tildes ni separadores, y con los números que se usan como letras.
  const flat = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/0/g, 'O').replace(/1/g, 'I').replace(/3/g, 'E').replace(/4/g, 'A').replace(/5/g, 'S')
    .replace(/[^A-Z ]/g, '');
  const tight = flat.replace(/ /g, '');
  if (BLOCKED.some((w) => flat.includes(w) || tight.includes(w.replace(/ /g, '')))) return null;
  return s;
}

/** Un personaje guardado, como viaja entre el servidor y la pista. */
export interface Raro {
  id: string;
  name: string;
  look: Look;
}

export interface SetInfo {
  id: string;
  /** Título completo de YouTube. */
  title: string;
  /** "57", "50.31"… */
  number: string;
  /** "NO TAN TRANQUI" */
  name: string;
  /** "DNB", "PSYTRANCE"… tal cual lo escribieron. */
  genre: string;
  /** BPM aproximado según el género (YouTube no deja leer el audio). */
  bpm: number;
  published: string;
  thumb: string;
  url: string;
}
