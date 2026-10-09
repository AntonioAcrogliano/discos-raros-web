import { PadEdges } from '../juegos/gamepad';
import { type AttackName, type Dir, type Intent, SPECIAL_INPUTS, type SpecialName } from './fighter';

/**
 * Entrada del jugador: teclado o joystick (ver juegos/gamepad.ts).
 * Los golpes se guardan un instante (buffer), así no se pierden si se aprietan
 * un pelito antes de que termine el golpe anterior.
 * También recuerda las últimas direcciones marcadas: dos direcciones + patada = habilidad.
 */

const KEY_ATTACK: Record<string, AttackName> = { KeyJ: 'alto', KeyK: 'bajo', KeyL: 'patada', KeyI: 'agarre' };
const PAD_ATTACK = { x: 'alto', a: 'bajo', b: 'patada', y: 'agarre' } as const;
const BUFFER = 0.16;
/** Direcciones absolutas (el "adelante" se resuelve según hacia dónde mira el luchador). */
type AbsDir = 'L' | 'R' | 'D';
const KEY_DIR: Record<string, AbsDir> = { ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R', ArrowDown: 'D', KeyS: 'D' };
/** Tiempo máximo entre una dirección y la otra, y entre la última y la patada. */
const COMBO_GAP = 0.45;

export class PlayerInput {
  private held = new Set<string>();
  private queued: AttackName | null = null;
  private queuedFor = 0;
  private pad = new PadEdges();
  /** Enter / Start apretado desde la última vez que se consultó. */
  private confirmed = false;
  private stepped = 0;
  private steppedY = 0;
  private clock = 0;
  private history: { d: AbsDir; t: number }[] = [];
  private padDirs: Record<AbsDir, boolean> = { L: false, R: false, D: false };

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
    if (KEY_DIR[e.code]) this.mark(KEY_DIR[e.code]);
    if (e.code === 'Enter') this.confirmed = true;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.stepped = -1;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') this.stepped = 1;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') this.steppedY = -1;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') this.steppedY = 1;
  };
  private onUp = (e: KeyboardEvent) => this.held.delete(e.code);
  private onBlur = () => this.held.clear();

  private mark(d: AbsDir) {
    this.history.push({ d, t: this.clock });
    if (this.history.length > 4) this.history.shift();
  }

  /** ¿Las dos últimas direcciones + esta patada forman una habilidad? */
  private special(dir: number): SpecialName | null {
    const [prev, last] = this.history.slice(-2);
    if (!prev || !last || this.clock - last.t > COMBO_GAP || last.t - prev.t > COMBO_GAP) return null;
    const rel = (d: AbsDir): Dir => (d === 'D' ? 'd' : (d === 'R') === dir > 0 ? 'f' : 'b');
    for (const name of Object.keys(SPECIAL_INPUTS) as SpecialName[]) {
      const [a, b] = SPECIAL_INPUTS[name];
      if (rel(prev.d) === a && rel(last.d) === b) return name;
    }
    return null;
  }

  private queue(a: AttackName) {
    this.queued = a;
    this.queuedFor = BUFFER;
  }

  get connected() {
    return this.pad.state.connected;
  }

  /** Leer el joystick una vez por frame (los botones no avisan solos). */
  poll(dt: number) {
    this.clock += dt;
    this.queuedFor -= dt;
    if (this.queuedFor <= 0) this.queued = null;
    const p = this.pad.poll();
    const now: Record<AbsDir, boolean> = { L: p.left, R: p.right, D: p.down };
    for (const d of ['L', 'R', 'D'] as const) {
      if (now[d] && !this.padDirs[d]) this.mark(d);
      this.padDirs[d] = now[d];
    }
    for (const b of ['x', 'a', 'b', 'y'] as const) if (this.pad.pressed(b)) this.queue(PAD_ATTACK[b]);
    if (this.pad.pressed('start') || this.pad.pressed('a')) this.confirmed = true;
    if (this.pad.pressed('left')) this.stepped = -1;
    if (this.pad.pressed('right')) this.stepped = 1;
    if (this.pad.pressed('up')) this.steppedY = -1;
    if (this.pad.pressed('down')) this.steppedY = 1;
  }

  /** Tirar lo que se haya apretado (mientras el menú de pausa tiene el joystick). */
  flush() {
    this.confirmed = false;
    this.queued = null;
    this.stepped = this.steppedY = 0;
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

  /** Arriba o abajo apretado desde la última consulta (-1 = arriba, 1 = abajo), para los menús. */
  takeStepY() {
    const s = this.steppedY;
    this.steppedY = 0;
    return s;
  }

  /**
   * @param dir hacia dónde mira el luchador (1 = derecha): "adelante" depende de eso.
   * @param canAttack si puede empezar un golpe ya; si no, el golpe queda en el buffer.
   */
  intent(dir: number, canAttack: boolean): Intent {
    const p = this.pad.state;
    const x = (this.held.has('ArrowRight') || this.held.has('KeyD') || p.right ? 1 : 0) - (this.held.has('ArrowLeft') || this.held.has('KeyA') || p.left ? 1 : 0);
    let attack: AttackName | null = null;
    if (canAttack && this.queued) {
      attack = this.queued;
      this.queued = null;
      if (attack === 'patada') {
        const s = this.special(dir);
        if (s) {
          attack = s;
          this.history = [];
        }
      }
    }
    return {
      move: x * dir,
      down: this.held.has('ArrowDown') || this.held.has('KeyS') || p.down,
      up: this.held.has('ArrowUp') || this.held.has('KeyW') || p.up,
      block: this.held.has('Space') || this.held.has('ShiftLeft') || this.held.has('ShiftRight') || p.shoulder,
      attack,
    };
  }
}
