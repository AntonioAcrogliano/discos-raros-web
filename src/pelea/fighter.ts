import type { Rig } from '../characters/rig';

/**
 * Un luchador: estado, reglas de los golpes y pose. Todo es procedural sobre el esqueleto
 * (sin animaciones grabadas), así sirve igual para los modelos reales y para los de cajas.
 */

export type AttackName = 'alto' | 'bajo' | 'patada';
/** A qué altura pega: alto pasa por arriba del agachado, medio le pega, bajo hay que bloquearlo agachado. */
export type Level = 'alto' | 'medio' | 'bajo';

export interface Attack {
  /** Segundos de preparación, de golpe activo y de recuperación. */
  startup: number;
  active: number;
  recovery: number;
  /** Alcance en metros (distancia entre los dos). */
  range: number;
  damage: number;
  level: Level;
  hitstun: number;
  blockstun: number;
  /** Empujón al que lo recibe (m/s). */
  push: number;
}

export const ATTACKS: Record<AttackName, Attack> = {
  alto: { startup: 0.1, active: 0.09, recovery: 0.17, range: 1.1, damage: 8, level: 'alto', hitstun: 0.3, blockstun: 0.15, push: 2.2 },
  bajo: { startup: 0.14, active: 0.09, recovery: 0.23, range: 1.05, damage: 6, level: 'bajo', hitstun: 0.27, blockstun: 0.17, push: 1.6 },
  patada: { startup: 0.22, active: 0.11, recovery: 0.36, range: 1.4, damage: 14, level: 'medio', hitstun: 0.42, blockstun: 0.22, push: 3.6 },
};

/** Lo que quiere hacer un luchador en este frame (venga del teclado, del joystick o de la CPU). */
export interface Intent {
  /** -1 = alejarse del rival, 1 = acercarse. */
  move: number;
  down: boolean;
  block: boolean;
  /** Golpe apretado en este frame (no mantenido). */
  attack: AttackName | null;
}
export const NO_INTENT: Intent = { move: 0, down: false, block: false, attack: null };

export type FighterState = 'idle' | 'attack' | 'hit' | 'blockstun' | 'ko' | 'win';

export const MAX_HP = 100;
export const ARENA_HALF = 3.9;
const WALK_FWD = 2.3, WALK_BACK = 1.75;

/** Ángulos de la pose (radianes) y altura del cuerpo. */
interface Pose {
  bodyY: number; bodyRx: number; bodyRy: number; headRx: number;
  aLx: number; aLz: number; fLx: number;
  aRx: number; aRz: number; fRx: number;
  lLx: number; kLx: number; lRx: number; kRx: number;
}
const GUARD: Pose = {
  bodyY: -0.03, bodyRx: 0.06, bodyRy: 0, headRx: 0.05,
  aLx: -0.95, aLz: -0.1, fLx: -1.5, aRx: -0.6, aRz: 0.1, fRx: -1.95,
  lLx: -0.28, kLx: 0.34, lRx: 0.22, kRx: 0.3,
};
const CROUCH: Partial<Pose> = { bodyY: -0.4, bodyRx: 0.2, lLx: -1.25, kLx: 1.9, lRx: -0.95, kRx: 1.9 };
const POSE_KEYS = Object.keys(GUARD) as (keyof Pose)[];

export class Fighter {
  x = 0;
  /** 1 = mira hacia +x, -1 = hacia -x. */
  dir = 1;
  hp = MAX_HP;
  state: FighterState = 'idle';
  /** Segundos en el estado actual. */
  t = 0;
  attack: AttackName | null = null;
  /** El golpe actual ya conectó (o fue bloqueado). */
  landed = false;
  crouching = false;
  blocking = false;
  wins = 0;
  private stun = 0;
  private vx = 0;
  private walk = 0;
  private moving = 0;
  private pose: Pose = { ...GUARD };

  constructor(readonly name: string, readonly rig: Rig, readonly z: number) {}

  reset(x: number, dir: number) {
    this.x = x;
    this.dir = dir;
    this.hp = MAX_HP;
    this.state = 'idle';
    this.t = 0;
    this.attack = null;
    this.crouching = this.blocking = false;
    this.vx = 0;
    this.pose = { ...GUARD };
  }

  /** ¿Está en la parte del golpe que pega? */
  get striking() {
    if (this.state !== 'attack' || !this.attack || this.landed) return false;
    const a = ATTACKS[this.attack];
    return this.t >= a.startup && this.t < a.startup + a.active;
  }

  /** ¿Está agachado? (también cuenta mientras tira el golpe bajo). */
  get low() {
    return (this.state === 'idle' || this.state === 'blockstun') ? this.crouching : this.state === 'attack' && this.attack === 'bajo';
  }

  /** ¿Bloquea un golpe de esa altura? */
  blocks(level: Level) {
    if (this.state !== 'idle' && this.state !== 'blockstun') return false;
    if (!this.blocking) return false;
    return level === 'bajo' ? this.crouching : !this.crouching;
  }

  takeHit(a: Attack, from: number) {
    this.hp = Math.max(0, this.hp - a.damage);
    this.vx = from * a.push;
    this.attack = null;
    this.t = 0;
    if (this.hp <= 0) this.state = 'ko';
    else {
      this.state = 'hit';
      this.stun = a.hitstun;
    }
  }

  takeBlock(a: Attack, from: number) {
    // El bloqueo saca un punto, pero nunca noquea.
    this.hp = Math.max(1, this.hp - 1);
    this.vx = from * a.push * 0.55;
    this.state = 'blockstun';
    this.stun = a.blockstun;
    this.t = 0;
  }

  update(dt: number, intent: Intent, foe: Fighter) {
    this.t += dt;
    this.moving = 0;
    if (this.state === 'attack') {
      const a = ATTACKS[this.attack!];
      if (this.t >= a.startup + a.active + a.recovery) this.toIdle();
    } else if (this.state === 'hit' || this.state === 'blockstun') {
      if (this.t >= this.stun) this.toIdle();
    }
    if (this.state === 'idle') {
      this.dir = foe.x >= this.x ? 1 : -1;
      this.crouching = intent.down;
      this.blocking = intent.block;
      if (intent.attack && !this.blocking) {
        this.state = 'attack';
        this.attack = intent.attack;
        this.landed = false;
        this.t = 0;
      } else if (!this.crouching && !this.blocking && intent.move) {
        this.moving = intent.move;
        this.x += this.dir * intent.move * (intent.move > 0 ? WALK_FWD : WALK_BACK) * dt;
        this.walk += dt * 9;
      }
    }
    this.x += this.vx * dt;
    this.vx *= Math.max(0, 1 - dt * 9);
    this.x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, this.x));
  }

  private toIdle() {
    this.state = 'idle';
    this.attack = null;
    this.t = 0;
  }

  /** Calcula la pose del momento y la aplica al esqueleto (suavizada). */
  applyPose(dt: number, time: number) {
    const p: Pose = { ...GUARD };
    p.bodyY += Math.sin(time * 6 + this.dir) * 0.012;
    let speed = 20;

    if (this.state === 'idle' || this.state === 'blockstun') {
      if (this.crouching) Object.assign(p, CROUCH);
      if (this.blocking) Object.assign(p, this.crouching
        ? { aLx: -0.75, fLx: -0.7, aRx: -0.75, fRx: -0.7, aLz: -0.25, aRz: 0.25, headRx: 0.3 }
        : { aLx: -1.35, fLx: -1.9, aRx: -1.35, fRx: -1.9, aLz: -0.3, aRz: 0.3, headRx: 0.25, bodyRx: 0.14 });
      if (this.moving) {
        const s = Math.sin(this.walk);
        p.lLx += s * 0.5;
        p.lRx -= s * 0.5;
        p.bodyY += Math.abs(Math.cos(this.walk)) * 0.02;
      }
      if (this.state === 'blockstun') p.bodyRx -= 0.12;
    } else if (this.state === 'attack') {
      const a = ATTACKS[this.attack!];
      // 0 → 1 mientras sale el golpe, y vuelve a 0 en la recuperación.
      const out = this.t < a.startup ? this.t / a.startup : this.t < a.startup + a.active ? 1 : Math.max(0, 1 - (this.t - a.startup - a.active) / a.recovery);
      const k = (from: number, to: number) => from + (to - from) * out;
      speed = 40;
      if (this.attack === 'alto') {
        p.aLx = k(p.aLx, -1.6);
        p.fLx = k(p.fLx, -0.02);
        p.bodyRx = k(p.bodyRx, 0.16);
        p.bodyRy = k(0, -0.35);
      } else if (this.attack === 'bajo') {
        Object.assign(p, CROUCH);
        p.aRx = k(p.aRx, -1.15);
        p.fRx = k(p.fRx, -0.05);
        p.bodyRy = k(0, 0.4);
      } else {
        p.lRx = k(p.lRx, -1.55);
        p.kRx = k(p.kRx, this.t < a.startup ? 1.3 * (1 - out) + 0.9 * out * (1 - out) * 4 : 0.05);
        p.bodyRx = k(p.bodyRx, -0.28);
        p.bodyRy = k(0, 0.45);
        p.aLz = k(p.aLz, 0.5);
      }
    } else if (this.state === 'hit') {
      Object.assign(p, { bodyRx: -0.32, headRx: -0.45, aLz: 0.85, aRz: -0.85, aLx: -0.4, aRx: -0.4, fLx: -0.6, fRx: -0.6 });
      speed = 30;
    } else if (this.state === 'ko') {
      // Cae de espaldas y queda despatarrado.
      Object.assign(p, { bodyRx: -1.5, bodyY: 0.1, headRx: -0.2, aLz: 1.3, aRz: -1.3, aLx: 0, aRx: 0, fLx: -0.2, fRx: -0.2, lLx: -0.25, lRx: 0.2, kLx: 0.2, kRx: 0.5 });
      speed = 7;
    } else if (this.state === 'win') {
      const hop = Math.abs(Math.sin(time * 7));
      Object.assign(p, { bodyY: hop * 0.12, bodyRx: 0, headRx: -0.2, aLz: 2.7 + hop * 0.2, aRz: -2.7 - hop * 0.2, aLx: 0, aRx: 0, fLx: -0.2, fRx: -0.2, lLx: 0, lRx: 0, kLx: 0, kRx: 0 });
      speed = 12;
    }

    const f = Math.min(1, dt * speed);
    for (const key of POSE_KEYS) this.pose[key] += (p[key] - this.pose[key]) * f;
    const q = this.pose, r = this.rig;
    r.root.position.set(this.x, 0, this.z);
    // De costado, pero un poco girado hacia la cámara para que se le vea el frente.
    r.root.rotation.y = this.dir * (Math.PI / 2 - 0.38) + (this.state === 'win' ? -this.dir * 1.2 : 0);
    r.body.position.y = q.bodyY;
    r.body.rotation.set(q.bodyRx, q.bodyRy, 0);
    r.head.rotation.x = q.headRx;
    r.armL.rotation.set(q.aLx, 0, q.aLz);
    r.foreL.rotation.x = q.fLx;
    r.armR.rotation.set(q.aRx, 0, q.aRz);
    r.foreR.rotation.x = q.fRx;
    r.legL.rotation.x = q.lLx;
    r.kneeL.rotation.x = q.kLx;
    r.legR.rotation.x = q.lRx;
    r.kneeR.rotation.x = q.kRx;
  }
}
