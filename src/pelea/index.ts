import * as THREE from 'three';
import { loadGlbRig } from '../characters/glbRig';
import { type Rig, buildBoxRig } from '../characters/rig';
import type { BoilerRoom } from '../scenes/boiler';
import { DISCOS_COLORS, RAROS_COLORS } from '../scenes/boiler/djs';
import { DR, DR_CYCLE, type PSXStage, blip, box, makePSXMaterial, outlined, titleUnit } from '../style-kit';
import { Cpu } from './cpu';
import { ARENA_HALF, ATTACKS, Fighter, MAX_HP, NO_INTENT } from './fighter';
import { PlayerInput } from './input';

/**
 * DISCOS VS RAROS: pelea 1 contra la CPU, estilo Tekken 1, en la pista del boiler room
 * (la gente y la tele quedan de fondo). Al mejor de 3 rounds de 60 segundos.
 */

const ARENA_Z = 4.35;
const ROUND_SECONDS = 60;
const WINS_TO_MATCH = 2;
const MIN_GAP = 0.78;

type Phase = 'select' | 'intro' | 'fight' | 'ko' | 'end';

async function loadRig(file: string, fallback: Parameters<typeof buildBoxRig>[0]): Promise<Rig> {
  try {
    return await loadGlbRig(`${import.meta.env.BASE_URL}models/${file}`);
  } catch {
    return buildBoxRig(fallback);
  }
}

export interface Pelea {
  /** Termina la pelea y devuelve la pista a como estaba. */
  stop(): void;
}

export async function startPelea(stage: PSXStage, room: BoilerRoom, onExit: () => void): Promise<Pelea> {
  const [rigA, rigB] = await Promise.all([loadRig('discos.glb', DISCOS_COLORS), loadRig('raros.glb', RAROS_COLORS)]);
  const fighters = [new Fighter('DISCOS', rigA, ARENA_Z), new Fighter('RAROS', rigB, ARENA_Z)] as const;
  const group = new THREE.Group();
  group.add(rigA.root, rigB.root);
  // Sombras falsas y chispa del golpe.
  const shadowMat = makePSXMaterial({ color: '#000000', lit: false, opacity: 0.45 });
  const shadows = fighters.map(() => {
    const s = new THREE.Mesh(new THREE.CircleGeometry(0.42, 8), shadowMat);
    s.rotation.x = -Math.PI / 2;
    s.renderOrder = 1;
    group.add(s);
    return s;
  });
  const spark = box(0.34, 0.34, 0.34, makePSXMaterial({ color: DR.amarillo, lit: false }));
  spark.visible = false;
  group.add(spark);
  room.scene.add(group);

  const input = new PlayerInput();
  const cpu = new Cpu();
  let player = 0;
  let phase: Phase = 'select';
  let phaseT = 0;
  let round = 1;
  let clock = ROUND_SECONDS;
  let hitstop = 0;
  let shake = 0;
  let sparkT = 0;
  let playerWon = false;
  const camPos = new THREE.Vector3(0, 1.5, ARENA_Z + 5);
  const camTarget = new THREE.Vector3(0, 1.15, ARENA_Z);

  const setPhase = (p: Phase) => {
    phase = p;
    phaseT = 0;
  };
  const placeFighters = () => {
    fighters[0].reset(-1.5, 1);
    fighters[1].reset(1.5, -1);
  };
  const newMatch = () => {
    round = 1;
    fighters[0].wins = fighters[1].wins = 0;
    cpu.level = 0;
    startRound();
  };
  const startRound = () => {
    placeFighters();
    clock = ROUND_SECONDS;
    setPhase('intro');
    blip(440, 0.12);
  };
  const endRound = (winner: Fighter | null) => {
    if (winner) {
      winner.wins++;
      if (winner.state !== 'ko') winner.state = 'win';
    }
    setPhase('ko');
    blip(220, 0.5, 'sawtooth', 0.09);
    blip(110, 0.7, 'sawtooth', 0.09, 0.12);
  };
  placeFighters();

  /** Si el golpe de `a` conecta con `b` en este frame. */
  const resolve = (a: Fighter, b: Fighter) => {
    if (!a.striking || b.state === 'ko') return;
    const atk = ATTACKS[a.attack!];
    if (Math.abs(b.x - a.x) > atk.range) return;
    // El golpe alto pasa por arriba del que está agachado.
    if (atk.level === 'alto' && b.low) return;
    a.landed = true;
    const from = Math.sign(b.x - a.x) || a.dir;
    const y = atk.level === 'bajo' ? 0.55 : atk.level === 'medio' ? 1.0 : 1.45;
    spark.position.set(b.x - from * 0.25, y, ARENA_Z + 0.3);
    spark.visible = true;
    sparkT = 0.12;
    if (b.blocks(atk.level)) {
      b.takeBlock(atk, from);
      (spark.material as ReturnType<typeof makePSXMaterial>).uniforms.uColor.value.set(DR.crema);
      blip(520, 0.05, 'square', 0.06);
      hitstop = 0.04;
    } else {
      b.takeHit(atk, from);
      (spark.material as ReturnType<typeof makePSXMaterial>).uniforms.uColor.value.set(atk.damage > 10 ? DR.rojo : DR.amarillo);
      blip(150, 0.14, 'sawtooth', 0.14);
      blip(70, 0.18, 'square', 0.12, 0.02);
      hitstop = atk.damage > 10 ? 0.11 : 0.07;
      shake = atk.damage > 10 ? 0.16 : 0.08;
      if (b.hp <= 0) endRound(a);
    }
  };

  const update = (t: number, dt: number) => {
    input.poll(dt);
    phaseT += dt;
    const [a, b] = fighters;
    const me = fighters[player], foe = fighters[1 - player];

    if (phase === 'select') {
      const step = input.takeStep();
      if (step) {
        player = step < 0 ? 0 : 1;
        blip(1320, 0.03, 'square', 0.04);
      }
      if (phaseT > 0.3 && input.takeConfirm()) {
        blip(880, 0.1);
        newMatch();
      }
    } else if (phase === 'intro') {
      input.takeConfirm();
      if (phaseT > 2.1) {
        setPhase('fight');
        blip(990, 0.25, 'square', 0.07);
      }
    } else if (phase === 'fight') {
      if (hitstop > 0) hitstop -= dt;
      else {
        clock -= dt;
        me.update(dt, input.intent(me.dir, me.state === 'idle'), foe);
        foe.update(dt, cpu.think(dt, foe, me), me);
        // No se atraviesan: si quedan encimados, se separan parejo.
        const gap = Math.abs(b.x - a.x);
        if (gap < MIN_GAP) {
          const push = (MIN_GAP - gap) / 2, s = Math.sign(b.x - a.x) || 1;
          a.x = Math.max(-ARENA_HALF, a.x - s * push);
          b.x = Math.min(ARENA_HALF, b.x + s * push);
        }
        resolve(a, b);
        resolve(b, a);
        if (phase === 'fight' && clock <= 0) {
          clock = 0;
          // Se acabó el tiempo: gana el que tiene más vida.
          endRound(a.hp === b.hp ? null : a.hp > b.hp ? a : b);
        }
      }
    } else if (phase === 'ko') {
      a.update(dt, NO_INTENT, b);
      b.update(dt, NO_INTENT, a);
      if (phaseT > 3) {
        const champ = fighters.find((f) => f.wins >= WINS_TO_MATCH);
        if (champ) {
          playerWon = champ === me;
          setPhase('end');
          if (playerWon) [660, 880, 1100, 1320].forEach((f, i) => blip(f, 0.14, 'square', 0.06, i * 0.12));
          else blip(98, 1, 'sawtooth', 0.08);
        } else {
          round++;
          cpu.level = round - 1;
          startRound();
        }
      }
    } else if (phase === 'end') {
      const left = 9.99 - phaseT;
      if (phaseT > 0.8 && input.takeConfirm()) newMatch();
      else if (left <= 0) onExit();
    }

    for (const f of fighters) f.applyPose(dt, t);
    shadows.forEach((s, i) => s.position.set(fighters[i].x, 0.02, ARENA_Z));
    if (sparkT > 0) {
      sparkT -= dt;
      spark.rotation.z += dt * 20;
      spark.scale.setScalar(0.45 + (0.12 - sparkT) * 5);
      if (sparkT <= 0) spark.visible = false;
    }

    // Cámara de costado: sigue el punto medio y se aleja cuando se separan.
    const mid = (a.x + b.x) / 2, gap = Math.abs(a.x - b.x);
    shake = Math.max(0, shake - dt);
    const sx = shake > 0 ? Math.sin(t * 90) * shake * 0.5 : 0;
    const sy = shake > 0 ? Math.sin(t * 70) * shake * 0.4 : 0;
    const k = Math.min(1, dt * 5);
    const select = phase === 'select';
    camPos.lerp(new THREE.Vector3(mid * 0.85 + Math.sin(t * 0.3) * 0.25, select ? 1.35 : 1.5, ARENA_Z + (select ? 3.4 : 2.9 + gap * 0.5)), k);
    camTarget.lerp(new THREE.Vector3(mid, 1.1, ARENA_Z), k);
    stage.camera.position.set(camPos.x + sx, camPos.y + sy, camPos.z);
    stage.camera.lookAt(camTarget);
    if (stage.camera.fov !== 46) {
      stage.camera.fov = 46;
      stage.camera.updateProjectionMatrix();
    }
  };

  /** Texto grande centrado, agrandado desde el medio. */
  const big = (ctx: CanvasRenderingContext2D, w: number, y: number, s: string, size: number, scale: number, fill: string | CanvasGradient, shadow?: string) => {
    ctx.save();
    ctx.translate(Math.round(w / 2), Math.round(y));
    ctx.scale(scale, scale);
    outlined(ctx, s, 0, 0, size, fill, shadow);
    ctx.restore();
  };

  const drawOverlay = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    const unit = titleUnit(w, h);
    ctx.textBaseline = 'middle';
    const [a, b] = fighters;

    if (phase === 'select') {
      ctx.textAlign = 'center';
      outlined(ctx, 'DISCOS VS RAROS', w / 2, unit * 3, unit * 2, DR.amarillo, DR.rojo);
      outlined(ctx, 'ELEGI TU PELEADOR', w / 2, unit * 6, unit, DR.crema);
      const blink = Math.floor(t * 4) % 2 === 0;
      fighters.forEach((f, i) => {
        const x = w / 2 + (i ? 1 : -1) * w * 0.2;
        const on = i === player;
        if (on && blink) outlined(ctx, 'V', x, h * 0.3, unit, DR.rojo);
        outlined(ctx, on ? `1P ${f.name}` : f.name, x, h * 0.86, unit, on ? DR.amarillo : DR.rosa);
      });
      outlined(ctx, '< >  ENTER', w / 2, h * 0.94, unit, DR.crema);
      return;
    }

    // --- Barras de vida, reloj y rounds ganados ---
    const barW = Math.floor(w / 2 - unit * 4.5), barH = unit, y = unit * 1.5;
    fighters.forEach((f, i) => {
      const x0 = i ? w - unit - barW : unit;
      ctx.fillStyle = DR.negro;
      ctx.fillRect(x0 - 2, y - 2, barW + 4, barH + 4);
      ctx.fillStyle = DR.rojoOscuro;
      ctx.fillRect(x0, y, barW, barH);
      const fill = Math.round((barW * f.hp) / MAX_HP);
      ctx.fillStyle = f.hp > 30 ? DR.amarillo : Math.floor(t * 8) % 2 ? DR.rojo : DR.amarillo;
      // La barra se vacía hacia el centro de la pantalla.
      ctx.fillRect(i ? x0 : x0 + barW - fill, y, fill, barH);
      ctx.textAlign = i ? 'right' : 'left';
      outlined(ctx, i === player ? `1P ${f.name}` : f.name, i ? w - unit : unit, y + barH + unit, unit, DR.crema);
      for (let n = 0; n < WINS_TO_MATCH; n++) {
        const wx = i ? x0 + n * (unit + 2) : x0 + barW - unit - n * (unit + 2);
        ctx.fillStyle = DR.negro;
        ctx.fillRect(wx - 1, y + barH + unit * 2 - 1, unit + 2, unit / 2 + 2);
        ctx.fillStyle = n < f.wins ? DR.rojo : '#33303a';
        ctx.fillRect(wx, y + barH + unit * 2, unit, unit / 2);
      }
    });
    ctx.textAlign = 'center';
    outlined(ctx, String(Math.ceil(clock)).padStart(2, '0'), w / 2, y + unit * 0.6, unit * 2, clock < 10 ? DR.rojo : DR.crema);

    const cy = h * 0.45;
    if (phase === 'intro') {
      if (phaseT < 1.3) big(ctx, w, cy, `ROUND ${round}`, unit * 2, Math.min(1, phaseT * 5) * 1.2, DR.amarillo, DR.rojo);
      else big(ctx, w, cy, 'FIGHT!', unit * 2, 1.2 + Math.max(0, 1.6 - phaseT) * 3, DR.rojo, DR.amarillo);
    } else if (phase === 'fight' && phaseT < 0.35) {
      big(ctx, w, cy, 'FIGHT!', unit * 2, 1.2, DR.rojo, DR.amarillo);
    } else if (phase === 'ko') {
      const ko = a.state === 'ko' || b.state === 'ko';
      const text = ko ? 'K.O.' : a.hp === b.hp ? 'EMPATE' : 'TIME UP';
      const pop = 1.6 + Math.max(0, 0.25 - phaseT) * 8;
      if (phaseT < 1.6) big(ctx, w, cy, text, unit * 2, pop, DR.rojo, DR.crema);
      else {
        const winner = fighters.find((f) => f.state === 'win') ?? (a.state === 'ko' ? b : b.state === 'ko' ? a : null);
        if (winner) big(ctx, w, cy, `${winner.name} GANA`, unit * 2, 1, DR.amarillo, DR.rojo);
      }
    } else if (phase === 'end') {
      const left = Math.max(0, Math.ceil(9.99 - phaseT));
      if (playerWon) {
        const title = 'YOU WIN!';
        const size = unit * 2;
        ctx.font = `${size}px "Press Start 2P"`;
        // Arcoíris letra por letra, como NEW RECORD!.
        [...title].forEach((ch, i) => {
          const x = w / 2 + (i - (title.length - 1) / 2) * size;
          outlined(ctx, ch, x, cy + Math.round(Math.sin(t * 8 + i) * 3), size, DR_CYCLE[(i + Math.floor(t * 6)) % DR_CYCLE.length]);
        });
      } else big(ctx, w, cy, 'GAME OVER', unit * 2, 1.2, DR.rojo, DR.negro);
      outlined(ctx, playerWon ? 'OTRA?' : 'CONTINUE?', w / 2, cy + unit * 4, unit, DR.crema);
      outlined(ctx, String(left), w / 2, cy + unit * 6.5, unit * 2, DR.amarillo, DR.rojo);
      outlined(ctx, 'ENTER = REVANCHA   ESC = SALIR', w / 2, h - unit * 2, unit, DR.rosa);
      return;
    }
    if (phase === 'fight' || phase === 'intro') {
      ctx.textAlign = 'center';
      outlined(ctx, 'A/D MOVER  S AGACHAR  J ALTO  K BAJO  L PATADA  ESPACIO BLOQUEO', w / 2, h - unit * 1.2, Math.max(6, Math.floor(unit * 0.75)), DR.rosa);
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onExit();
    }
  };
  window.addEventListener('keydown', onKey);
  room.setMode('pelea');
  room.takeover = { update, drawOverlay };

  return {
    stop() {
      window.removeEventListener('keydown', onKey);
      input.dispose();
      room.takeover = null;
      room.setMode('pista');
      group.removeFromParent();
    },
  };
}
