import type { AttackName, Intent } from './fighter';

/**
 * Entrada del jugador: teclado o joystick (Gamepad API, layout estándar).
 * Los golpes se guardan un instante (buffer), así no se pierden si se aprietan
 * un pelito antes de que termine el golpe anterior.
 */

const KEY_ATTACK: Record<string, AttackName> = { KeyJ: 'alto', KeyK: 'bajo', KeyL: 'patada' };
const PAD_ATTACK: Record<number, AttackName> = { 2: 'alto', 0: 'bajo', 1: 'patada', 3: 'patada' };
const BUFFER = 0.16;

export class PlayerInput {
  private held = new Set<string>();
  private queued: AttackName | null = null;
  private queuedFor = 0;
  private padHeld = new Set<number>();
  /** Enter / Start apretado desde la última vez que se consultó. */
  private confirmed = false;
  private stepped = 0;

  constructor() {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  dispose() {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }

  private onDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const used = e.code in KEY_ATTACK || ['KeyA', 'KeyD', 'KeyS', 'KeyW', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space', 'Enter', 'ShiftLeft', 'ShiftRight'].includes(e.code);
    if (!used) return;
    e.preventDefault();
    if (e.repeat) return;
    this.held.add(e.code);
    const a = KEY_ATTACK[e.code];
    if (a) this.queue(a);
    if (e.code === 'Enter') this.confirmed = true;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.stepped = -1;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') this.stepped = 1;
  };
  private onUp = (e: KeyboardEvent) => this.held.delete(e.code);
  private onBlur = () => this.held.clear();

  private queue(a: AttackName) {
    this.queued = a;
    this.queuedFor = BUFFER;
  }

  private pad() {
    for (const p of navigator.getGamepads?.() ?? []) if (p?.connected) return p;
    return null;
  }

  /** Leer el joystick una vez por frame (los botones no avisan solos). */
  poll(dt: number) {
    this.queuedFor -= dt;
    if (this.queuedFor <= 0) this.queued = null;
    const p = this.pad();
    if (!p) return;
    p.buttons.forEach((b, i) => {
      if (b.pressed && !this.padHeld.has(i)) {
        this.padHeld.add(i);
        const a = PAD_ATTACK[i];
        if (a) this.queue(a);
        if (i === 9 || i === 0) this.confirmed = true;
        if (i === 14) this.stepped = -1;
        if (i === 15) this.stepped = 1;
      } else if (!b.pressed) this.padHeld.delete(i);
    });
  }

  /** ¿Se apretó Enter / Start / un golpe? (para pasar pantallas). Se consume al leerlo. */
  takeConfirm() {
    const c = this.confirmed || this.queued !== null;
    this.confirmed = false;
    this.queued = null;
    return c;
  }

  /** Izquierda o derecha apretada desde la última consulta (-1, 0, 1), para los menús. */
  takeStep() {
    const s = this.stepped;
    this.stepped = 0;
    return s;
  }

  /**
   * @param dir hacia dónde mira el luchador (1 = derecha): "adelante" depende de eso.
   * @param canAttack si puede empezar un golpe ya; si no, el golpe queda en el buffer.
   */
  intent(dir: number, canAttack: boolean): Intent {
    const p = this.pad();
    const ax = p?.axes[0] ?? 0, ay = p?.axes[1] ?? 0;
    const pb = (i: number) => Boolean(p?.buttons[i]?.pressed);
    const left = this.held.has('ArrowLeft') || this.held.has('KeyA') || pb(14) || ax < -0.45;
    const right = this.held.has('ArrowRight') || this.held.has('KeyD') || pb(15) || ax > 0.45;
    const x = (right ? 1 : 0) - (left ? 1 : 0);
    let attack: AttackName | null = null;
    if (canAttack && this.queued) {
      attack = this.queued;
      this.queued = null;
    }
    return {
      move: x * dir,
      down: this.held.has('ArrowDown') || this.held.has('KeyS') || pb(13) || ay > 0.5,
      block: this.held.has('Space') || this.held.has('ShiftLeft') || this.held.has('ShiftRight') || pb(4) || pb(5) || pb(6) || pb(7),
      attack,
    };
  }
}
