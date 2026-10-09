/**
 * Joystick de los juegos (Gamepad API), ya traducido a botones con nombre.
 *
 * Se leen TODOS los joysticks conectados y se suman: por Bluetooth el mismo joystick puede
 * aparecer segundo en la lista (atrás de uno fantasma o del cable que quedó anotado), y
 * mirando solo el primero no respondía. También se entiende el layout no estándar, que es
 * como suelen presentarse por Bluetooth: la cruz llega como un eje "sombrero" en vez de botones.
 */
export interface PadState {
  /** Hay al menos un joystick a la vista (el navegador los muestra recién al apretar un botón). */
  connected: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  /** Botones de la derecha, con los nombres de Xbox: A abajo, B derecha, X izquierda, Y arriba. */
  a: boolean;
  b: boolean;
  x: boolean;
  y: boolean;
  /** Cualquiera de los de arriba (L1, R1, L2, R2). */
  shoulder: boolean;
  start: boolean;
}
export type PadButton = Exclude<keyof PadState, 'connected'>;
export const PAD_BUTTONS: PadButton[] = ['left', 'right', 'up', 'down', 'a', 'b', 'x', 'y', 'shoulder', 'start'];

/** La cruz como "sombrero": un solo eje que vale -1 arriba y va girando en 8 pasos hasta 1. */
function hat(v: number | undefined): [x: number, y: number] {
  if (v === undefined || Math.abs(v) > 1.01) return [0, 0];
  const i = Math.round((v + 1) * 3.5);
  // En reposo vale algo fuera de los 8 pasos (según el joystick, 0 o más de 1).
  if (Math.abs(v - (i / 3.5 - 1)) > 0.05) return [0, 0];
  const k = i % 8;
  return [k >= 1 && k <= 3 ? 1 : k >= 5 ? -1 : 0, k === 0 || k === 1 || k === 7 ? -1 : k >= 3 && k <= 5 ? 1 : 0];
}

export function readPad(): PadState {
  const s: PadState = { connected: false, left: false, right: false, up: false, down: false, a: false, b: false, x: false, y: false, shoulder: false, start: false };
  for (const p of navigator.getGamepads?.() ?? []) {
    if (!p?.connected) continue;
    s.connected = true;
    const on = (i: number) => Boolean(p.buttons[i]?.pressed);
    let dx = 0, dy = 0;
    if (p.mapping === 'standard') {
      dx = (on(15) ? 1 : 0) - (on(14) ? 1 : 0);
      dy = (on(13) ? 1 : 0) - (on(12) ? 1 : 0);
    } else if (p.axes.length >= 10) [dx, dy] = hat(p.axes[9]);
    else if (p.axes.length === 8) [dx, dy] = [Math.round(p.axes[6]), Math.round(p.axes[7])];
    const ax = p.axes[0] ?? 0, ay = p.axes[1] ?? 0;
    s.left ||= dx < 0 || ax < -0.45;
    s.right ||= dx > 0 || ax > 0.45;
    s.up ||= dy < 0 || ay < -0.6;
    s.down ||= dy > 0 || ay > 0.55;
    s.a ||= on(0);
    s.b ||= on(1);
    s.x ||= on(2);
    s.y ||= on(3);
    s.shoulder ||= on(4) || on(5) || on(6) || on(7);
    s.start ||= on(9);
  }
  return s;
}

/** Recuerda el frame anterior para saber qué botones se acaban de apretar. */
export class PadEdges {
  private prev = readPad();
  state = this.prev;
  private fresh = new Set<PadButton>();

  /** Llamar una vez por frame. */
  poll() {
    this.prev = this.state;
    this.state = readPad();
    this.fresh.clear();
    for (const b of PAD_BUTTONS) if (this.state[b] && !this.prev[b]) this.fresh.add(b);
    return this.state;
  }

  /** ¿Se apretó en este frame? */
  pressed(b: PadButton) {
    return this.fresh.has(b);
  }
}
