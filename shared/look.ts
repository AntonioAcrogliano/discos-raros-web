/**
 * Opciones del personaje del visitante ("raro"). Lo comparten el creador (cliente), la pista
 * (render) y el servidor (validación). Un look es un índice por cada campo: ocupa nada y no
 * hay forma de mandar algo que no esté en la lista.
 * Ojo: agregar opciones al final de cada lista, nunca en el medio (los guardados usan el índice).
 * Un campo nuevo va al final, con "nada" como primera opción, y se anota en OPTIONAL.
 */
export const LOOK = {
  cuerpo: ['NORMAL', 'FLACO', 'GRANDOTE', 'PETISO', 'LUNGO', 'CABEZON', 'GIGANTE'],
  piel: ['#f0d0b8', '#e8c0a0', '#c89a78', '#9c7358', '#6e4a34', '#7dff6a', '#8fa8ff', '#ff8ad8', '#ffe066', '#c8c8d0', '#b06aff'],
  cara: ['CONTENTO', 'SERIO', 'ENOJADO', 'SORPRENDIDO', 'DORMIDO', 'BIGOTE', 'BARBA', 'LENGUA', 'GUIÑO', 'HIPNOTIZADO', 'PAYASO', 'CHICLE', 'VAMPIRO'],
  pelo: ['CORTO', 'LARGO', 'CRESTA', 'RULOS', 'PELADO', 'FLEQUILLO', 'COLITA', 'RODETES', 'DOS COLITAS', 'AFRO', 'RASTAS', 'PUAS'],
  peloColor: ['#141210', '#3e2a1e', '#6a4a2a', '#c09050', '#d8d8d8', '#ff004a', '#3f49ad', '#028a50', '#ff5ad0', '#00e5ff', '#b6ff00', '#ff8a00', '#9a4dff', '#f9f2e8'],
  arriba: ['REMERA', 'MUSCULOSA', 'BUZO', 'TOP', 'EN CUERO', 'ARNES', 'CHALECO', 'VESTIDO'],
  estampa: ['LISA', 'RAYAS', 'CARITA', 'DISCO', 'CALAVERA', 'BASTONES', 'DAMERO', 'TIE DYE', 'ALIEN', 'HONGO', 'CORAZON', 'RAYO', 'OJO', 'LLAMAS', 'DR'],
  remera: ['#ff004a', '#ffe600', '#016239', '#fee0ea', '#f9f2e8', '#0f1217', '#2f6bb0', '#8a3ab0', '#ff7a3c', '#2ab0b0', '#b6ff00', '#ff5ad0', '#00e5ff', '#9a4dff', '#c8c8d0'],
  abajo: ['LARGO', 'SHORT', 'POLLERA', 'ANCHO', 'TUTU'],
  pantalon: ['#22283a', '#1a1a1a', '#5a6a8a', '#6a4a2a', '#f9f2e8', '#7a0024', '#b6ff00', '#ff5ad0', '#c8c8d0', '#ff7a3c', '#8a3ab0', '#00e5ff'],
  zapas: ['#f9f2e8', '#0f1217', '#ff004a', '#ffe600', '#2f6bb0', '#b6ff00', '#ff5ad0', '#00e5ff', '#9a4dff', '#6a4a2a'],
  accesorio: ['NADA', 'GORRA', 'PILUSO', 'LENTES', 'CUERNOS', 'AUREOLA', 'CAJA EN LA CABEZA', 'GORRO DE LANA', 'ANTENITAS', 'OREJITAS', 'AURICULARES', 'CORONA', 'VINCHA', 'CONO', 'CASCO', 'OREJAS DE ELFA'],
  baile: ['SALTITO', 'MANOS ARRIBA', 'PUÑO', 'ROBOT', 'CABECEO', 'SHUFFLE', 'PASITO', 'MOLINO', 'TWIST', 'AVIONCITO', 'POGO', 'HELICOPTERO', 'SENTADILLA', 'TIESO', 'ZOMBIE', 'TRAVOLTA'],
  // De acá para abajo, campos que se agregaron después: la primera opción es "como estaba antes".
  anteojos: ['NADA', 'OSCUROS', 'RAVE', '3D', 'CORAZONES', 'ANTIPARRAS'],
  boca: ['NADA', 'CHUPETE', 'SILBATO', 'BARBIJO', 'CHUPETIN'],
  encima: ['NADA', 'CADENA', 'RIÑONERA', 'MOCHILA', 'ALAS', 'CAPA', 'ALAS DE ANGEL'],
  mano: ['NADA', 'PALITOS DE LUZ', 'ABANICO', 'AGUA', 'PULSERAS', 'GUANTES'],
  calzado: ['ZAPAS', 'PLATAFORMAS', 'BOTAS', 'DESCALZO'],
  neon: ['#ff004a', '#ffe600', '#b6ff00', '#00e5ff', '#ff5ad0', '#9a4dff', '#ff8a00', '#f9f2e8', '#0f1217', '#016239'],
  // Color de las alas de ángel (las de hada van con el color de los accesorios). La primera: blancas, como eran.
  alas: ['#f9f2e8', '#0f1217', '#ff004a', '#ffe600', '#ff5ad0', '#00e5ff', '#b6ff00', '#9a4dff', '#ff8a00', '#c8c8d0'],
} as const;

export type LookKey = keyof typeof LOOK;
export type Look = Record<LookKey, number>;
export const LOOK_KEYS = Object.keys(LOOK) as LookKey[];

/** Campos nuevos: un guardado viejo que no los trae vale igual (queda en la primera opción). */
const OPTIONAL: ReadonlySet<LookKey> = new Set<LookKey>(['anteojos', 'boca', 'encima', 'mano', 'calzado', 'neon', 'alas']);

/** Campos que solo se ofrecen en el menú con cierta opción de otro campo puesta: [campo, opción]. */
export const LOOK_NEEDS: Partial<Record<LookKey, readonly [LookKey, number]>> = {
  // El color de las alas, solo con las ALAS DE ANGEL.
  alas: ['encima', 6],
};

/** Opciones que ya no se ofrecen en el menú (se siguen dibujando para quien las tenga guardadas). */
export const LOOK_HIDDEN: Partial<Record<LookKey, readonly number[]>> = {
  // Los lentes pasaron a ANTEOJOS, así se pueden combinar con un gorro.
  accesorio: [3],
};

/** Nombre del campo como se muestra en el menú. */
export const LOOK_LABELS: Record<LookKey, string> = {
  cuerpo: 'CUERPO',
  piel: 'PIEL',
  cara: 'CARA',
  pelo: 'PELO',
  peloColor: 'COLOR DE PELO',
  arriba: 'PRENDA',
  estampa: 'ESTAMPA',
  remera: 'COLOR',
  abajo: 'PRENDA',
  pantalon: 'COLOR',
  zapas: 'COLOR DEL CALZADO',
  accesorio: 'EN LA CABEZA',
  baile: 'PASO DE BAILE',
  anteojos: 'ANTEOJOS',
  boca: 'EN LA BOCA',
  encima: 'COLGADO',
  mano: 'EN LAS MANOS',
  calzado: 'CALZADO',
  neon: 'COLOR DE LOS ACCESORIOS',
  alas: 'COLOR DE LAS ALAS',
};

export type LookView = 'todo' | 'cabeza' | 'piernas';

/** Pestañas del menú de personalización. `view` es a dónde mira la cámara mientras se elige. */
export const LOOK_GROUPS: { name: string; view: LookView; keys: LookKey[] }[] = [
  { name: 'CUERPO', view: 'todo', keys: ['cuerpo', 'piel', 'cara'] },
  { name: 'CABEZA', view: 'cabeza', keys: ['pelo', 'peloColor', 'accesorio', 'anteojos', 'boca'] },
  { name: 'ARRIBA', view: 'todo', keys: ['arriba', 'remera', 'estampa'] },
  { name: 'ABAJO', view: 'piernas', keys: ['abajo', 'pantalon', 'calzado', 'zapas'] },
  { name: 'EXTRAS', view: 'todo', keys: ['encima', 'alas', 'mano', 'neon'] },
  { name: 'BAILE', view: 'todo', keys: ['baile'] },
];

/** Devuelve el look limpio, o null si trae algo fuera de las listas. */
export function validLook(x: unknown): Look | null {
  if (!x || typeof x !== 'object') return null;
  const out = {} as Look;
  for (const k of LOOK_KEYS) {
    const v = (x as Record<string, unknown>)[k] ?? (OPTIONAL.has(k) ? 0 : undefined);
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= LOOK[k].length) return null;
    out[k] = v;
  }
  return out;
}

export function randomLook(rnd: () => number = Math.random): Look {
  const out = {} as Look;
  for (const k of LOOK_KEYS) {
    do out[k] = Math.floor(rnd() * LOOK[k].length);
    while (LOOK_HIDDEN[k]?.includes(out[k]));
  }
  // Que la mayoría no tenga de todo ni piel de alien: si no, la pista es un carnaval.
  if (rnd() < 0.55) out.accesorio = 0;
  if (rnd() < 0.7) out.anteojos = 0;
  if (rnd() < 0.85) out.boca = 0;
  if (rnd() < 0.7) out.encima = 0;
  if (rnd() < 0.65) out.mano = 0;
  if (rnd() < 0.6) out.calzado = 0;
  if (rnd() < 0.5) out.alas = 0;
  if (rnd() < 0.85) out.piel = Math.floor(rnd() * 5);
  if (rnd() < 0.8) out.cuerpo = Math.floor(rnd() * 5);
  return out;
}

export const NAME_MAX = 12;

const BLOCKED = ['PUTO', 'PUTA', 'TROLO', 'TROLA', 'NAZI', 'HITLER', 'VIOLA', 'PEDOFIL', 'NEGRO DE M', 'MOGOLIC', 'RETRASAD', 'SIDOSO', 'MARICON', 'JUDIO DE M', 'CONCHA', 'PIJA', 'VERGA', 'NIGGER', 'NIGGA', 'FAGGOT'];

/** La frase que dice un raro cuando lo tocan. */
export const PHRASE_MAX = 40;

/**
 * ¿Tiene algún insulto de la lista? Compara sin tildes ni separadores, y con los números que se
 * usan como letras. Con `glued` también junta las palabras (P U T O); en una frase larga eso
 * daría falsos positivos entre palabra y palabra, así que ahí no se usa.
 */
function blocked(s: string, glued = true) {
  const flat = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/0/g, 'O').replace(/1/g, 'I').replace(/3/g, 'E').replace(/4/g, 'A').replace(/5/g, 'S')
    .replace(/[^A-Z ]/g, '');
  const tight = flat.replace(/ /g, '');
  return BLOCKED.some((w) => flat.includes(w) || (glued && tight.includes(w.replace(/ /g, ''))));
}

/**
 * La frase del raro: mayúsculas y sin símbolos raros, como el nombre. Es opcional: devuelve ''
 * si no puso nada, y null si es un insulto.
 */
export function cleanPhrase(raw: unknown): string | null {
  if (raw === undefined || raw === null) return '';
  if (typeof raw !== 'string') return null;
  const s = raw
    .toLocaleUpperCase('es')
    .replace(/[^A-Z0-9ÑÁÉÍÓÚÜ _\-!?.,¿¡]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PHRASE_MAX)
    .trim();
  return blocked(s, false) ? null : s;
}

/** Lo más largo que puede ser un mensaje del chat. */
export const CHAT_MAX = 120;

/**
 * Un mensaje del chat: como la frase (mayúsculas, sin símbolos raros: así tampoco entran links),
 * pero más largo. Devuelve null si queda vacío o es un insulto.
 */
export function cleanChat(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw
    .toLocaleUpperCase('es')
    .replace(/[^A-Z0-9ÑÁÉÍÓÚÜ _\-!?.,¿¡]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHAT_MAX)
    .trim();
  if (!s) return null;
  return blocked(s, false) ? null : s;
}

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
  return blocked(s) ? null : s;
}

/** Un personaje guardado, como viaja entre el servidor y la pista. */
export interface Raro {
  id: string;
  name: string;
  look: Look;
  /** Lo que dice cuando lo tocan en la pista ('' o nada = no dice nada). */
  phrase?: string;
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
