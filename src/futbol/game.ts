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

const GRAVITY = 17, BALL_GRAVITY = 13;
const RUN = 3.5, JUMP = 6.4;
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
  /** Apretados en este frame (no mantenidos). */
  kick: boolean;
  special: boolean;
}
export const NO_CONTROLS: Controls = { move: 0, jump: false, kick: false, special: false };

export const newPlayer = (name: string, dir: number): Player => ({ name, dir, x: -dir * 1.8, y: 0, vx: 0, vy: 0, kickT: -1, kicked: false, power: 0, stun: 0, score: 0, speed: 1 });
export const newBall = (): Ball => ({ x: 0, y: 2.6, vx: 0, vy: 0, spin: 0, power: 0, owner: null });

/** Saque: cada uno a su lado y la pelota cae al medio, un poco hacia el que recibió el gol. */
export function kickoff(players: Player[], ball: Ball, toward = 0) {
  for (const p of players) {
    p.x = -p.dir * 1.8;
    p.y = p.vx = p.vy = 0;
    p.kickT = -1;
    p.stun = 0;
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
}

function stepPlayer(p: Player, c: Controls, dt: number, ev: StepEvents, ball: Ball) {
  if (p.stun > 0) {
    p.stun -= dt;
    c = NO_CONTROLS;
  }
  p.power = Math.min(1, p.power + dt / POWER_SECONDS);
  const grounded = p.y <= 0;
  if (p.stun <= 0) p.vx = c.move * RUN * p.speed;
  if (c.jump && grounded) p.vy = JUMP;
  if (c.kick && p.kickT < 0) {
    p.kickT = 0;
    p.kicked = false;
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
        // Pelota baja: sale levantada. Pelota alta (volea): sale más derecha y fuerte.
        const high = ball.y - p.y > 0.75;
        ball.vx = p.dir * (high ? 9 : 6.6) + p.vx * 0.4;
        ball.vy = (high ? 3 : 5.6) + Math.max(0, p.vy) * 0.3;
        // Con el rival parado adelante, la patada sale de globito: se busca el tiro más
        // bajo que le pase por arriba de la cabeza y caiga adentro del arco. Si no, la
        // pelota queda rebotando entre los dos. Saltando o retrocediendo se ataja igual.
        const foe = players.find((q) => q !== p)!;
        const gap = p.dir * (foe.x - ball.x);
        if (!high && gap > 0 && gap < 3 && foe.y < 0.8) {
          const toGoal = FIELD.half - p.dir * ball.x;
          const g = BALL_GRAVITY / 2;
          let lob: [number, number] = [1.6, 8.6];
          for (let vx = 3; vx <= 9; vx += 0.5) {
            const t1 = gap / vx, t2 = toGoal / vx;
            if (t1 < 0.12) continue;
            const vy = (HEAD_Y + HEAD_R + BALL_R + 0.1 - ball.y + g * t1 * t1) / t1;
            if (vy > 9.5 || ball.y + vy * t2 - g * t2 * t2 > FIELD.goalH - 0.35) continue;
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
    const head = hitCircle(ball, p.x, p.y + HEAD_Y, HEAD_R, p.vx, p.vy, 0.62);
    const body = !head && hitCircle(ball, p.x, p.y + BODY_Y, BODY_R, p.vx, p.vy, 0.45);
    if (!head && !body) continue;
    ev.bounce = Math.max(ev.bounce, fast);
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
    if (ball.vy < -1.2) ev.bounce = Math.max(ev.bounce, -ball.vy);
    ball.vy = -ball.vy * 0.72;
    if (Math.abs(ball.vy) < 0.8) ball.vy = 0;
    ball.vx *= 0.985;
  }
  if (ball.y > FIELD.ceil - BALL_R) {
    ball.y = FIELD.ceil - BALL_R;
    ball.vy = -Math.abs(ball.vy) * 0.6;
  }
  const side = Math.sign(ball.x) || 1;
  const ax = Math.abs(ball.x);
  if (ball.y > FIELD.goalH + 0.06) {
    // Arriba del arco hay pared: la pelota vuelve a la cancha.
    if (ax > FIELD.half - BALL_R && Math.abs(ball.y - FIELD.goalH) > BALL_R) {
      ball.x = side * (FIELD.half - BALL_R);
      ball.vx = -side * Math.abs(ball.vx) * 0.8;
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
        ball.vx -= 1.7 * vn * nx;
        ball.vy -= 1.7 * vn * ny;
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
  const ev: StepEvents = { goal: null, kick: false, special: false, bounce: 0, knock: false };
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
  { name: 'FACIL', speed: 0.6, react: 0.45, error: 0.75, skill: 0.3, special: false },
  { name: 'NORMAL', speed: 0.88, react: 0.2, error: 0.3, skill: 0.75, special: true },
  { name: 'DIFICIL', speed: 1, react: 0.08, error: 0.08, skill: 0.97, special: true },
];

export class SoccerCpu {
  difficulty = SOCCER_DIFFICULTIES[1];
  private wait = 0;
  private targetX = 0;
  private wantJump = false;
  private wantKick = false;
  private wantSpecial = false;

  think(dt: number, me: Player, ball: Ball): Controls {
    const d = this.difficulty;
    me.speed = d.speed;
    this.wait -= dt;
    let kick = false, special = false, jump = false;
    if (this.wait <= 0) {
      this.wait = d.react * (0.6 + Math.random() * 0.8);
      const err = (Math.random() - 0.5) * 2 * d.error;
      // Dónde va a estar la pelota en un ratito.
      const bx = ball.x + ball.vx * 0.22 + err;
      const ahead = me.dir * (bx - me.x);
      // Ponerse atrás de la pelota (del lado de su arco) para empujarla hacia el otro.
      // La fácil a veces se queda mirando en vez de ir a buscarla.
      if (Math.random() < d.skill + 0.35) this.targetX = bx - me.dir * 0.42;
      const near = Math.abs(ball.x - me.x);
      const rel = ball.y - me.y;
      this.wantKick = ahead > -0.1 && ahead < 0.85 && rel < 1.0 && Math.random() < d.skill;
      // Saltar a cabecear si viene alta y cerca, o a taparla si le pasa por arriba.
      this.wantJump = me.y <= 0 && near < 0.9 && rel > 1.35 && rel < 3 && ball.vy < 2 && Math.random() < d.skill;
      this.wantSpecial = d.special && me.power >= 1 && ahead > 0 && ahead < 1 && rel < 1.4 && Math.random() < d.skill;
    }
    if (this.wantKick) {
      kick = true;
      this.wantKick = false;
    }
    if (this.wantSpecial) {
      special = true;
      this.wantSpecial = false;
    }
    if (this.wantJump) {
      jump = true;
      this.wantJump = false;
    }
    // La pelota le quedó atrás (entre él y su arco): esto se mira en cada frame, en todas las
    // dificultades. Hay que volver saltándola para ponerse del otro lado; si la lleva por
    // delante caminando, la empuja con el cuerpo y se hace el gol en contra.
    const behind = me.dir * (ball.x - me.x) < 0.25;
    if (behind) {
      this.targetX = ball.x - me.dir * 0.5;
      kick = false;
      if (me.y <= 0 && Math.abs(ball.x - me.x) < 0.8 && ball.y - me.y < 1) jump = true;
    }
    const dx = this.targetX - me.x;
    return { move: Math.abs(dx) < 0.08 ? 0 : Math.sign(dx), jump, kick, special };
  }
}
