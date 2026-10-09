/**
 * Reglas y física del fútbol de cabezones (todo en 2D: x a lo ancho de la cancha, y para arriba).
 * No sabe nada de Three.js: la escena lee este estado y lo dibuja.
 */

export const FIELD = {
  /** Línea de gol: los arcos empiezan en x = ±half. */
  half: 3.2,
  /** Fondo de la red. */
  back: 3.9,
  /** Altura del travesaño. */
  goalH: 1.9,
  ceil: 4.8,
};
export const BALL_R = 0.2;
/** Cabeza y cuerpo de un jugador, como círculos (alturas medidas desde los pies). */
export const HEAD_Y = 1.25, HEAD_R = 0.29, BODY_Y = 0.52, BODY_R = 0.25;
const FOOT_Y = 0.24, FOOT_R = 0.3, FOOT_REACH = 0.38;

// La pelota pesa: cae rápido, pica poco y rodando se frena enseguida.
const GRAVITY = 17, BALL_GRAVITY = 19;
const FLOOR_BOUNCE = 0.55, HEAD_BOUNCE = 0.45, BODY_BOUNCE = 0.22, WALL_BOUNCE = 0.6;
/** Freno de la pelota rodando (por segundo). */
const ROLL = 2.6;
const RUN = 3.5, JUMP = 6.4;
/** Al soltar el salto, la subida se corta a esta velocidad: un toque es un saltito. */
const JUMP_CUT = 2.6;
export const KICK_SECONDS = 0.26;
/** Segundos que tarda en llenarse la barra del tiro especial. */
const POWER_SECONDS = 11;
export const MATCH_SECONDS = 60;

export interface Player {
  name: string;
  /** Hacia dónde ataca: 1 = hacia la derecha (defiende el arco izquierdo). */
  dir: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Segundos desde que empezó la patada (-1 = no está pateando). */
  kickT: number;
  /** La patada actual ya tocó la pelota. */
  kicked: boolean;
  /** La patada actual es rasante. */
  low: boolean;
  /** Ya metió un cabezazo en este salto. */
  headed: boolean;
  /** Barra del tiro especial (0–1). */
  power: number;
  /** Segundos que le quedan atontado (le pegó un tiro especial). */
  stun: number;
  score: number;
  /** Cuánto corre (la CPU fácil es más lenta). */
  speed: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Giro acumulado (solo para dibujarla). */
  spin: number;
  /** Segundos que le quedan de tiro especial (vuela derecho y voltea al que la toque). */
  power: number;
  /** Quién tiró el especial (a ese no lo voltea). */
  owner: Player | null;
}

/** Lo que quiere hacer un jugador en este frame. */
export interface Controls {
  /** -1 izquierda, 1 derecha (absoluto, no depende de hacia dónde ataca). */
  move: number;
  jump: boolean;
  /** Mantenido: la patada sale rasante en vez de levantada. */
  low: boolean;
  /** Apretados en este frame (no mantenidos). */
  kick: boolean;
  special: boolean;
}
export const NO_CONTROLS: Controls = { move: 0, jump: false, low: false, kick: false, special: false };

export const newPlayer = (name: string, dir: number): Player => ({ name, dir, x: -dir * 1.8, y: 0, vx: 0, vy: 0, kickT: -1, kicked: false, low: false, headed: false, power: 0, stun: 0, score: 0, speed: 1 });
export const newBall = (): Ball => ({ x: 0, y: 2.6, vx: 0, vy: 0, spin: 0, power: 0, owner: null });

/** Saque: cada uno a su lado y la pelota cae al medio, un poco hacia el que recibió el gol. */
export function kickoff(players: Player[], ball: Ball, toward = 0) {
  for (const p of players) {
    p.x = -p.dir * 1.8;
    p.y = p.vx = p.vy = 0;
    p.kickT = -1;
    p.stun = 0;
    p.headed = false;
  }
  Object.assign(ball, newBall(), { x: toward * 0.6, vx: toward * 0.8 });
}

/** Lo que pasó en un paso de simulación, para sonidos y efectos. */
export interface StepEvents {
  /** Índice del jugador que metió el gol. */
  goal: number | null;
  kick: boolean;
  special: boolean;
  bounce: number;
  knock: boolean;
  /** Alguien metió un cabezazo (saltando hacia la pelota). */
  header: boolean;
}

function stepPlayer(p: Player, c: Controls, dt: number, ev: StepEvents, ball: Ball) {
  if (p.stun > 0) {
    p.stun -= dt;
    c = NO_CONTROLS;
  }
  p.power = Math.min(1, p.power + dt / POWER_SECONDS);
  const grounded = p.y <= 0;
  if (grounded) p.headed = false;
  if (p.stun <= 0) {
    p.vx = c.move * RUN * p.speed;
    if (c.jump && grounded) p.vy = JUMP;
    else if (!c.jump && p.vy > JUMP_CUT) p.vy = JUMP_CUT;
  }
  if (c.kick && p.kickT < 0) {
    p.kickT = 0;
    p.kicked = false;
    p.low = c.low;
  }
  if (p.kickT >= 0) {
    p.kickT += dt;
    if (p.kickT > KICK_SECONDS) p.kickT = -1;
  }
  // Tiro especial: con la barra llena y la pelota cerca, sale un misil derecho al arco.
  if (c.special && p.power >= 1 && Math.hypot(ball.x - p.x, ball.y - (p.y + 0.7)) < 1.25) {
    p.power = 0;
    ball.vx = p.dir * 13;
    ball.vy = 1.6;
    ball.x = p.x + p.dir * 0.5;
    ball.y = Math.max(ball.y, p.y + 0.6);
    ball.power = 1.3;
    ball.owner = p;
    p.kickT = 0;
    p.kicked = true;
    ev.special = true;
  }
  p.vy -= GRAVITY * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (p.y <= 0) {
    p.y = 0;
    p.vy = 0;
  }
  if (p.stun > 0 && p.y <= 0) p.vx *= Math.max(0, 1 - dt * 5);
  p.x = Math.max(-FIELD.half + 0.2, Math.min(FIELD.half - 0.2, p.x));
}

/** Choque de la pelota con un círculo que se mueve (cabeza, cuerpo): rebota y sale del medio. */
function hitCircle(ball: Ball, cx: number, cy: number, r: number, vx: number, vy: number, bounce: number) {
  const dx = ball.x - cx, dy = ball.y - cy;
  const d = Math.hypot(dx, dy), min = r + BALL_R;
  if (d >= min || d === 0) return false;
  const nx = dx / d, ny = dy / d;
  ball.x = cx + nx * min;
  ball.y = cy + ny * min;
  const rel = (ball.vx - vx) * nx + (ball.vy - vy) * ny;
  if (rel < 0) {
    ball.vx -= (1 + bounce) * rel * nx;
    ball.vy -= (1 + bounce) * rel * ny;
  }
  return true;
}

function stepBall(ball: Ball, players: Player[], dt: number, ev: StepEvents, flip: boolean) {
  const special = ball.power > 0;
  if (special) ball.power -= dt;
  // El tiro especial casi no cae.
  ball.vy -= BALL_GRAVITY * (special ? 0.15 : 1) * dt;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.spin += ball.vx * dt * 4;

  for (const p of flip ? [players[1], players[0]] : players) {
    // Pie: solo mientras dura la patada, y una vez por patada.
    if (p.kickT >= 0 && p.kickT < 0.18 && !p.kicked) {
      const fx = p.x + p.dir * FOOT_REACH, fy = p.y + FOOT_Y;
      if (Math.hypot(ball.x - fx, ball.y - fy) < FOOT_R + BALL_R) {
        p.kicked = true;
        // Según la altura a la que la agarra: de abajo sale levantada; de volea, derecha y fuerte.
        const h = Math.max(0, Math.min(1, (ball.y - p.y - 0.25) / 0.7));
        ball.vx = p.dir * (7.2 + 2.4 * h) + p.vx * 0.4;
        ball.vy = 6.4 - 3.6 * h + Math.max(0, p.vy) * 0.3;
        const foe = players.find((q) => q !== p)!;
        const gap = p.dir * (foe.x - ball.x);
        if (p.low) {
          // Rasante: fuerte y al piso. Pasa por abajo del que salta; el que está parado la tapa.
          ball.vx = p.dir * 9.8 + p.vx * 0.4;
          ball.vy = 1.6 + 1.2 * h;
        } else if (h < 0.7 && gap > 0 && gap < 3 && foe.y < 0.8) {
          // Con el rival parado adelante, la patada sale de globito: se busca el tiro más
          // bajo que le pase por arriba de la cabeza y caiga adentro del arco. Si no, la
          // pelota queda rebotando entre los dos. Saltando o retrocediendo se ataja igual.
          const toGoal = FIELD.half - p.dir * ball.x;
          const g = BALL_GRAVITY / 2;
          let lob: [number, number] = [2.4, 10];
          for (let vx = 3; vx <= 9; vx += 0.5) {
            const t1 = gap / vx, t2 = toGoal / vx;
            if (t1 < 0.12) continue;
            const vy = (HEAD_Y + HEAD_R + BALL_R + 0.1 - ball.y + g * t1 * t1) / t1;
            if (vy > 11 || ball.y + vy * t2 - g * t2 * t2 > FIELD.goalH - 0.35) continue;
            lob = [vx, vy];
            break;
          }
          ball.vx = p.dir * lob[0];
          ball.vy = lob[1];
        }
        ball.power = 0;
        ev.kick = true;
        continue;
      }
    }
    const fast = Math.hypot(ball.vx, ball.vy);
    const head = hitCircle(ball, p.x, p.y + HEAD_Y, HEAD_R, p.vx, p.vy, HEAD_BOUNCE);
    const body = !head && hitCircle(ball, p.x, p.y + BODY_Y, BODY_R, p.vx, p.vy, BODY_BOUNCE);
    if (!head && !body) continue;
    ev.bounce = Math.max(ev.bounce, fast);
    if (head && !special && p.stun <= 0) {
      const front = p.dir * (ball.x - p.x);
      if (!p.headed && p.vy > 1.2 && front > -0.12) {
        // Cabezazo: si va subiendo y la agarra de frente, sale fuerte y picado hacia el otro
        // arco. El rival parado cerca lo tapa con la cabeza; de lejos hay que ir a buscarlo.
        p.headed = true;
        ball.vx = p.dir * (4.8 + 2 * Math.min(1, p.vy / JUMP)) + p.vx * 0.3;
        ball.vy = Math.max(-1, Math.min(2, ball.vy * 0.3 + 0.5));
        ev.header = true;
      } else if (ball.y > p.y + HEAD_Y + HEAD_R * 0.8 && Math.abs(ball.vx - p.vx) < 1) {
        // Que no se le quede haciendo equilibrio arriba de la cabeza.
        ball.vx += p.dir * 8 * dt;
      }
    }
    if (special && ball.owner !== p) {
      // Le dio el misil: lo revolea para atrás y la pelota sigue de largo, más lenta.
      p.stun = 0.7;
      p.vx = -p.dir * 5.5;
      p.vy = 4;
      ball.vx = -p.dir * Math.max(6, fast * 0.6);
      ball.vy = 2;
      ball.power = 0;
      ev.knock = true;
    }
  }

  // Piso, techo y paredes.
  if (ball.y < BALL_R) {
    ball.y = BALL_R;
    if (ball.vy < -1.2) {
      ev.bounce = Math.max(ev.bounce, -ball.vy);
      ball.vx *= 0.92;
    }
    ball.vy = -ball.vy * FLOOR_BOUNCE;
    if (Math.abs(ball.vy) < 1) ball.vy = 0;
    ball.vx *= Math.exp(-ROLL * dt);
  }
  if (ball.y > FIELD.ceil - BALL_R) {
    ball.y = FIELD.ceil - BALL_R;
    ball.vy = -Math.abs(ball.vy) * 0.5;
  }
  const side = Math.sign(ball.x) || 1;
  const ax = Math.abs(ball.x);
  if (ball.y > FIELD.goalH + 0.06) {
    // Arriba del arco hay pared: la pelota vuelve a la cancha.
    if (ax > FIELD.half - BALL_R && Math.abs(ball.y - FIELD.goalH) > BALL_R) {
      ball.x = side * (FIELD.half - BALL_R);
      ball.vx = -side * Math.abs(ball.vx) * WALL_BOUNCE;
    }
  } else if (ax > FIELD.back - BALL_R) {
    // Fondo de la red: la frena.
    ball.x = side * (FIELD.back - BALL_R);
    ball.vx = -ball.vx * 0.25;
  }
  // Travesaño: un caño horizontal desde la línea de gol hasta el fondo de la red.
  if (ax > FIELD.half - BALL_R) {
    const px = side * Math.max(FIELD.half, Math.min(FIELD.back, ax));
    const dx = ball.x - px, dy = ball.y - FIELD.goalH;
    const d = Math.hypot(dx, dy), min = BALL_R + 0.05;
    if (d < min && d > 0) {
      const nx = dx / d, ny = dy / d;
      ball.x = px + nx * min;
      ball.y = FIELD.goalH + ny * min;
      const vn = ball.vx * nx + ball.vy * ny;
      if (vn < 0) {
        ball.vx -= 1.55 * vn * nx;
        ball.vy -= 1.55 * vn * ny;
        ev.bounce = Math.max(ev.bounce, -vn);
      }
    }
  }
  // Gol: la pelota pasó entera la línea, por abajo del travesaño.
  if (ax > FIELD.half + BALL_R * 0.6 && ball.y < FIELD.goalH - 0.05) {
    // El arco derecho es el que ataca el que va hacia la derecha: el gol es suyo.
    ev.goal = players.findIndex((p) => p.dir === side);
  }
}

const STEP = 1 / 180;

/** Avanza la simulación `dt` segundos en pasos cortos (la pelota rápida no atraviesa nada). */
export function simulate(players: Player[], ball: Ball, controls: Controls[], dt: number): StepEvents {
  const ev: StepEvents = { goal: null, kick: false, special: false, bounce: 0, knock: false, header: false };
  let left = Math.min(dt, 0.05);
  let first = true;
  let flip = Math.random() < 0.5;
  while (left > 1e-6 && ev.goal === null) {
    const h = Math.min(STEP, left);
    left -= h;
    players.forEach((p, i) => {
      // Los botones "apretados en este frame" valen solo en el primer paso.
      const c = controls[i];
      stepPlayer(p, first ? c : { ...c, kick: false, special: false }, h, ev, ball);
    });
    first = false;
    // No se atraviesan entre ellos.
    const [a, b] = players;
    const gap = Math.abs(b.x - a.x);
    if (gap < 0.5 && Math.abs(a.y - b.y) < 1.2) {
      const push = (0.5 - gap) / 2, s = Math.sign(b.x - a.x) || 1;
      a.x -= s * push;
      b.x += s * push;
    }
    stepBall(ball, players, h, ev, (flip = !flip));
  }
  return ev;
}

// --- CPU ---------------------------------------------------------------------------

export interface SoccerDifficulty {
  name: string;
  /** Cuánto corre respecto del jugador. */
  speed: number;
  /** Segundos entre que mira la jugada y reacciona. */
  react: number;
  /** Error al calcular dónde va a estar la pelota (metros). */
  error: number;
  /** Probabilidad de patear o saltar cuando corresponde (por decisión). */
  skill: number;
  /** ¿Usa el tiro especial? */
  special: boolean;
}

export const SOCCER_DIFFICULTIES: SoccerDifficulty[] = [
  { name: 'FACIL', speed: 0.64, react: 0.4, error: 0.65, skill: 0.4, special: false },
  { name: 'NORMAL', speed: 0.92, react: 0.14, error: 0.2, skill: 0.85, special: true },
  { name: 'DIFICIL', speed: 1, react: 0.07, error: 0.05, skill: 0.97, special: true },
];

const PATH_DT = 1 / 30, PATH_N = 42;

/** Por dónde va a pasar la pelota si nadie la toca: un punto cada PATH_DT segundos. */
function flight(ball: Ball) {
  let { x, y, vx, vy, power } = ball;
  const path: { x: number; y: number; vx: number }[] = [];
  const h = PATH_DT / 2;
  for (let k = 0; k < PATH_N; k++) {
    path.push({ x, y, vx });
    for (let s = 0; s < 2; s++) {
      vy -= BALL_GRAVITY * (power > 0 ? 0.15 : 1) * h;
      power -= h;
      x += vx * h;
      y += vy * h;
      if (y < BALL_R) {
        y = BALL_R;
        vy = -vy * FLOOR_BOUNCE;
        if (Math.abs(vy) < 1) vy = 0;
        vx *= Math.exp(-ROLL * h);
      }
      if (Math.abs(x) > FIELD.half - BALL_R && y > FIELD.goalH) {
        x = Math.sign(x) * (FIELD.half - BALL_R);
        vx = -vx * WALL_BOUNCE;
      }
    }
  }
  return path;
}

export class SoccerCpu {
  difficulty = SOCCER_DIFFICULTIES[1];
  private wait = 0;
  private targetX = 0;
  /** Segundos que le quedan de mantener apretado el salto (si lo suelta, salta menos). */
  private jumpHold = 0;
  /** Segundos que tarda en patear desde que la pelota le queda al pie. */
  private kickIn = 0;
  private low = false;
  private wantSpecial = false;

  think(dt: number, me: Player, ball: Ball, foe: Player): Controls {
    const d = this.difficulty;
    const dir = me.dir;
    me.speed = d.speed;
    this.wait -= dt;
    this.jumpHold -= dt;
    let kick = false, special = false;
    if (this.wait <= 0) {
      this.wait = d.react * (0.6 + Math.random() * 0.8);
      const err = (Math.random() - 0.5) * 2 * d.error;
      const run = RUN * d.speed;
      const grounded = me.y <= 0;
      const path = flight(ball);
      const on = Math.random() < d.skill;

      // Dónde ir a buscarla: el primer punto del vuelo al que llega. Si viene alta hacia su
      // arco, se pone abajo para cabecearla; si no, atrás de donde baja, para patearla.
      let spot = path[PATH_N - 1].x + err - dir * 0.45;
      for (let k = 0; k < PATH_N; k++) {
        const q = path[k], t = k * PATH_DT;
        const miss = err * Math.min(1, 0.3 + t);
        let x: number;
        if (q.y <= 0.7) x = q.x + miss - dir * 0.45;
        else if (t > 0.2 && q.y > 1.65 && q.y < 2.75 && -dir * q.vx > 1) x = q.x + miss - dir * 0.14;
        else continue;
        if (Math.abs(x - me.x) > run * t + 0.2) continue;
        spot = x;
        break;
      }
      // La fácil a veces se queda mirando en vez de ir a buscarla.
      if (Math.random() < d.skill + 0.35) this.targetX = spot;

      this.wantSpecial = d.special && on && me.power >= 1 && dir * (ball.x - me.x) > -0.3 && Math.hypot(ball.x - me.x, ball.y - (me.y + 0.7)) < 1.2;

      if (grounded && on) {
        // Cabecear: saltar si en un momento del salto la cabeza se cruza con la pelota.
        // No si el rival la toca antes: quedaría en el aire y le patean por abajo.
        const foeFirst = Math.abs(foe.x - ball.x) < 0.8 && ball.y - foe.y < 2.2 && !(dir * (foe.x - ball.x) > 0.35 && -dir * ball.vx > 0);
        for (let k = 2; k <= 11 && this.jumpHold <= 0 && !foeFirst; k++) {
          const q = path[k], t = k * PATH_DT;
          const hx = me.x + me.vx * t, hy = HEAD_Y + JUMP * t - (GRAVITY / 2) * t * t;
          if (q.y > 1.5 && dir * (q.x - hx) > -0.1 && Math.hypot(q.x - hx, q.y - hy) < HEAD_R + BALL_R - 0.04) this.jumpHold = 0.3;
        }
        // El rival salta a cabecear enfrente suyo: saltar también, a taparle el cabezazo.
        const ahead = dir * (foe.x - me.x);
        if (foe.vy > 1 && ahead > 0.5 && ahead < 1.6 && Math.hypot(ball.x - foe.x, ball.y - (foe.y + HEAD_Y)) < 1) this.jumpHold = 0.3;
        // Le viene el tiro vinilo: saltarlo.
        if (ball.power > 0 && ball.owner !== me && -dir * ball.vx > 6) {
          const eta = (dir * (ball.x - me.x)) / Math.abs(ball.vx);
          if (eta > 0.26 && eta < 0.45 && ball.y < 1.5) this.jumpHold = 0.4;
        }
      }
    }
    // Patear: apenas la pelota le queda al alcance del pie (con su demora de reacción).
    const reach = Math.hypot(ball.x + ball.vx * 0.04 - (me.x + dir * FOOT_REACH), ball.y + ball.vy * 0.04 - (me.y + FOOT_Y)) < FOOT_R + BALL_R - 0.05;
    if (!reach || me.kickT >= 0) this.kickIn = d.react * Math.random();
    else if ((this.kickIn -= dt) <= 0) {
      kick = Math.random() < d.skill;
      // Rasante si el rival quedó atrás de la pelota (arco libre) o está en el aire y la
      // pelota le llega a pasar por abajo antes de que caiga.
      const gap = dir * (foe.x - ball.x), eta = gap / 9.8 + 0.03;
      this.low = d.skill > 0.5 && (gap < 0 || foe.y + foe.vy * eta - (GRAVITY / 2) * eta * eta > 0.45);
      this.kickIn = d.react * (0.5 + Math.random());
    }
    if (this.wantSpecial) {
      special = true;
      this.wantSpecial = false;
    }
    // Ya cabeceó: suelta el salto para caer antes y seguir la jugada.
    if (me.headed) this.jumpHold = 0;
    // La pelota le quedó atrás (entre él y su arco): esto se mira en cada frame, en todas las
    // dificultades. Hay que volver saltándola para ponerse del otro lado; si la lleva por
    // delante caminando, la empuja con el cuerpo y se hace el gol en contra.
    const behind = dir * (ball.x - me.x) < 0.25;
    if (behind) {
      this.targetX = ball.x - dir * 0.5;
      if (dir * (ball.x - me.x) < -0.1) kick = false;
      if (me.y <= 0 && Math.abs(ball.x - me.x) < 0.8 && ball.y - me.y < 1) this.jumpHold = 0.3;
    }
    const dx = this.targetX - me.x;
    return { move: Math.abs(dx) < 0.08 ? 0 : Math.sign(dx), jump: this.jumpHold > 0, low: this.low, kick, special };
  }
}
