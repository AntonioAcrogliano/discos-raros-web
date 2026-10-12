import { DR, FONT, blip, fitSize, outlined } from '../style-kit';
import { PadEdges } from './gamepad';
import { layerPoint } from './touch';

/**
 * Interfaz compartida por los juegos (pelea y cabezazos), dibujada en la capa de textos:
 * ventanas con borde, oscurecido con tramado, pantalla de selección, menú de pausa y la
 * lista de controles. Así los dos juegos se ven y se manejan igual.
 */

/**
 * Una línea de la ventana de controles. Con `keys` / `pad` es una acción: se dibuja cada tecla
 * y cada botón del joystick como una tecla de verdad ('+', ',' y 'O' quedan como texto suelto).
 * En `pad`, '@LR', '@UP' y '@DOWN' dibujan el stick movido para ese lado.
 * Con `note` sola es un truco: el nombre y cómo se hace, a todo el ancho.
 */
export interface Control {
  action: string;
  keys?: string[];
  pad?: string[];
  note?: string;
}

const GRIS = '#5a5666';

/** En el celular los carteles hablan de tocar la pantalla en vez de teclas. Lo prende cada juego al arrancar. */
export const hudTouch = { on: false };

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Ventana estilo menú de PS1: fondo liso, borde claro y sombra dura. */
export function frame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, border: string = DR.crema, fill: string = DR.negro) {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  ctx.fillStyle = '#000000';
  ctx.fillRect(x + 3, y + 3, w, h);
  ctx.fillStyle = border;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
}

let pattern: CanvasPattern | null = null;
/** Oscurece con tramado (un píxel sí, uno no) todo menos los `holes`, por donde se ve la escena. */
export function dim(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, holes: Rect[] = []) {
  if (!pattern) {
    const c = document.createElement('canvas');
    c.width = c.height = 2;
    const g = c.getContext('2d')!;
    g.fillStyle = DR.negro;
    g.fillRect(0, 0, 1, 1);
    g.fillRect(1, 1, 1, 1);
    pattern = ctx.createPattern(c, 'repeat');
  }
  ctx.fillStyle = pattern!;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  for (const r of holes) ctx.clearRect(Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h));
}

/** Franja de arriba para el marcador: tramado oscuro con una línea abajo. */
export function topBand(ctx: CanvasRenderingContext2D, w: number, height: number) {
  dim(ctx, 0, 0, w, height);
  ctx.fillStyle = DR.negro;
  ctx.fillRect(0, Math.round(height), w, 2);
}

/** Texto simple (sin borde) para adentro de las ventanas. */
function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left') {
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(s, Math.round(x), Math.round(y));
}

const SEPARATORS = new Set(['+', ',', 'O', '/']);
/** Botones de la derecha del joystick, con sus colores. */
const PAD_COLORS: Record<string, string> = { A: DR.verdeClaro, B: DR.rojo, X: DR.rosa, Y: DR.amarillo };
/** Ancho de una tecla, en letras (la tecla lleva media letra de aire de cada lado). */
const tokenChars = (t: string) => (t[0] === '@' ? (t === '@LR' ? 3.9 : 3) : SEPARATORS.has(t) ? t.length : t.length + 1);

/** Dibujito del stick: la base, la perilla corrida hacia donde se mueve y las flechitas al costado. */
function stick(ctx: CanvasRenderingContext2D, dir: string, x: number, cy: number, w: number, size: number) {
  const r = Math.floor((size + 4) / 2), a = Math.max(3, Math.round(size * 0.5));
  const disc = (cx: number, y: number, rad: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, y, rad, 0, Math.PI * 2);
    ctx.fill();
  };
  /** Flechita: punta en (tx, ty), apuntando hacia (dx, dy). */
  const arrow = (tx: number, ty: number, dx: number, dy: number) => {
    ctx.fillStyle = DR.amarillo;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - dx * a - dy * a, ty - dy * a - dx * a);
    ctx.lineTo(tx - dx * a + dy * a, ty - dy * a + dx * a);
    ctx.fill();
  };
  const lr = dir === '@LR', up = dir === '@UP';
  // Con las flechas a los dos lados la base va al medio; si no, a la izquierda con la flecha al lado.
  const cx = Math.round(lr ? x + w / 2 : x + r + 1);
  cy = Math.round(cy);
  disc(cx + 1, cy + 2, r, '#000000');
  disc(cx, cy, r, GRIS);
  disc(cx, cy, r - 1.5, '#2a2633');
  const off = Math.max(2, Math.round(r * 0.5));
  disc(cx, cy + (lr ? 0 : up ? -off : off), Math.max(2, r * 0.5), DR.crema);
  if (lr) {
    arrow(cx - r - a - 2, cy, -1, 0);
    arrow(cx + r + a + 2, cy, 1, 0);
  } else arrow(cx + r + a + 2, cy + (up ? -a / 2 : a / 2), 0, up ? -1 : 1);
}

const rowChars = (ts: string[] = []) => ts.reduce((n, t) => n + tokenChars(t), 0) + Math.max(0, ts.length - 1) * 0.4;

/** Dibuja una fila de teclas (o de botones del joystick) desde `x`, centradas en `cy`. */
function keycaps(ctx: CanvasRenderingContext2D, tokens: string[], x: number, cy: number, size: number, pad: boolean) {
  for (const t of tokens) {
    const tw = Math.round(tokenChars(t) * size);
    const x0 = Math.round(x);
    if (t[0] === '@') stick(ctx, t, x0, cy, tw, size);
    else if (SEPARATORS.has(t)) text(ctx, t, x0 + tw / 2, cy, size, DR.rosa, 'center');
    else {
      const hh = size + 4, top = Math.round(cy - hh / 2);
      const face = pad ? PAD_COLORS[t] : undefined;
      ctx.fillStyle = '#000000';
      ctx.fillRect(x0 + 1, top + 2, tw, hh);
      ctx.fillStyle = pad ? (face ?? GRIS) : DR.crema;
      ctx.fillRect(x0, top, tw, hh);
      // El canto de abajo más oscuro: parece una tecla con relieve.
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x0, top + hh - 2, tw, 2);
      text(ctx, t, x0 + tw / 2, cy, size, pad && !face ? DR.crema : DR.negro, 'center');
    }
    x += tw + size * 0.4;
  }
}

/**
 * Ventana de controles: una tabla con la acción, las teclas y los botones del joystick, y
 * abajo los trucos. Devuelve el alto. Con `maxH` aprieta las filas para que entre.
 */
export function controlsBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, unit: number, controls: Control[], title = 'CONTROLES', maxH = 0) {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  const pad = Math.round(unit * 0.6);
  const actions = controls.filter((c) => c.keys || c.pad), tips = controls.filter((c) => !c.keys && !c.pad);
  const actW = Math.max(6, ...actions.map((c) => c.action.length));
  const keyW = Math.max(7, ...actions.map((c) => rowChars(c.keys))), padW = Math.max(8, ...actions.map((c) => rowChars(c.pad)));
  const tipW = Math.max(0, ...tips.map((c) => c.action.length + 1 + (c.note?.length ?? 0)));
  const chars = Math.max(actW + 1.5 + keyW + 1.5 + padW, tipW);
  const size = Math.max(6, Math.min(Math.floor(unit * 0.75), Math.floor((w - pad * 2) / chars)));
  const head = Math.round(unit * 1.5), cols = Math.round(size * 1.9), gapTips = tips.length ? 4 : 0;
  let row = Math.round(size * 2.2);
  if (maxH) row = Math.max(size + 5, Math.min(row, Math.floor((maxH - head - cols - gapTips - pad) / controls.length)));
  const h = head + cols + controls.length * row + gapTips + pad;
  frame(ctx, x, y, w, h);
  // Barra del título, como las ventanas del sitio.
  ctx.fillStyle = DR.rojo;
  ctx.fillRect(x + 2, y + 2, w - 4, head - 2);
  text(ctx, title, x + w / 2, y + 1 + head / 2, Math.min(unit, Math.round(size * 1.3)), DR.crema, 'center');

  const x0 = x + pad, spare = Math.max(0, w - pad * 2 - (actW + keyW + padW) * size);
  const kx = Math.round(x0 + actW * size + spare / 2), px = Math.round(kx + keyW * size + spare / 2);
  const hy = y + head + cols / 2;
  text(ctx, 'TECLADO', kx, hy, size, DR.rosa);
  text(ctx, 'JOYSTICK', px, hy, size, DR.rosa);
  ctx.fillStyle = GRIS;
  ctx.fillRect(x0, y + head + cols - 2, w - pad * 2, 1);

  let ry = y + head + cols;
  [...actions, ...tips].forEach((c, i) => {
    const tip = i >= actions.length;
    if (tip && i === actions.length) {
      ctx.fillStyle = GRIS;
      ctx.fillRect(x0, ry + 1, w - pad * 2, 1);
      ry += gapTips;
    }
    if (i % 2 === 0) {
      ctx.fillStyle = '#1c1826';
      ctx.fillRect(x + 2, ry, w - 4, row);
    }
    const cy = ry + row / 2;
    if (tip) {
      text(ctx, c.action, x0, cy, size, DR.amarillo);
      text(ctx, c.note ?? '', x0 + (c.action.length + 1) * size, cy, size, DR.rosa);
    } else {
      text(ctx, c.action, x0, cy, size, DR.crema);
      keycaps(ctx, c.keys ?? [], kx, cy, size, false);
      keycaps(ctx, c.pad ?? [], px, cy, size, true);
    }
    ry += row;
  });
  return h;
}

export interface SelectView {
  title: string;
  prompt: string;
  /** Nombre de cada uno y dónde está parado en la pantalla (0–1 a lo ancho). */
  players: { name: string; cx: number }[];
  /** Con cuál juega el visitante. */
  me: number;
  difficulty: number;
  difficulties: string[];
  controls: Control[];
  /** De dónde a dónde van las ventanas de los personajes (0–1 a lo alto). */
  cardTop: number;
  cardBottom: number;
  /** Texto del Enter ("PELEAR", "JUGAR"). */
  go: string;
  /** ¿Hay un joystick a la vista? */
  pad: boolean;
}

/** Alto del pie de ayuda de los menús. */
const footH = (u: number) => Math.round(u * 1.9);

/** Dónde va cada cosa de la pantalla de selección (lo usan el dibujo y los clics). */
function selectLayout(w: number, h: number, v: SelectView) {
  const u = Math.max(6, Math.round((Math.min(w, h) / 240) * 8));
  const cw = Math.round(Math.min(w * 0.24, u * 13));
  const y0 = Math.round(h * v.cardTop), y1 = Math.round(h * v.cardBottom);
  const cards: Rect[] = v.players.map((p) => ({ x: Math.round(Math.max(u * 0.5, Math.min(w - cw - u * 0.5, p.cx * w - cw / 2))), y: y0, w: cw, h: y1 - y0 }));
  // Columna del medio: dificultad y controles.
  const left = Math.min(...cards.map((c) => c.x + c.w)) + u, right = Math.max(...cards.map((c) => c.x)) - u;
  const mx = Math.round(right - left >= u * 12 ? left : w / 2 - u * 9);
  const mw = Math.round(right - left >= u * 12 ? right - left : u * 18);
  // Flechas de la dificultad: dos botones a los costados del texto.
  const ab = Math.round(u * 1.7), ay = Math.round(y0 + u * 2.3 - ab / 2);
  const prev: Rect = { x: mx + Math.round(u * 0.5), y: ay, w: ab, h: ab };
  const next: Rect = { x: mx + mw - Math.round(u * 0.5) - ab, y: ay, w: ab, h: ab };
  // En el celular, en lugar de la ventana de controles hay un botón grande para arrancar.
  const top = y0 + u * 4.4;
  const go: Rect = { x: mx, y: top, w: mw, h: Math.min(u * 4, h - footH(u) - u - top) };
  return { u, cards, y0, mx, mw, prev, next, go };
}

/** Qué se tocó con el mouse en la pantalla de selección. */
export type SelectHit = { player: number } | { difficulty: number } | { go: true } | null;

export function selectHit(w: number, h: number, v: SelectView, px: number, py: number): SelectHit {
  const l = selectLayout(w, h, v);
  // Con un poco de margen: los botones son chicos.
  const inside = (r: Rect, m = 0) => px >= r.x - m && px < r.x + r.w + m && py >= r.y - m && py < r.y + r.h + m;
  if (inside(l.prev, 4)) return { difficulty: -1 };
  if (inside(l.next, 4)) return { difficulty: 1 };
  if (hudTouch.on && inside(l.go)) return { go: true };
  const player = l.cards.findIndex((c) => inside({ ...c, h: c.h + l.u * 2.6 }));
  return player >= 0 ? { player } : null;
}

/**
 * Escucha los clics sobre la pantalla de selección (flechas de dificultad y personajes).
 * `view` devuelve lo que se está mostrando, o null fuera de esa pantalla. Devuelve cómo apagarlo.
 */
export function selectClicks(layer: HTMLCanvasElement, view: () => SelectView | null, on: (hit: NonNullable<SelectHit>) => void) {
  const at = (e: PointerEvent) => {
    const v = view();
    if (!v) return null;
    const p = layerPoint(layer, e);
    return selectHit(layer.width, layer.height, v, p.x, p.y);
  };
  const down = (e: PointerEvent) => {
    const hit = at(e);
    if (hit) on(hit);
  };
  const move = (e: PointerEvent) => (document.body.style.cursor = at(e) ? 'pointer' : '');
  window.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move);
  return () => {
    window.removeEventListener('pointerdown', down);
    window.removeEventListener('pointermove', move);
    document.body.style.cursor = '';
  };
}

/** Pantalla de selección: una ventana por personaje (se lo ve en 3D adentro), dificultad y controles al medio. */
export function drawSelect(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, v: SelectView) {
  const { u, cards, y0, mx, mw, prev, next, go } = selectLayout(w, h, v);
  const touch = hudTouch.on;
  const blink = Math.floor(t * 4) % 2 === 0;
  dim(ctx, 0, 0, w, h, cards.map((c) => ({ x: c.x + 3, y: c.y + 3, w: c.w - 6, h: c.h - 6 })));

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  outlined(ctx, v.title, w / 2, u * 2.3, fitSize(v.title, u * 2, w), DR.amarillo, DR.rojo);
  outlined(ctx, v.prompt, w / 2, u * 4.5, fitSize(v.prompt, u, w), DR.crema);
  // El navegador muestra el joystick recién cuando se le aprieta un botón.
  const padMsg = v.pad ? 'JOYSTICK CONECTADO' : 'JOYSTICK: APRETA UN BOTON PARA ACTIVARLO';
  if (!touch) outlined(ctx, padMsg, w / 2, u * 6, fitSize(padMsg, Math.round(u * 0.6), w), v.pad ? DR.verdeClaro : GRIS);

  cards.forEach((c, i) => {
    const on = i === v.me;
    const color = on ? (blink ? DR.amarillo : DR.rojo) : GRIS;
    // Marco de la ventana (el interior queda libre: ahí se ve al personaje).
    ctx.fillStyle = color;
    const b = on ? 3 : 2;
    ctx.fillRect(c.x, c.y, c.w, b);
    ctx.fillRect(c.x, c.y + c.h - b, c.w, b);
    ctx.fillRect(c.x, c.y, b, c.h);
    ctx.fillRect(c.x + c.w - b, c.y, b, c.h);
    // Etiqueta: quién lo maneja.
    const tag = on ? '1P' : 'CPU';
    const tw = (tag.length + 1) * u;
    ctx.fillStyle = on ? DR.amarillo : GRIS;
    ctx.fillRect(c.x, c.y, tw, Math.round(u * 1.6));
    text(ctx, tag, c.x + tw / 2, c.y + u * 0.85, u, DR.negro, 'center');
    // Nombre abajo.
    frame(ctx, c.x, c.y + c.h + u * 0.4, c.w, u * 2.2, on ? DR.amarillo : GRIS);
    text(ctx, v.players[i].name, c.x + c.w / 2, c.y + c.h + u * 1.55, fitSize(v.players[i].name, Math.round(u * 1.2), c.w), on ? DR.amarillo : DR.rosa, 'center');
  });

  frame(ctx, mx, y0, mw, u * 3.6);
  text(ctx, 'DIFICULTAD', mx + mw / 2, y0 + u * 0.95, Math.round(u * 0.7), DR.rosa, 'center');
  const diffColor = [DR.verdeClaro, DR.amarillo, DR.rojo][v.difficulty] ?? DR.crema;
  text(ctx, v.difficulties[v.difficulty], mx + mw / 2, y0 + u * 2.3, u, diffColor, 'center');
  // Flechas: botones que se pueden tocar con el mouse (apagados cuando no hay más para ese lado).
  const arrow = (r: Rect, s: string, live: boolean) => {
    frame(ctx, r.x, r.y, r.w, r.h, live ? DR.crema : GRIS, live ? DR.verde : DR.negro);
    text(ctx, s, r.x + r.w / 2, r.y + r.h / 2 + 1, u, live ? DR.amarillo : GRIS, 'center');
  };
  arrow(prev, '<', v.difficulty > 0);
  arrow(next, '>', v.difficulty < v.difficulties.length - 1);

  // Pie: cómo se maneja este menú (con joystick se alterna con sus botones).
  const fh = footH(u);
  let help: string;
  if (touch) {
    frame(ctx, go.x, go.y, go.w, go.h, blink ? DR.amarillo : DR.crema, DR.rojo);
    text(ctx, v.go, go.x + go.w / 2, go.y + go.h / 2 + 1, fitSize(v.go, Math.round(u * 1.6), go.w), DR.crema, 'center');
    help = `TOCA TU JUGADOR Y LA DIFICULTAD, Y DESPUES ${v.go}`;
  } else {
    const top = y0 + u * 4.2;
    controlsBox(ctx, mx, top, mw, u, v.controls, 'CONTROLES', h - fh - u - top);
    const keys = `IZQ/DER: ELEGIR   ARRIBA/ABAJO O CLIC EN < >: DIFICULTAD   ENTER: ${v.go}   ESC: SALIR`;
    const pad = `JOYSTICK   STICK A LOS LADOS: ELEGIR   STICK ARRIBA/ABAJO: DIFICULTAD   A O START: ${v.go}`;
    help = v.pad && Math.floor(t / 3) % 2 ? pad : keys;
  }
  frame(ctx, u * 0.5, h - fh - u * 0.5, w - u, fh);
  text(ctx, help, w / 2, h - u * 0.5 - fh / 2, fitSize(help, Math.round(u * 0.75), w - u * 2), blink ? DR.crema : DR.amarillo, 'center');
}

/** Cartel grande centrado, agrandado desde el medio (ROUND 1, K.O., GOL…). */
export function banner(ctx: CanvasRenderingContext2D, w: number, y: number, s: string, size: number, scale: number, fill: string | CanvasGradient, shadow?: string) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.translate(Math.round(w / 2), Math.round(y));
  ctx.scale(scale, scale);
  outlined(ctx, s, 0, 0, size, fill, shadow);
  ctx.restore();
}

/** Ventana de resultado al final: título, renglones y la cuenta para salir. */
export function resultBox(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, o: { title: string; color: string; lines: string[]; seconds: number }) {
  const u = Math.max(6, Math.round((Math.min(w, h) / 240) * 8));
  dim(ctx, 0, 0, w, h);
  const bw = Math.min(w - u * 2, u * 30), bh = u * (9 + o.lines.length * 1.6);
  const x = (w - bw) / 2, y = (h - bh) / 2;
  frame(ctx, x, y, bw, bh, o.color);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  outlined(ctx, o.title, w / 2, y + u * 2.4 + Math.round(Math.sin(t * 6) * 2), fitSize(o.title, u * 2, bw), o.color, DR.rojoOscuro);
  o.lines.forEach((l, i) => text(ctx, l, w / 2, y + u * (4.8 + i * 1.6), fitSize(l, u, bw - u * 2), DR.crema, 'center'));
  const yy = y + bh - u * 3;
  const again = hudTouch.on ? 'TOCA LA PANTALLA: REVANCHA' : 'ENTER O START: REVANCHA';
  text(ctx, again, w / 2, yy, fitSize(again, u, bw - u * 2), Math.floor(t * 3) % 2 ? DR.amarillo : DR.crema, 'center');
  text(ctx, `${hudTouch.on ? 'BOTON SALIR' : 'ESC: SALIR'} (${Math.max(0, Math.ceil(o.seconds))})`, w / 2, yy + u * 1.6, Math.round(u * 0.75), DR.rosa, 'center');
}

const PAUSE_OPTIONS = ['SEGUIR', 'REINICIAR', 'SALIR'] as const;

/**
 * Menú de pausa. Esc lo abre en medio de una partida (en vez de sacarte del juego de una);
 * fuera de la partida, Esc sale directo. Mientras está abierto se queda con el teclado.
 */
export class PauseMenu {
  open = false;
  /** El joystick se usó para el menú en este frame: el juego no tiene que leer esos botones. */
  busy = false;
  private index = 0;
  private pad = new PadEdges();
  /** Dónde quedó dibujada cada opción (para tocarlas con el dedo o el mouse). */
  private rects: Rect[] = [];

  /** @param o.layer la capa de textos: con ella las opciones se pueden tocar. */
  constructor(private o: { canPause(): boolean; onRestart(): void; onExit(): void; layer?: HTMLCanvasElement }) {
    // En la fase de captura: llega antes que los controles del juego.
    window.addEventListener('keydown', this.key, true);
    window.addEventListener('pointerdown', this.tap);
  }

  dispose() {
    window.removeEventListener('keydown', this.key, true);
    window.removeEventListener('pointerdown', this.tap);
  }

  /** Pausar ya, si se puede (el celular se giró, se fue el foco…). */
  pauseNow() {
    if (this.open || !this.o.canPause()) return;
    this.open = true;
    this.index = 0;
  }

  private tap = (e: PointerEvent) => {
    const layer = this.o.layer;
    if (!this.open || !layer) return;
    const { x, y } = layerPoint(layer, e);
    const i = this.rects.findIndex((q) => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h);
    if (i < 0) return;
    this.index = i;
    this.choose();
  };

  private key = (e: KeyboardEvent) => {
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (this.open) this.open = false;
      else if (this.o.canPause()) {
        this.open = true;
        this.index = 0;
        blip(440, 0.08);
      } else this.o.onExit();
      return;
    }
    if (!this.open) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') this.move(-1);
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.move(1);
    else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyJ') this.choose();
  };

  private choose() {
    blip(880, 0.08);
    this.open = false;
    if (this.index === 1) this.o.onRestart();
    else if (this.index === 2) this.o.onExit();
  }

  /** Joystick: START pausa y sigue; con el menú abierto, el stick mueve, A elige y B sigue. Llamar una vez por frame. */
  poll() {
    this.pad.poll();
    const hit = (b: Parameters<PadEdges['pressed']>[0]) => this.pad.pressed(b);
    this.busy = this.open;
    if (hit('start') && (this.open || this.o.canPause())) {
      this.busy = true;
      this.open = !this.open;
      this.index = 0;
      blip(440, 0.08);
    } else if (this.open) {
      if (hit('up')) this.move(-1);
      else if (hit('down')) this.move(1);
      else if (hit('a') || hit('x')) this.choose();
      else if (hit('b')) this.open = false;
    }
  }

  private move(d: number) {
    this.index = (this.index + d + PAUSE_OPTIONS.length) % PAUSE_OPTIONS.length;
    blip(1320, 0.03, 'square', 0.03);
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, controls: Control[]) {
    if (!this.open) return;
    const u = Math.max(6, Math.round((Math.min(w, h) / 240) * 8));
    dim(ctx, 0, 0, w, h);
    const touch = hudTouch.on;
    // En el celular no se muestran los controles de teclado: queda solo el menú, al medio.
    const lw = u * 13, gap = u, cw = touch ? -gap : Math.min(u * 30, w - lw - gap - u * 2);
    const x = Math.round((w - lw - gap - cw) / 2), y = Math.round(h * 0.2);
    this.rects = PAUSE_OPTIONS.map((_, i) => ({ x, y: y + u * (2.8 + i * 2), w: lw, h: u * 2 }));
    frame(ctx, x, y, lw, u * (4 + PAUSE_OPTIONS.length * 2));
    text(ctx, 'PAUSA', x + lw / 2, y + u * 1.5, Math.round(u * 1.3), DR.amarillo, 'center');
    PAUSE_OPTIONS.forEach((opt, i) => {
      const on = i === this.index;
      const oy = y + u * (3.8 + i * 2);
      if (on) {
        ctx.fillStyle = DR.verde;
        ctx.fillRect(x + 4, Math.round(oy - u * 0.9), lw - 8, Math.round(u * 1.8));
        if (Math.floor(t * 4) % 2 === 0) text(ctx, '>', x + u * 1.2, oy, u, DR.amarillo, 'center');
      }
      text(ctx, opt, x + u * 2.4, oy, u, on ? DR.amarillo : DR.crema);
    });
    const fh = footH(u);
    if (touch) return;
    controlsBox(ctx, x + lw + gap, y, cw, u, controls, 'CONTROLES', h - fh - u - y);
    const help = 'ARRIBA/ABAJO O STICK: MOVER   ENTER O A: ELEGIR   ESC O START: SEGUIR';
    frame(ctx, u * 0.5, h - fh - u * 0.5, w - u, fh);
    text(ctx, help, w / 2, h - u * 0.5 - fh / 2, fitSize(help, Math.round(u * 0.75), w - u * 2), DR.crema, 'center');
  }
}
