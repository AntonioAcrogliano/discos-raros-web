import type { Rig } from '../characters/rig';

/**
 * Un luchador: estado, reglas de los golpes y pose. Todo es procedural sobre el esqueleto
 * (sin animaciones grabadas), así sirve igual para los modelos reales y para los de cajas.
 */

export type AttackName = 'alto' | 'bajo' | 'patada' | 'agarre' | 'voladora' | SpecialName;
/** Habilidades: una combinación de direcciones + patada (ver SPECIAL_INPUTS). */
export type SpecialName = 'vinilo' | 'humo' | 'vomito';
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
  /** Vida que saca aunque lo bloqueen (por defecto 1). */
  chip?: number;
  /** No pega el cuerpo: sale algo volando (lo maneja la pelea). */
  projectile?: boolean;
  /** Agarre: no se puede bloquear, pero falla contra el que está agachado o en el aire. */
  grab?: boolean;
}

export const ATTACKS: Record<AttackName, Attack> = {
  alto: { startup: 0.1, active: 0.09, recovery: 0.17, range: 1.1, damage: 8, level: 'alto', hitstun: 0.3, blockstun: 0.15, push: 2.2 },
  bajo: { startup: 0.14, active: 0.09, recovery: 0.23, range: 1.05, damage: 6, level: 'bajo', hitstun: 0.27, blockstun: 0.17, push: 1.6 },
  patada: { startup: 0.22, active: 0.11, recovery: 0.36, range: 1.4, damage: 14, level: 'medio', hitstun: 0.42, blockstun: 0.22, push: 3.6 },
  // Agarre: lo levanta y lo revolea para atrás. Le gana al bloqueo; si falla, queda regalado.
  agarre: { startup: 0.13, active: 0.08, recovery: 0.42, range: 1.0, damage: 16, level: 'medio', hitstun: 0, blockstun: 0, push: 0, grab: true },
  // Patada voladora: cualquier golpe apretado en el aire. Pega mientras cae.
  voladora: { startup: 0.07, active: 1, recovery: 0, range: 1.25, damage: 12, level: 'medio', hitstun: 0.4, blockstun: 0.2, push: 3.2 },
  // Revolear un vinilo: cruza toda la pista a media altura. Hay que bloquearlo parado o saltarlo.
  vinilo: { startup: 0.32, active: 0.05, recovery: 0.42, range: 0, damage: 12, level: 'medio', hitstun: 0.36, blockstun: 0.2, push: 3, chip: 2, projectile: true },
  // Aros de humo: tres, lentos y altos. Agachándose pasan por arriba.
  humo: { startup: 0.5, active: 0.45, recovery: 0.35, range: 0, damage: 6, level: 'alto', hitstun: 0.3, blockstun: 0.16, push: 1.2, projectile: true },
  // Tomar una birra y vomitarle: tarda un montón (regalado), pero pega fuerte y de lejos.
  vomito: { startup: 0.85, active: 0.3, recovery: 0.5, range: 1.95, damage: 20, level: 'medio', hitstun: 0.6, blockstun: 0.3, push: 2.5, chip: 5 },
};

/** Cuántos aros salen por cada "humo" y cada cuánto. */
export const SMOKE_RINGS = 3;
export const SMOKE_EVERY = 0.17;

/** Direcciones relativas al rival: f = hacia él, b = para atrás, d = abajo. */
export type Dir = 'f' | 'b' | 'd';
/** Las dos direcciones que hay que marcar justo antes de la patada. */
export const SPECIAL_INPUTS: Record<SpecialName, [Dir, Dir]> = {
  vinilo: ['b', 'f'],
  humo: ['d', 'f'],
  vomito: ['d', 'd'],
};

/** Lo que quiere hacer un luchador en este frame (venga del teclado, del joystick o de la CPU). */
export interface Intent {
  /** -1 = alejarse del rival, 1 = acercarse. */
  move: number;
  down: boolean;
  up: boolean;
  block: boolean;
  /** Golpe apretado en este frame (no mantenido). */
  attack: AttackName | null;
}
export const NO_INTENT: Intent = { move: 0, down: false, up: false, block: false, attack: null };

export type FighterState = 'idle' | 'attack' | 'jump' | 'hit' | 'blockstun' | 'throwing' | 'thrown' | 'down' | 'ko' | 'win';

export const MAX_HP = 100;
export const ARENA_HALF = 3.9;
const WALK_FWD = 2.3, WALK_BACK = 1.75;
const JUMP_SPEED = 6.3, GRAVITY = 16.5, JUMP_DRIFT = 2.6;
const THROW_SECONDS = 0.58, DOWN_SECONDS = 0.75;

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
const LYING: Partial<Pose> = { bodyRx: -1.5, bodyY: 0.1, headRx: -0.2, aLz: 1.3, aRz: -1.3, aLx: 0, aRx: 0, fLx: -0.2, fRx: -0.2, lLx: -0.25, lRx: 0.2, kLx: 0.2, kRx: 0.5 };
const POSE_KEYS = Object.keys(GUARD) as (keyof Pose)[];

export class Fighter {
  x = 0;
  /** Altura de los pies sobre el piso (salto, o cuando lo revolean). */
  y = 0;
  /** 1 = mira hacia +x, -1 = hacia -x. */
  dir = 1;
  hp = MAX_HP;
  state: FighterState = 'idle';
  /** Segundos en el estado actual (en el salto, desde que tiró la voladora). */
  t = 0;
  attack: AttackName | null = null;
  /** El golpe actual ya conectó (o fue bloqueado). */
  landed = false;
  /** Cosas que ya tiró en esta habilidad (vinilo, aros de humo). */
  shots = 0;
  crouching = false;
  blocking = false;
  wins = 0;
  /** Acaba de caer al piso después de que lo revolearon (lo lee la pelea y lo apaga). */
  slammed = false;
  private stun = 0;
  private vx = 0;
  private vy = 0;
  private walk = 0;
  private moving = 0;
  private throwFrom = 0;
  private throwTo = 0;
  private pose: Pose = { ...GUARD };

  constructor(readonly name: string, readonly rig: Rig, readonly z: number) {}

  reset(x: number, dir: number) {
    this.x = x;
    this.y = 0;
    this.dir = dir;
    this.hp = MAX_HP;
    this.state = 'idle';
    this.t = 0;
    this.attack = null;
    this.crouching = this.blocking = this.slammed = false;
    this.vx = this.vy = 0;
    this.pose = { ...GUARD };
  }

  /** ¿Está en la parte del golpe que pega? */
  get striking() {
    if (!this.attack || this.landed) return false;
    const a = ATTACKS[this.attack];
    if (a.projectile) return false;
    if (this.state === 'jump') return this.attack === 'voladora' && this.t >= a.startup;
    return this.state === 'attack' && this.t >= a.startup && this.t < a.startup + a.active;
  }

  /** ¿Está agachado? (también cuenta mientras tira el golpe bajo). */
  get low() {
    return (this.state === 'idle' || this.state === 'blockstun') ? this.crouching : this.state === 'attack' && this.attack === 'bajo';
  }

  /** ¿Está lo bastante alto como para que le pasen por abajo los golpes bajos, el agarre y el vinilo? */
  get airborne() {
    return this.y > 0.45;
  }

  /** ¿No se le puede pegar ahora? (lo están revoleando, está en el piso o ya perdió). */
  get untouchable() {
    return this.state === 'thrown' || this.state === 'down' || this.state === 'ko' || this.state === 'throwing';
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
    // El bloqueo saca un poquito, pero nunca noquea.
    this.hp = Math.max(1, this.hp - (a.chip ?? 1));
    this.vx = from * a.push * 0.55;
    this.state = 'blockstun';
    this.stun = a.blockstun;
    this.t = 0;
  }

  /** Agarró al rival: lo revolea por arriba y lo tira atrás suyo. */
  throwFoe(foe: Fighter) {
    this.state = 'throwing';
    this.t = 0;
    this.attack = null;
    foe.state = 'thrown';
    foe.t = 0;
    foe.attack = null;
    foe.vx = foe.vy = 0;
    foe.throwFrom = foe.x;
    foe.throwTo = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, this.x - this.dir * 1.5));
  }

  update(dt: number, intent: Intent, foe: Fighter) {
    this.t += dt;
    this.moving = 0;

    if (this.state === 'thrown') {
      const u = Math.min(1, this.t / THROW_SECONDS);
      this.x = this.throwFrom + (this.throwTo - this.throwFrom) * u;
      this.y = Math.sin(Math.PI * u) * 1.5;
      if (u >= 1) {
        this.y = 0;
        this.hp = Math.max(0, this.hp - ATTACKS.agarre.damage);
        this.slammed = true;
        this.state = this.hp <= 0 ? 'ko' : 'down';
        this.t = 0;
      }
      return;
    }
    if (this.state === 'attack') {
      const a = ATTACKS[this.attack!];
      if (this.t >= a.startup + a.active + a.recovery) this.toIdle();
    } else if (this.state === 'hit' || this.state === 'blockstun') {
      if (this.t >= this.stun && this.y <= 0) this.toIdle();
    } else if (this.state === 'throwing') {
      if (this.t >= THROW_SECONDS + 0.12) this.toIdle();
    } else if (this.state === 'down') {
      if (this.t >= DOWN_SECONDS) this.toIdle();
    } else if (this.state === 'jump' && intent.attack && !this.attack) {
      this.attack = 'voladora';
      this.landed = false;
      this.t = 0;
    }

    if (this.state === 'idle') {
      this.dir = foe.x >= this.x ? 1 : -1;
      this.crouching = intent.down;
      this.blocking = intent.block;
      if (intent.attack && !this.blocking) {
        this.state = 'attack';
        this.attack = intent.attack;
        this.landed = false;
        this.shots = 0;
        this.t = 0;
      } else if (intent.up && !this.crouching) {
        this.state = 'jump';
        this.attack = null;
        this.blocking = false;
        this.vy = JUMP_SPEED;
        this.vx = this.dir * intent.move * JUMP_DRIFT;
        this.t = 0;
      } else if (!this.crouching && !this.blocking && intent.move) {
        this.moving = intent.move;
        this.x += this.dir * intent.move * (intent.move > 0 ? WALK_FWD : WALK_BACK) * dt;
        this.walk += dt * 9;
      }
    }

    // Gravedad: vale para el salto y para el que recibe un golpe en el aire.
    if (this.y > 0 || this.vy > 0) {
      this.y += this.vy * dt;
      this.vy -= GRAVITY * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        if (this.state === 'jump') {
          this.toIdle();
          this.vx = 0;
        }
      }
    }
    this.x += this.vx * dt;
    // En el aire se mantiene el impulso; en el piso el empujón se frena enseguida.
    if (this.y <= 0) this.vx *= Math.max(0, 1 - dt * 9);
    this.x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, this.x));
  }

  private toIdle() {
    this.state = 'idle';
    this.attack = null;
    this.t = 0;
  }

  /** Está empinando la birra (antes de vomitar). */
  get drinking() {
    return this.state === 'attack' && this.attack === 'vomito' && this.t < ATTACKS.vomito.startup * 0.7;
  }

  /** Calcula la pose del momento y la aplica al esqueleto (suavizada). */
  applyPose(dt: number, time: number) {
    const p: Pose = { ...GUARD };
    p.bodyY += Math.sin(time * 6 + this.dir) * 0.012;
    let speed = 20;
    /** Vuelta hacia atrás mientras lo revolean. */
    let flip = 0;

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
    } else if (this.state === 'jump') {
      if (this.attack === 'voladora') {
        // Una pierna estirada para adelante y la otra recogida.
        Object.assign(p, { bodyRx: -0.35, lRx: -1.45, kRx: 0.05, lLx: -0.6, kLx: 1.7, aLz: 0.6, aRz: -0.6, aLx: -0.3, aRx: -0.3 });
        speed = 40;
      } else Object.assign(p, { bodyRx: 0.1, lLx: -1.0, kLx: 1.6, lRx: -0.7, kRx: 1.5, aLx: -0.5, aRx: -0.5, aLz: 0.5, aRz: -0.5, fLx: -0.8, fRx: -0.8 });
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
      } else if (this.attack === 'agarre') {
        // Los dos brazos estirados para adelante, a agarrar.
        Object.assign(p, { aLx: k(p.aLx, -1.45), aRx: k(p.aRx, -1.45), fLx: k(p.fLx, -0.2), fRx: k(p.fRx, -0.2), aLz: -0.15, aRz: 0.15, bodyRx: k(p.bodyRx, 0.3) });
      } else if (this.attack === 'vinilo') {
        // Carga el brazo atrás y lo revolea como un frisbee.
        const wind = Math.min(1, this.t / a.startup);
        const thrown = this.t >= a.startup;
        Object.assign(p, thrown ? { aRx: -1.5, aRz: 0.35, fRx: -0.1, bodyRy: 0.55, bodyRx: 0.15 } : { aRx: 0.75 * wind, aRz: -0.9 * wind, fRx: -1.2, bodyRy: -0.65 * wind });
        speed = 30;
      } else if (this.attack === 'humo') {
        // Pitada con la cabeza para atrás y después sopla para adelante.
        const blowing = this.t >= a.startup;
        Object.assign(p, { aRx: -1.25, aRz: 0.25, fRx: blowing ? -1.1 : -2.25, headRx: blowing ? 0.12 : -0.4, bodyRx: blowing ? 0.2 : -0.12 });
        speed = 18;
      } else if (this.attack === 'vomito') {
        if (this.drinking) Object.assign(p, { aRx: -1.3, aRz: 0.2, fRx: -2.3, headRx: -0.75, bodyRx: -0.22 });
        else if (this.t < a.startup) Object.assign(p, { bodyRx: 0.05, headRx: 0.35, aLx: -0.5, fLx: -1.5, aRx: -0.5, fRx: -1.5, aLz: -0.35, aRz: 0.35, bodyY: -0.03 + Math.sin(time * 40) * 0.015 });
        else Object.assign(p, { bodyRx: 0.6, headRx: 0.3, aLx: -0.6, fLx: -1.5, aRx: -0.6, fRx: -1.5, aLz: -0.35, aRz: 0.35, lLx: -0.5, kLx: 0.6 });
        speed = 18;
      } else {
        p.lRx = k(p.lRx, -1.55);
        p.kRx = k(p.kRx, this.t < a.startup ? 1.3 * (1 - out) + 0.9 * out * (1 - out) * 4 : 0.05);
        p.bodyRx = k(p.bodyRx, -0.28);
        p.bodyRy = k(0, 0.45);
        p.aLz = k(p.aLz, 0.5);
      }
    } else if (this.state === 'throwing') {
      // Lo levanta, lo pasa por arriba de la cabeza y lo suelta atrás.
      const u = Math.min(1, this.t / THROW_SECONDS);
      const arm = -1.4 - u * 2.2;
      Object.assign(p, { aLx: arm, aRx: arm, fLx: -0.2, fRx: -0.2, aLz: -0.1, aRz: 0.1, bodyRx: 0.3 - u * 0.75, headRx: -0.2 });
      speed = 30;
    } else if (this.state === 'thrown') {
      Object.assign(p, { bodyRx: 0, headRx: -0.3, aLz: 1.6, aRz: -1.6, aLx: 0, aRx: 0, fLx: -0.3, fRx: -0.3, lLx: -0.5, lRx: 0.4, kLx: 0.8, kRx: 0.6 });
      flip = -Math.min(1, this.t / THROW_SECONDS) * Math.PI * 1.5;
      speed = 30;
    } else if (this.state === 'hit') {
      Object.assign(p, { bodyRx: -0.32, headRx: -0.45, aLz: 0.85, aRz: -0.85, aLx: -0.4, aRx: -0.4, fLx: -0.6, fRx: -0.6 });
      speed = 30;
    } else if (this.state === 'down') {
      // En el piso; al final se va incorporando.
      Object.assign(p, LYING);
      if (this.t > DOWN_SECONDS * 0.55) Object.assign(p, CROUCH);
      speed = this.t > DOWN_SECONDS * 0.55 ? 9 : 40;
    } else if (this.state === 'ko') {
      // Cae de espaldas y queda despatarrado.
      Object.assign(p, LYING);
      speed = 7;
    } else if (this.state === 'win') {
      const hop = Math.abs(Math.sin(time * 7));
      Object.assign(p, { bodyY: hop * 0.12, bodyRx: 0, headRx: -0.2, aLz: 2.7 + hop * 0.2, aRz: -2.7 - hop * 0.2, aLx: 0, aRx: 0, fLx: -0.2, fRx: -0.2, lLx: 0, lRx: 0, kLx: 0, kRx: 0 });
      speed = 12;
    }

    const f = Math.min(1, dt * speed);
    for (const key of POSE_KEYS) this.pose[key] += (p[key] - this.pose[key]) * f;
    const q = this.pose, r = this.rig;
    r.root.position.set(this.x, this.y, this.z);
    // De costado, pero un poco girado hacia la cámara para que se le vea el frente.
    r.root.rotation.y = this.dir * (Math.PI / 2 - 0.38) + (this.state === 'win' ? -this.dir * 1.2 : 0);
    r.body.position.y = q.bodyY + (flip ? 0.9 : 0);
    r.body.rotation.set(q.bodyRx + flip, q.bodyRy, 0);
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
