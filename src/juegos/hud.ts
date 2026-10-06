import { DR, FONT, blip, fitSize, outlined } from '../style-kit';

/**
 * Interfaz compartida por los juegos (pelea y cabezazos), dibujada en la capa de textos:
 * ventanas con borde, oscurecido con tramado, pantalla de selección, menú de pausa y la
 * lista de controles. Así los dos juegos se ven y se manejan igual.
 */

/** Una línea de la lista de controles: [teclas, qué hace]. */
export type Control = [keys: string, action: string];

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

/** Lista de controles en una ventana: tecla a la izquierda, acción a la derecha. Devuelve el alto. */
export function controlsBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, unit: number, controls: Control[], title = 'CONTROLES') {
  const pad = Math.round(unit * 0.7);
  const longest = Math.max(...controls.map(([k, a]) => k.length + a.length + 2));
  const size = Math.max(6, Math.min(Math.floor(unit * 0.75), Math.floor((w - pad * 2) / longest)));
  const row = Math.round(size * 1.9);
  const h = pad * 2 + unit * 1.4 + controls.length * row;
  frame(ctx, x, y, w, h);
  text(ctx, title, x + w / 2, y + pad + unit * 0.4, Math.min(unit, size * 1.3), DR.amarillo, 'center');
  controls.forEach(([keys, action], i) => {
    const ry = y + pad + unit * 1.4 + i * row + row / 2;
    text(ctx, keys, x + pad, ry, size, DR.amarillo);
    text(ctx, action, x + w - pad, ry, size, DR.crema, 'right');
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
}

/** Pantalla de selección: una ventana por personaje (se lo ve en 3D adentro), dificultad y controles al medio. */
export function drawSelect(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, v: SelectView) {
  const u = Math.max(6, Math.round((Math.min(w, h) / 240) * 8));
  const blink = Math.floor(t * 4) % 2 === 0;
  const cw = Math.round(Math.min(w * 0.24, u * 13));
  const y0 = Math.round(h * v.cardTop), y1 = Math.round(h * v.cardBottom);
  const cards = v.players.map((p) => ({ x: Math.round(Math.max(u * 0.5, Math.min(w - cw - u * 0.5, p.cx * w - cw / 2))), y: y0, w: cw, h: y1 - y0 }));
  dim(ctx, 0, 0, w, h, cards.map((c) => ({ x: c.x + 3, y: c.y + 3, w: c.w - 6, h: c.h - 6 })));

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  outlined(ctx, v.title, w / 2, u * 2.3, fitSize(v.title, u * 2, w), DR.amarillo, DR.rojo);
  outlined(ctx, v.prompt, w / 2, u * 4.5, fitSize(v.prompt, u, w), DR.crema);

  cards.forEach((c, i) => {
    const on = i === v.me;
    const color = on ? (blink ? DR.amarillo : DR.rojo) : '#5a5666';
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
    ctx.fillStyle = on ? DR.amarillo : '#5a5666';
    ctx.fillRect(c.x, c.y, tw, Math.round(u * 1.6));
    text(ctx, tag, c.x + tw / 2, c.y + u * 0.85, u, DR.negro, 'center');
    // Nombre abajo.
    frame(ctx, c.x, c.y + c.h + u * 0.4, c.w, u * 2.2, on ? DR.amarillo : '#5a5666');
    text(ctx, v.players[i].name, c.x + c.w / 2, c.y + c.h + u * 1.55, fitSize(v.players[i].name, Math.round(u * 1.2), c.w), on ? DR.amarillo : DR.rosa, 'center');
  });

  // Columna del medio: dificultad y controles.
  const left = Math.min(...cards.map((c) => c.x + c.w)) + u, right = Math.max(...cards.map((c) => c.x)) - u;
  const mx = right - left >= u * 12 ? left : w / 2 - u * 9;
  const mw = right - left >= u * 12 ? right - left : u * 18;
  frame(ctx, mx, y0, mw, u * 3.4);
  text(ctx, 'DIFICULTAD', mx + mw / 2, y0 + u * 1, Math.round(u * 0.75), DR.rosa, 'center');
  const diffColor = [DR.verdeClaro, DR.amarillo, DR.rojo][v.difficulty] ?? DR.crema;
  text(ctx, v.difficulties[v.difficulty], mx + mw / 2, y0 + u * 2.3, u, diffColor, 'center');
  if (v.difficulty > 0) text(ctx, '<', mx + u * 1.2, y0 + u * 2.3, u, DR.crema, 'center');
  if (v.difficulty < v.difficulties.length - 1) text(ctx, '>', mx + mw - u * 1.2, y0 + u * 2.3, u, DR.crema, 'center');
  controlsBox(ctx, mx, y0 + u * 4, mw, u, v.controls);

  // Pie: cómo se maneja este menú.
  const help = `IZQ/DER: ELEGIR   ARRIBA/ABAJO: DIFICULTAD   ENTER: ${v.go}   ESC: SALIR`;
  const fh = Math.round(u * 1.9);
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
  text(ctx, 'ENTER: REVANCHA', w / 2, yy, u, Math.floor(t * 3) % 2 ? DR.amarillo : DR.crema, 'center');
  text(ctx, `ESC: SALIR (${Math.max(0, Math.ceil(o.seconds))})`, w / 2, yy + u * 1.6, Math.round(u * 0.75), DR.rosa, 'center');
}

const PAUSE_OPTIONS = ['SEGUIR', 'REINICIAR', 'SALIR'] as const;

/**
 * Menú de pausa. Esc lo abre en medio de una partida (en vez de sacarte del juego de una);
 * fuera de la partida, Esc sale directo. Mientras está abierto se queda con el teclado.
 */
export class PauseMenu {
  open = false;
  private index = 0;

  constructor(private o: { canPause(): boolean; onRestart(): void; onExit(): void }) {
    // En la fase de captura: llega antes que los controles del juego.
    window.addEventListener('keydown', this.key, true);
  }

  dispose() {
    window.removeEventListener('keydown', this.key, true);
  }

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
    else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyJ') {
      blip(880, 0.08);
      this.open = false;
      if (this.index === 1) this.o.onRestart();
      else if (this.index === 2) this.o.onExit();
    }
  };

  private move(d: number) {
    this.index = (this.index + d + PAUSE_OPTIONS.length) % PAUSE_OPTIONS.length;
    blip(1320, 0.03, 'square', 0.03);
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, controls: Control[]) {
    if (!this.open) return;
    const u = Math.max(6, Math.round((Math.min(w, h) / 240) * 8));
    dim(ctx, 0, 0, w, h);
    const lw = u * 13, gap = u, cw = Math.min(u * 26, w - lw - gap - u * 2);
    const x = Math.round((w - lw - gap - cw) / 2), y = Math.round(h * 0.2);
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
    controlsBox(ctx, x + lw + gap, y, cw, u, controls);
    const help = 'ARRIBA/ABAJO: MOVER   ENTER: ELEGIR   ESC: SEGUIR';
    const fh = Math.round(u * 1.9);
    frame(ctx, u * 0.5, h - fh - u * 0.5, w - u, fh);
    text(ctx, help, w / 2, h - u * 0.5 - fh / 2, fitSize(help, Math.round(u * 0.75), w - u * 2), DR.crema, 'center');
  }
}
