/**
 * Pasos de baile de los raros. Cada paso es una función del tiempo en beats: no hay animaciones
 * guardadas, así que se pueden agregar pasos sin pesar nada y exportarlos cuadro por cuadro.
 * El índice es el de LOOK.baile (agregar siempre al final).
 *
 * Convenciones del esqueleto: el personaje mira a +z y el brazo izquierdo está en +x.
 * Hombros y caderas: x negativo = hacia adelante; z = hacia afuera (positivo en el lado izquierdo).
 * Codos: negativo = se dobla hacia adelante. Rodillas: positivo = la canilla va para atrás.
 */
export interface Pose {
  /** Salto (metros, antes de la escala del personaje). */
  hop: number;
  /** Giro extra de todo el cuerpo. */
  yaw: number;
  /** Inclinación hacia adelante y hacia el costado. */
  lean: number;
  roll: number;
  /** Paso al costado (metros). */
  sway: number;
  headRx: number;
  headRy: number;
  aLx: number;
  aLz: number;
  aRx: number;
  aRz: number;
  eL: number;
  eR: number;
  tL: number;
  tR: number;
  tLz: number;
  tRz: number;
  kL: number;
  kR: number;
}

/**
 * No son pasos de baile: es lo que hace la gente de la fila de afuera mientras espera.
 * Van de 100 para arriba (cada uno a su tiempo, no al compás).
 */
export const EN_LA_FILA = 100, CHARLANDO = 101, FUMANDO = 102, ESPERANDO = 103;

export const makePose = (): Pose => ({ hop: 0, yaw: 0, lean: 0, roll: 0, sway: 0, headRx: 0, headRy: 0, aLx: 0, aLz: 0, aRx: 0, aRz: 0, eL: 0, eR: 0, tL: 0, tR: 0, tLz: 0, tRz: 0, kL: 0, kR: 0 });

const TAU = Math.PI * 2;

/** Lo que un raro puede hacer en la pista además de bailar (el visitante con una tecla; los demás, cuando les pinta). */
export const PUCHO = 1, AGUA = 2, SALUDO = 3, SALTO = 4, PASTI = 5;
/** Cuánto dura cada una (segundos). */
export const ACTION_SECONDS = [0, 5.2, 3.6, 2.4, 1.5, 1.7];

/** Sube de 0 a 1 y vuelve, entre `a` y `b` (con los bordes suaves). */
const pulse = (x: number, a: number, b: number, edge = 0.12) => Math.max(0, Math.min(1, (x - a) / edge, (b - x) / edge));

/**
 * Una acción encima del baile (y del caminar: se puede fumar caminando).
 * @param t segundos desde que arrancó
 */
export function action(p: Pose, kind: number, t: number) {
  const dur = ACTION_SECONDS[kind];
  // Entra y sale de a poco.
  const w = Math.max(0, Math.min(1, t / 0.25, (dur - t) / 0.3));
  const mix = (from: number, to: number) => from + (to - from) * w;
  if (kind === PUCHO || kind === AGUA || kind === PASTI) {
    // La mano derecha va a la boca: dos pitadas, un trago largo con la cabeza para atrás, o
    // la pasti, que es un gesto corto y la cabeza bien para atrás para tragarla.
    const m = kind === PUCHO ? pulse((t % 2.6) / 2.6, 0.12, 0.5) : kind === AGUA ? pulse(t / dur, 0.15, 0.82, 0.14) : pulse(t / dur, 0.1, 0.6, 0.14);
    p.aRx = mix(p.aRx, -(0.45 + 0.62 * m));
    // (Hacia adentro: la mano tiene que llegar a la boca, no quedar frente al hombro.)
    p.aRz = mix(p.aRz, -0.1 + 0.6 * m);
    p.eR = mix(p.eR, -(0.5 + 1.75 * m));
    if (kind === AGUA) p.headRx = mix(p.headRx, -0.5 * m);
    if (kind === PASTI) p.headRx = mix(p.headRx, -0.7 * pulse(t / dur, 0.4, 0.9, 0.16));
  } else if (kind === SALUDO) {
    const wave = Math.sin(t * 13);
    p.aRx = mix(p.aRx, 0);
    p.aRz = mix(p.aRz, -(2.45 + 0.28 * wave));
    p.eR = mix(p.eR, -0.25 - 0.3 * Math.max(0, wave));
    p.headRy = mix(p.headRy, 0);
  } else if (kind === SALTO) {
    // Se agacha, salta con los brazos arriba y cae.
    const u = t / dur;
    const air = pulse(u, 0.28, 0.82, 0.2), squat = Math.max(pulse(u, 0, 0.32, 0.14), pulse(u, 0.8, 1, 0.1)) * 0.9;
    p.hop = mix(p.hop, Math.sin(Math.PI * Math.max(0, Math.min(1, (u - 0.28) / 0.54))) * 0.6);
    p.kL = mix(p.kL, squat);
    p.kR = mix(p.kR, squat);
    p.tL = mix(p.tL, -squat * 0.5);
    p.tR = mix(p.tR, -squat * 0.5);
    p.aLz = mix(p.aLz, 0.1 + 2.5 * air);
    p.aRz = mix(p.aRz, -0.1 - 2.5 * air);
    p.aLx = mix(p.aLx, 0);
    p.aRx = mix(p.aRx, 0);
    p.sway = mix(p.sway, 0);
  }
}

/**
 * Caminar: mezcla el paso de baile con un ciclo de pasos de verdad (una pierna adelante y la
 * otra atrás, la rodilla que se dobla al pasar, los brazos al revés que las piernas).
 * @param phase por dónde va el ciclo (2π = dos pasos); avanza con lo que se camina, no con el tiempo
 * @param w cuánto pesa el caminar (0 = solo baile, 1 = solo camina)
 * @param amp qué tan largo es el paso (radianes de la pierna)
 */
export function stride(p: Pose, phase: number, w: number, amp: number) {
  const s = Math.sin(phase), c = Math.cos(phase), k = 1 - w;
  // Las piernas son todas del caminar; los brazos conservan algo del baile.
  const a = w * 0.7, ka = 1 - a;
  p.tL = p.tL * k - s * amp * w;
  p.tR = p.tR * k + s * amp * w;
  p.kL = p.kL * k + Math.max(0, c) * amp * 1.5 * w;
  p.kR = p.kR * k + Math.max(0, -c) * amp * 1.5 * w;
  p.tLz *= k;
  p.tRz *= k;
  p.aLx = p.aLx * ka + s * amp * 0.9 * a;
  p.aRx = p.aRx * ka - s * amp * 0.9 * a;
  p.aLz = p.aLz * ka + 0.1 * a;
  p.aRz = p.aRz * ka - 0.1 * a;
  p.eL = p.eL * ka - 0.45 * a;
  p.eR = p.eR * ka - 0.45 * a;
  p.hop = p.hop * k + Math.abs(s) * 0.03 * w;
  p.sway *= k;
  p.yaw *= k;
  p.roll = p.roll * k + s * 0.03 * w;
  p.lean = p.lean * k + amp * 0.14 * w;
}

/**
 * @param kind índice de LOOK.baile
 * @param f tiempo en beats
 * @param e energía: 0 = parado, 1 = bailando a full
 */
export function dance(kind: number, f: number, e: number, p: Pose) {
  const s = Math.sin(Math.PI * f);
  const hop01 = Math.abs(s);
  const w = Math.sin(TAU * f);
  const up = Math.max(0, s), dn = Math.max(0, -s);
  p.hop = p.yaw = p.lean = p.roll = p.sway = p.headRx = p.headRy = 0;
  p.aLx = p.aRx = p.tL = p.tR = p.tLz = p.tRz = p.kL = p.kR = 0;
  p.aLz = 0.1;
  p.aRz = -0.1;
  p.eL = p.eR = -0.15;
  /** Flexión pareja de las dos piernas (la cadera compensa para que los pies queden abajo). */
  const squat = (k: number) => {
    p.kL = p.kR = k;
    p.tL = p.tR = -k * 0.5;
  };
  switch (kind) {
    case 1: // manos arriba
      p.hop = hop01 * 0.07;
      p.aLz = 0.1 + (2.55 + 0.25 * w) * e;
      p.aRz = -0.1 - (2.55 + 0.25 * w) * e;
      p.eL = p.eR = -0.15 - 0.35 * Math.max(0, w) * e;
      p.headRx = -0.15 * e;
      squat((1 - hop01) * 0.3 * e);
      break;
    case 2: // puño
      p.hop = hop01 * 0.1;
      p.aRz = -0.1 - 2.2 * e;
      p.eR = -0.2 - 1.1 * (1 - hop01) * e;
      p.aLx = -0.35 * e;
      p.eL = -1.3 * e;
      p.headRx = 0.2 * hop01 * e;
      squat((1 - hop01) * 0.35 * e);
      break;
    case 3: { // robot: poses duras que cambian con cada beat
      const step = ((Math.floor(f) % 4) + 4) % 4;
      const k = Math.min(1, (f - Math.floor(f)) * 6);
      // [hombro izq x, codo izq, hombro der x, codo der]
      const P = [[-1.5, 0, 0, -1.5], [0, -1.5, -1.5, 0], [-1.5, -1.5, 0, 0], [0, 0, -1.5, -1.5]];
      const from = P[(step + 3) % 4], to = P[step];
      const mix = (j: number) => (from[j] + (to[j] - from[j]) * k) * e;
      p.aLx = mix(0);
      p.eL = mix(1);
      p.aRx = mix(2);
      p.eR = mix(3);
      p.yaw = [0.35, 0, -0.35, 0][step] * e;
      p.headRx = step % 2 ? 0.15 * e : 0;
      break;
    }
    case 4: // cabeceo
      p.hop = hop01 * 0.03;
      p.headRx = 0.55 * Math.max(0, w) * e;
      p.lean = 0.12 * e;
      p.aLx = p.aRx = -0.3 * e;
      p.eL = p.eR = -1.1 * e;
      squat(Math.max(0, w) * 0.4 * e);
      break;
    case 5: // shuffle: rodilla arriba y la otra pierna patina para atrás
      p.hop = hop01 * 0.06;
      p.lean = 0.1 * e;
      p.tL = (-1.0 * up + 0.3 * dn) * e;
      p.kL = 1.5 * up * e;
      p.tR = (-1.0 * dn + 0.3 * up) * e;
      p.kR = 1.5 * dn * e;
      p.aLx = 0.7 * s * e;
      p.aRx = -0.7 * s * e;
      p.eL = p.eR = -1.2 * e;
      break;
    case 6: // pasito: un paso a cada lado
      p.hop = hop01 * 0.04;
      p.sway = 0.13 * s * e;
      p.roll = -0.07 * s * e;
      p.headRy = 0.25 * s * e;
      squat((1 - hop01) * 0.25 * e);
      p.tLz = 0.18 * up * e;
      p.tRz = -0.18 * dn * e;
      p.aLx = (-0.2 + 0.25 * w) * e;
      p.aRx = (-0.2 - 0.25 * w) * e;
      p.eL = p.eR = -1.3 * e;
      break;
    case 7: { // molino: los brazos dan la vuelta entera
      const a = (f * Math.PI) % TAU;
      const k = Math.min(1, e * 1.3);
      p.hop = hop01 * 0.06;
      p.aLx = -a * k;
      p.aRx = -((a + Math.PI) % TAU) * k;
      p.aLz = 0.25;
      p.aRz = -0.25;
      p.eL = p.eR = -0.1;
      p.headRx = -0.1 * e;
      squat((1 - hop01) * 0.25 * e);
      break;
    }
    case 8: // twist: la cadera para un lado y la cabeza queda mirando al frente
      p.hop = hop01 * 0.03;
      p.yaw = 0.55 * s * e;
      p.headRy = -0.5 * s * e;
      p.roll = 0.05 * w * e;
      p.lean = 0.08 * e;
      p.aLx = (-0.2 + 0.45 * s) * e;
      p.aRx = (-0.2 - 0.45 * s) * e;
      p.eL = p.eR = -1.4 * e;
      squat((0.45 + 0.2 * hop01) * e);
      break;
    case 9: // avioncito
      p.hop = hop01 * 0.05;
      p.aLz = 0.1 + (1.47 + 0.45 * s) * e;
      p.aRz = -0.1 - (1.47 - 0.45 * s) * e;
      p.eL = p.eR = -0.05;
      p.roll = 0.16 * s * e;
      p.headRy = -0.2 * s * e;
      p.tL = 0.2 * s * e;
      p.tR = -0.2 * s * e;
      p.kL = dn * 0.4 * e;
      p.kR = up * 0.4 * e;
      break;
    case 10: // pogo: saltar derecho, sin mover los brazos
      p.hop = hop01 ** 0.6 * 0.34 * e;
      p.aLz = 0.04;
      p.aRz = -0.04;
      p.eL = p.eR = 0;
      p.headRx = -0.25 * hop01 * e;
      p.yaw = 0.15 * Math.sin(Math.PI * f * 0.5) * e;
      squat((1 - hop01) ** 2 * 0.7 * e);
      break;
    case 11: // helicóptero: una vuelta entera cada 4 beats
      p.hop = hop01 * 0.05;
      p.yaw = (TAU * f) / 4;
      p.aLz = 0.1 + 1.45 * e;
      p.aRz = -0.1 - 1.45 * e;
      p.eL = p.eR = -0.1;
      p.roll = 0.06 * w * e;
      p.headRx = -0.1 * e;
      break;
    case 12: // sentadilla
      p.lean = 0.3 * e;
      p.headRx = -0.25 * e;
      p.kL = p.kR = (0.9 + 0.55 * (1 - hop01)) * e;
      p.tL = p.tR = -p.kL * 0.62;
      p.tLz = 0.22 * e;
      p.tRz = -0.22 * e;
      p.aLx = p.aRx = -0.75 * e;
      p.eL = p.eR = -0.5 * e;
      break;
    case 13: // tieso: no mueve más que la cabeza y un pie
      p.hop = hop01 * 0.012;
      p.lean = -0.04 * e;
      p.aLz = 0.03;
      p.aRz = -0.03;
      p.eL = p.eR = 0;
      p.headRy = 0.14 * Math.sin(TAU * f * 2) * e;
      p.tR = -0.12 * Math.max(0, w) * e;
      p.kR = 0.2 * Math.max(0, w) * e;
      break;
    case 14: // zombie
      p.lean = 0.12 * e;
      p.roll = 0.12 * s * e;
      p.sway = 0.05 * s * e;
      p.headRx = 0.25 * e;
      p.headRy = 0.3 * Math.sin(Math.PI * f * 0.5) * e;
      p.aLx = (-1.45 + 0.15 * s) * e;
      p.aRx = (-1.45 - 0.15 * s) * e;
      p.eL = p.eR = -0.1;
      p.tL = 0.25 * s * e;
      p.tR = -0.25 * s * e;
      break;
    case 15: { // travolta: el brazo derecho apunta arriba y abajo, cambia cada 2 beats
      const half = f / 2;
      const step = ((Math.floor(half) % 2) + 2) % 2;
      const k = Math.min(1, (half - Math.floor(half)) * 8);
      // [hombro der z, hombro der x, paso al costado, inclinación, cabeza]
      const P = [[-2.5, 0, -0.08, -0.07, -0.35], [0.55, -0.6, 0.08, 0.07, 0.35]];
      const from = P[1 - step], to = P[step];
      const mix = (j: number) => (from[j] + (to[j] - from[j]) * k) * e;
      p.hop = hop01 * 0.04;
      p.aRz = -0.1 * (1 - e) + mix(0);
      p.aRx = mix(1);
      p.eR = -0.05;
      p.sway = mix(2);
      p.roll = mix(3);
      p.headRy = mix(4);
      p.aLz = 0.1 + 0.5 * e;
      p.eL = -1.5 * e;
      squat((1 - hop01) * 0.25 * e);
      break;
    }
    case EN_LA_FILA:
      // El celu en la derecha, a la altura del pecho; la cabeza gacha y el pulgar que no para.
      p.aRx = -0.5;
      p.aRz = -0.02;
      p.eR = -1.78 + 0.03 * Math.sin(f * 9);
      p.aLx = 0.08;
      p.aLz = 0.12;
      p.eL = -0.2;
      p.headRx = 0.46 + 0.04 * Math.sin(f * 0.9);
      p.headRy = -0.06;
      // Cambia el peso de una pierna a la otra, despacio.
      p.roll = 0.035 * Math.sin(f * 0.45);
      p.sway = 0.02 * Math.sin(f * 0.45);
      p.kL = 0.12 * Math.max(0, Math.sin(f * 0.45));
      p.tL = -0.06 * Math.max(0, Math.sin(f * 0.45));
      break;
    case CHARLANDO: {
      // Habla de a ratos (gesticula con la derecha) y de a ratos escucha (asiente).
      const talk = Math.max(0, Math.sin(f * 0.42)), listen = 1 - talk;
      p.aRx = -0.35 - 0.45 * talk + 0.2 * talk * Math.sin(f * 2.3);
      p.aRz = -0.15 - 0.25 * talk * Math.max(0, Math.sin(f * 1.7));
      p.eR = -0.5 - 0.9 * talk + 0.35 * talk * Math.sin(f * 3.1);
      // La izquierda en la cintura.
      p.aLz = 0.55;
      p.aLx = 0.15;
      p.eL = -1.25;
      p.headRx = 0.05 + 0.1 * listen * Math.max(0, Math.sin(f * 2.6));
      p.headRy = 0.12 * Math.sin(f * 0.8);
      p.lean = 0.05 * talk;
      p.roll = 0.03 * Math.sin(f * 0.5);
      p.sway = 0.02 * Math.sin(f * 0.5);
      break;
    }
    case FUMANDO: {
      // Cada tanto se lleva el pucho a la boca, pita, y larga el humo mirando para arriba.
      const c = (((f * 0.17) % 1) + 1) % 1;
      const bump = (a: number, b: number) => (c < a || c > b ? 0 : Math.sin(((c - a) / (b - a)) * Math.PI));
      const drag = Math.min(1, bump(0, 0.26) * 1.6), out = bump(0.24, 0.5);
      p.aRx = -0.12 - 0.95 * drag;
      p.aRz = -0.08 + 0.1 * drag;
      p.eR = -0.3 - 1.95 * drag;
      p.headRx = 0.06 * drag - 0.22 * out;
      p.headRy = 0.25 * Math.sin(f * 0.3);
      // La otra mano en el bolsillo.
      p.aLx = 0.12;
      p.aLz = 0.16;
      p.eL = -0.35;
      p.roll = -0.04 + 0.02 * Math.sin(f * 0.4);
      p.kR = 0.14;
      p.tR = -0.07;
      break;
    }
    case ESPERANDO:
      // Manos en los bolsillos, mira para todos lados y golpetea el piso con un pie.
      p.aLx = p.aRx = 0.14;
      p.aLz = 0.2;
      p.aRz = -0.2;
      p.eL = p.eR = -0.45;
      p.headRy = 0.55 * Math.sin(f * 0.37) + 0.15 * Math.sin(f * 1.3);
      p.headRx = 0.05 * Math.sin(f * 0.6);
      p.tR = -0.16 * Math.max(0, Math.sin(f * 4.4));
      p.kR = 0.22 * Math.max(0, Math.sin(f * 4.4));
      p.roll = 0.025 * Math.sin(f * 0.33);
      break;
    default: // saltito
      p.hop = hop01 * 0.14;
      p.aLx = 0.5 * s * e;
      p.aRx = -0.5 * s * e;
      p.eL = p.eR = -0.9 * e;
      p.tL = 0.3 * s * e;
      p.tR = -0.3 * s * e;
      p.kL = dn * 0.6 * e;
      p.kR = up * 0.6 * e;
      p.headRx = 0.1 * w * e;
  }
  if (kind !== 10) p.hop *= e;
}
