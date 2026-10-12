import * as THREE from 'three';
import { loadGlbRig } from '../characters/glbRig';
import { type Rig, buildBoxRig } from '../characters/rig';
import type { BoilerRoom } from '../scenes/boiler';
import { PATIO } from '../scenes/boiler/afuera';
import { DISCOS_COLORS, RAROS_COLORS } from '../scenes/boiler/djs';
import { DR, type PSXMaterial, type PSXStage, blip, box, fitSize, makePSXMaterial, makeRecordTexture, outlined, titleUnit } from '../style-kit';
import { type Control, PauseMenu, type SelectView, banner, dim, drawSelect, hudTouch, resultBox, selectClicks, topBand } from '../juegos/hud';
import { mountTouchPad, onTouchUi } from '../juegos/touch';
import { isTouch } from '../ui/dom';
import { Cpu, DIFFICULTIES } from './cpu';
import { ARENA_HALF, ATTACKS, type Attack, type AttackName, Fighter, MAX_HP, NO_INTENT, SMOKE_EVERY, SMOKE_RINGS } from './fighter';
import { PlayerInput } from './input';

/**
 * DISCOS VS RAROS: pelea 1 contra la CPU, estilo Tekken 1, en el patio del boliche
 * (la gente y la tele quedan de fondo). Al mejor de 3 rounds de 60 segundos.
 */

const ARENA_Z = 4.35;
const ROUND_SECONDS = 60;
const WINS_TO_MATCH = 2;
const MIN_GAP = 0.78;

type Phase = 'select' | 'intro' | 'fight' | 'ko' | 'end';

/** Controles, para la pantalla de selección y el menú de pausa. */
const CONTROLS: Control[] = [
  { action: 'MOVER', keys: ['A', 'D'], pad: ['@LR'] },
  { action: 'SALTAR', keys: ['W'], pad: ['@UP'] },
  { action: 'AGACHARSE', keys: ['S'], pad: ['@DOWN'] },
  { action: 'GOLPE ALTO', keys: ['J'], pad: ['X'] },
  { action: 'GOLPE BAJO', keys: ['K'], pad: ['A'] },
  { action: 'PATADA', keys: ['L'], pad: ['B'] },
  { action: 'AGARRE', keys: ['I'], pad: ['Y'] },
  { action: 'BLOQUEO', keys: ['ESPACIO'], pad: ['L1', 'R1'] },
  { action: 'VINILO', note: 'ATRAS, ADELANTE + PATADA' },
  { action: 'HUMO', note: 'ABAJO, ADELANTE + PATADA' },
  { action: 'BIRRA', note: 'ABAJO, ABAJO + PATADA' },
];
/** Cartelito que salta cuando conecta algo especial. */
const SHOUTS: Partial<Record<AttackName, string>> = { vinilo: 'VINILAZO!', humo: 'HUMO!', vomito: 'VOMITO!', voladora: 'VOLADORA!', patada: 'PATADON!' };

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
  // --- Habilidades: lo que vuela por la pista -------------------------------------------
  interface Shot { mesh: THREE.Mesh; owner: Fighter; kind: 'vinilo' | 'humo'; x: number; y: number; vx: number; age: number }
  let shots: Shot[] = [];
  const vinylGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.025, 8);
  const label = makePSXMaterial({ map: makeRecordTexture('#15101c', DR.rojo), lit: false });
  const vinylMats = [makePSXMaterial({ color: DR.negro }), label, label];
  const ringGeo = new THREE.TorusGeometry(0.2, 0.05, 4, 8).rotateY(Math.PI / 2);
  const ringMat = makePSXMaterial({ color: '#d8d4e0', lit: false, opacity: 0.75 });
  const spawnShot = (owner: Fighter, kind: Shot['kind']) => {
    const mesh = kind === 'vinilo' ? new THREE.Mesh(vinylGeo, vinylMats) : new THREE.Mesh(ringGeo, ringMat);
    const shot: Shot = { mesh, owner, kind, x: owner.x + owner.dir * 0.5, y: kind === 'vinilo' ? 1.15 : 1.5, vx: owner.dir * (kind === 'vinilo' ? 6.5 : 2.7), age: 0 };
    mesh.position.set(shot.x, shot.y, ARENA_Z);
    mesh.renderOrder = 2;
    group.add(mesh);
    shots.push(shot);
    if (kind === 'vinilo') blip(900, 0.18, 'triangle', 0.08);
    else blip(180, 0.2, 'sine', 0.1);
  };
  const clearShots = () => {
    for (const s of shots) s.mesh.removeFromParent();
    shots = [];
  };
  // Vómito: cuadraditos verdes que salen en chorro (puro adorno; el daño va por distancia).
  const pukeMats = [makePSXMaterial({ color: '#8fd14a', lit: false }), makePSXMaterial({ color: '#c9d94a', lit: false })];
  const puke = Array.from({ length: 28 }, (_, i) => {
    const mesh = box(0.09, 0.09, 0.09, pukeMats[i % 2]);
    mesh.visible = false;
    group.add(mesh);
    return { mesh, vx: 0, vy: 0, life: 0 };
  });
  let pukeNext = 0;
  // El chop de birra, en la mano derecha de cada uno (se ve solo mientras toma).
  const mugs = fighters.map((f) => {
    const mug = new THREE.Group();
    mug.add(box(0.11, 0.15, 0.11, makePSXMaterial({ color: DR.amarillo })), box(0.12, 0.04, 0.12, makePSXMaterial({ color: DR.crema }), 0, 0.09, 0));
    mug.position.set(0, -f.rig.height * 0.2, 0.08);
    mug.rotation.x = 1.9;
    mug.visible = false;
    f.rig.foreR.add(mug);
    return mug;
  });
  // Se juega en el patio: todo el juego está armado alrededor del origen y se muda entero.
  group.position.set(PATIO.x, 0, PATIO.gameZ - ARENA_Z);
  room.scene.add(group);

  const input = new PlayerInput();
  const cpu = new Cpu();
  let player = 0;
  let difficulty = 1;
  let phase: Phase = 'select';
  let phaseT = 0;
  let round = 1;
  let clock = ROUND_SECONDS;
  let hitstop = 0;
  let shake = 0;
  let sparkT = 0;
  let playerWon = false;
  /** Vida que muestra cada barra: baja con retraso para que se vea cuánto sacó el golpe. */
  const shownHp = [MAX_HP, MAX_HP];
  /** Cartelito del momento (BLOQUEO, AGARRE!, VINILAZO!…). */
  let shout = { text: '', color: DR.crema as string, t: 9 };
  const say = (text: string, color: string = DR.amarillo) => (shout = { text, color, t: 0 });
  /** Segundos de pelea jugados en esta partida (la ayuda de teclas se muestra solo al principio). */
  let played = 0;
  const camPos = new THREE.Vector3(0, 1.5, ARENA_Z + 5);
  const camTarget = new THREE.Vector3(0, 1.15, ARENA_Z);

  const setPhase = (p: Phase) => {
    phase = p;
    phaseT = 0;
    touch?.setMode(p === 'select' || p === 'end' ? 'menu' : 'play');
  };
  const placeFighters = () => {
    clearShots();
    fighters[0].reset(-1.5, 1);
    fighters[1].reset(1.5, -1);
  };
  const newMatch = () => {
    round = 1;
    fighters[0].wins = fighters[1].wins = 0;
    played = 0;
    cpu.difficulty = DIFFICULTIES[difficulty];
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
      if (winner.hp >= MAX_HP) say('PERFECT!', DR.amarillo);
      winner.wins++;
      if (winner.state !== 'ko') {
        winner.state = 'win';
        winner.attack = null;
      }
    }
    setPhase('ko');
    blip(220, 0.5, 'sawtooth', 0.09);
    blip(110, 0.7, 'sawtooth', 0.09, 0.12);
  };
  placeFighters();

  /** Si el golpe de `a` conecta con `b` en este frame. */
  const resolve = (a: Fighter, b: Fighter) => {
    if (!a.striking || b.untouchable) return;
    const atk = ATTACKS[a.attack!];
    if (Math.abs(b.x - a.x) > atk.range) return;
    // El golpe alto pasa por arriba del que está agachado, y el bajo por abajo del que saltó.
    if (atk.level === 'alto' && b.low) return;
    if (atk.level === 'bajo' && b.airborne) return;
    if (atk.grab) {
      // El agarre no se bloquea, pero no agarra al agachado, al que saltó ni al que viene golpeado.
      if (b.low || b.airborne || b.state === 'hit') return;
      a.landed = true;
      a.throwFoe(b);
      say('AGARRE!', DR.rojo);
      blip(260, 0.1, 'square', 0.08);
      blip(520, 0.3, 'triangle', 0.07, 0.1);
      return;
    }
    a.landed = true;
    connect(atk, a, b, Math.sign(b.x - a.x) || a.dir);
  };

  /** Un golpe (o algo que venía volando) de `a` le llega a `b`: bloqueo o daño. */
  const connect = (atk: Attack, a: Fighter, b: Fighter, from: number) => {
    const y = atk.level === 'bajo' ? 0.55 : atk.level === 'medio' ? 1.0 : 1.45;
    spark.position.set(b.x - from * 0.25, y, ARENA_Z + 0.3);
    spark.visible = true;
    sparkT = 0.12;
    if (b.blocks(atk.level)) {
      b.takeBlock(atk, from);
      (spark.material as PSXMaterial).uniforms.uColor.value.set(DR.crema);
      blip(520, 0.05, 'square', 0.06);
      hitstop = 0.04;
      say('BLOQUEO', DR.crema);
    } else {
      b.takeHit(atk, from);
      (spark.material as PSXMaterial).uniforms.uColor.value.set(atk.damage > 10 ? DR.rojo : DR.amarillo);
      blip(150, 0.14, 'sawtooth', 0.14);
      blip(70, 0.18, 'square', 0.12, 0.02);
      hitstop = atk.damage > 10 ? 0.11 : 0.07;
      shake = atk.damage > 10 ? 0.16 : 0.08;
      const name = (Object.keys(ATTACKS) as AttackName[]).find((k) => ATTACKS[k] === atk);
      if (name && SHOUTS[name]) say(SHOUTS[name]!, atk.damage > 10 ? DR.rojo : DR.amarillo);
      if (b.hp <= 0) endRound(a);
    }
  };

  /** Lo que cada habilidad larga a medida que avanza (el vinilo, los aros, el chorro). */
  const fire = (f: Fighter) => {
    if (f.state !== 'attack' || !f.attack) return;
    const a = ATTACKS[f.attack];
    if (f.attack === 'vinilo' && f.t >= a.startup && f.shots === 0) {
      f.shots = 1;
      spawnShot(f, 'vinilo');
    } else if (f.attack === 'humo' && f.t >= a.startup) {
      const due = Math.min(SMOKE_RINGS, Math.floor((f.t - a.startup) / SMOKE_EVERY) + 1);
      while (f.shots < due) {
        f.shots++;
        spawnShot(f, 'humo');
      }
    } else if (f.attack === 'vomito') {
      if (f.shots === 0) {
        f.shots = 1;
        blip(300, 0.5, 'sine', 0.06);
      }
      if (f.t >= a.startup && f.t < a.startup + a.active) {
        if (f.shots === 1) {
          f.shots = 2;
          blip(70, 0.4, 'sawtooth', 0.14);
          blip(55, 0.3, 'square', 0.1, 0.1);
        }
        for (let i = 0; i < 2; i++) {
          const p = puke[pukeNext++ % puke.length];
          p.mesh.position.set(f.x + f.dir * 0.4, 1.42 + Math.random() * 0.08, ARENA_Z + (Math.random() - 0.5) * 0.2);
          p.vx = f.dir * (3.5 + Math.random() * 2.5);
          p.vy = 0.6 + Math.random() * 1.2;
          p.life = 0.55;
          p.mesh.visible = true;
        }
      }
    }
  };

  /** Mueve lo que vuela y, si `live`, resuelve contra quién choca. */
  const updateShots = (dt: number, live: boolean) => {
    const gone = new Set<Shot>();
    for (const s of shots) {
      s.x += s.vx * dt;
      s.age += dt;
      s.mesh.position.set(s.x, s.y + (s.kind === 'humo' ? Math.sin(s.age * 6) * 0.04 : 0), ARENA_Z);
      if (s.kind === 'vinilo') {
        s.mesh.rotation.y += dt * 25;
        s.mesh.rotation.z = Math.sin(s.age * 9) * 0.25;
      } else s.mesh.scale.setScalar(1 + s.age * 0.5);
      if (Math.abs(s.x) > 7.5 || s.age > 5) gone.add(s);
      if (!live || gone.has(s)) continue;
      const foe = fighters[0] === s.owner ? fighters[1] : fighters[0];
      const atk = ATTACKS[s.kind];
      // Los aros pasan por arriba del agachado; el vinilo, por abajo del que saltó.
      if (!foe.untouchable && Math.abs(s.x - foe.x) < 0.4 && !(atk.level === 'alto' && foe.low) && !(s.kind === 'vinilo' && foe.airborne)) {
        connect(atk, s.owner, foe, Math.sign(s.vx));
        gone.add(s);
        continue;
      }
      // Dos cosas que se cruzan en el aire se anulan.
      for (const o of shots) {
        if (o.owner !== s.owner && !gone.has(o) && Math.abs(o.x - s.x) < 0.3) {
          gone.add(o);
          gone.add(s);
          blip(700, 0.06, 'square', 0.05);
          break;
        }
      }
    }
    if (gone.size) {
      for (const s of gone) s.mesh.removeFromParent();
      shots = shots.filter((s) => !gone.has(s));
    }
    for (const p of puke) {
      if (!p.mesh.visible) continue;
      p.life -= dt;
      p.vy -= 9 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      if (p.life <= 0 || p.mesh.position.y < 0.05) p.mesh.visible = false;
    }
  };

  const setDifficulty = (step: number) => {
    const d = Math.max(0, Math.min(DIFFICULTIES.length - 1, difficulty + step));
    if (d !== difficulty) blip(1100, 0.03, 'square', 0.04);
    difficulty = d;
  };

  const update = (t: number, dt: number) => {
    pause.poll();
    input.poll(dt);
    if (pause.busy) input.flush();
    phaseT += dt;
    const [a, b] = fighters;
    const me = fighters[player], foe = fighters[1 - player];

    const logic = () => {
    if (phase === 'select') {
      const step = input.takeStep();
      if (step) {
        player = step < 0 ? 0 : 1;
        blip(1320, 0.03, 'square', 0.04);
      }
      const stepY = input.takeStepY();
      if (stepY) setDifficulty(stepY);
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
        me.update(dt, input.intent(me.dir, me.state === 'idle' || (me.state === 'jump' && !me.attack)), foe);
        // A la CPU se le avisa de lo más cercano que le viene volando.
        let incoming: { dist: number; level: Attack['level'] } | null = null;
        for (const s of shots) {
          const d = Math.abs(s.x - foe.x);
          if (s.owner === me && (!incoming || d < incoming.dist)) incoming = { dist: d, level: ATTACKS[s.kind].level };
        }
        foe.update(dt, cpu.think(dt, foe, me, incoming), me);
        fire(a);
        fire(b);
        // No se atraviesan: si quedan encimados, se separan parejo.
        const gap = Math.abs(b.x - a.x);
        const grounded = !a.airborne && !b.airborne && a.state !== 'thrown' && b.state !== 'thrown';
        if (gap < MIN_GAP && grounded) {
          const push = (MIN_GAP - gap) / 2, s = Math.sign(b.x - a.x) || 1;
          a.x = Math.max(-ARENA_HALF, a.x - s * push);
          b.x = Math.min(ARENA_HALF, b.x + s * push);
        }
        resolve(a, b);
        resolve(b, a);
        // Cayó al piso después de que lo revolearon.
        for (const f of fighters) {
          if (!f.slammed) continue;
          f.slammed = false;
          shake = 0.22;
          hitstop = 0.1;
          blip(90, 0.25, 'sawtooth', 0.16);
          blip(50, 0.3, 'square', 0.12, 0.03);
          if (f.hp <= 0 && phase === 'fight') endRound(f === a ? b : a);
        }
        if (phase === 'fight') updateShots(dt, true);
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
          startRound();
        }
      }
    } else if (phase === 'end') {
      const left = 9.99 - phaseT;
      if (phaseT > 0.8 && input.takeConfirm()) newMatch();
      else if (left <= 0) onExit();
    }

    };
    if (!pause.open) {
      logic();
      shout.t += dt;
      if (phase === 'fight') played += dt;
      // Las barras alcanzan a la vida real de a poco.
      fighters.forEach((f, i) => (shownHp[i] = f.hp >= shownHp[i] ? f.hp : Math.max(f.hp, shownHp[i] - dt * 28)));
    }
    if (phase !== 'fight' && !pause.open) updateShots(dt, false);
    for (const f of fighters) f.applyPose(dt, t);
    mugs.forEach((m, i) => (m.visible = fighters[i].drinking));
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
    // Si alguno salta (o lo revolean), la cámara sube y se aleja para que no se vaya de cuadro.
    const air = Math.max(a.y, b.y);
    camPos.lerp(new THREE.Vector3(mid * 0.85 + Math.sin(t * 0.3) * 0.25, (select ? 1.35 : 1.5) + air * 0.4, ARENA_Z + (select ? 3.4 : 2.9 + gap * 0.5) + air * 0.9), k);
    camTarget.lerp(new THREE.Vector3(mid, 1.1 + air * 0.4, ARENA_Z), k);
    stage.camera.position.set(camPos.x + sx, camPos.y + sy, camPos.z).add(group.position);
    stage.camera.lookAt(v.copy(camTarget).add(group.position));
    if (stage.camera.fov !== 46) {
      stage.camera.fov = 46;
      stage.camera.updateProjectionMatrix();
    }
  };

  const v = new THREE.Vector3();
  /** Dónde cae en la pantalla (0–1 a lo ancho) un punto de la pista. */
  const screenX = (x: number) => (v.set(x, 1, ARENA_Z).add(group.position).project(stage.camera).x + 1) / 2;

  const selectView = (): SelectView => ({
    title: 'DISCOS VS RAROS',
    prompt: 'ELEGI TU PELEADOR',
    players: fighters.map((f) => ({ name: f.name, cx: screenX(f.x) })),
    me: player,
    difficulty,
    difficulties: DIFFICULTIES.map((d) => d.name),
    controls: CONTROLS,
    cardTop: 0.27,
    cardBottom: 0.8,
    go: 'PELEAR',
    pad: input.connected,
  });
  // Con el mouse: las flechas de la dificultad y el peleador.
  const stopClicks = selectClicks(stage.overlayCanvas, () => (phase === 'select' ? selectView() : null), (hit) => {
    if ('difficulty' in hit) setDifficulty(hit.difficulty);
    else if ('player' in hit) player = hit.player;
    else if (phaseT > 0.3) {
      blip(880, 0.1);
      newMatch();
    }
  });
  // En el celular: en el resultado, tocar la pantalla es la revancha.
  const tapEnd = (e: PointerEvent) => {
    if (touch && phase === 'end' && phaseT > 0.8 && !onTouchUi(e)) newMatch();
  };
  window.addEventListener('pointerdown', tapEnd);

  const drawOverlay = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    const unit = titleUnit(w, h);
    ctx.textBaseline = 'middle';
    const [a, b] = fighters;

    if (phase === 'select') return drawSelect(ctx, w, h, t, selectView());

    // --- Marcador: barras de vida, reloj y rounds ganados ---
    topBand(ctx, w, unit * 4.6);
    const barW = Math.floor(w / 2 - unit * 4.5), barH = Math.round(unit * 1.1), y = Math.round(unit * 0.9);
    fighters.forEach((f, i) => {
      const x0 = i ? w - unit - barW : unit;
      ctx.fillStyle = DR.crema;
      ctx.fillRect(x0 - 3, y - 3, barW + 6, barH + 6);
      ctx.fillStyle = DR.negro;
      ctx.fillRect(x0 - 1, y - 1, barW + 2, barH + 2);
      ctx.fillStyle = DR.rojoOscuro;
      ctx.fillRect(x0, y, barW, barH);
      // La barra se vacía hacia el centro. Primero lo que acaba de perder (claro), después lo que le queda.
      const part = (hp: number, color: string) => {
        const fill = Math.round((barW * hp) / MAX_HP);
        ctx.fillStyle = color;
        ctx.fillRect(i ? x0 : x0 + barW - fill, y, fill, barH);
      };
      part(shownHp[i], DR.crema);
      part(f.hp, f.hp > 30 ? DR.amarillo : Math.floor(t * 8) % 2 ? DR.rojo : DR.amarillo);
      // Nombre (con la marca de quién es el jugador) y rounds ganados.
      const ny = y + barH + unit * 1.3;
      ctx.textAlign = i ? 'right' : 'left';
      const label = i === player ? `1P ${f.name}` : `CPU ${f.name}`;
      outlined(ctx, label, i ? w - unit : unit, ny, unit, i === player ? DR.amarillo : DR.crema);
      for (let n = 0; n < WINS_TO_MATCH; n++) {
        const wx = i ? x0 + n * (unit * 1.4) : x0 + barW - unit - n * (unit * 1.4);
        ctx.fillStyle = DR.negro;
        ctx.fillRect(wx - 2, ny - unit / 2 - 2, unit + 4, unit + 4);
        ctx.fillStyle = n < f.wins ? DR.rojo : '#33303a';
        ctx.fillRect(wx, ny - unit / 2, unit, unit);
      }
    });
    ctx.textAlign = 'center';
    outlined(ctx, String(Math.ceil(clock)).padStart(2, '0'), w / 2, y + unit * 0.8, unit * 2, clock < 10 ? (Math.floor(t * 4) % 2 ? DR.rojo : DR.crema) : DR.crema);
    outlined(ctx, `ROUND ${round}`, w / 2, y + unit * 2.7, Math.round(unit * 0.75), DR.rosa);

    const cy = h * 0.45;
    if (phase === 'intro') {
      if (phaseT < 1.3) banner(ctx, w, cy, `ROUND ${round}`, unit * 2, Math.min(1, phaseT * 5) * 1.2, DR.amarillo, DR.rojo);
      else banner(ctx, w, cy, 'FIGHT!', unit * 2, 1.2 + Math.max(0, 1.6 - phaseT) * 3, DR.rojo, DR.amarillo);
    } else if (phase === 'fight' && phaseT < 0.35) {
      banner(ctx, w, cy, 'FIGHT!', unit * 2, 1.2, DR.rojo, DR.amarillo);
    } else if (phase === 'ko') {
      const ko = a.state === 'ko' || b.state === 'ko';
      const text = ko ? 'K.O.' : a.hp === b.hp ? 'EMPATE' : 'TIME UP';
      const pop = 1.6 + Math.max(0, 0.25 - phaseT) * 8;
      if (phaseT < 1.6) banner(ctx, w, cy, text, unit * 2, pop, DR.rojo, DR.crema);
      else {
        const winner = fighters.find((f) => f.state === 'win') ?? (a.state === 'ko' ? b : b.state === 'ko' ? a : null);
        if (winner) banner(ctx, w, cy, `${winner.name} GANA`, unit * 2, 1, DR.amarillo, DR.rojo);
      }
    } else if (phase === 'end') {
      resultBox(ctx, w, h, t, {
        title: playerWon ? 'GANASTE!' : 'GAME OVER',
        color: playerWon ? DR.amarillo : DR.rojo,
        lines: [`${a.name} ${a.wins} - ${b.wins} ${b.name}`, `DIFICULTAD: ${DIFFICULTIES[difficulty].name}`],
        seconds: 10 - phaseT,
      });
      return;
    }
    // Cartelito del golpe: aparece de golpe y se va rápido.
    if (shout.t < 0.75 && phase !== 'intro') {
      banner(ctx, w, h * 0.3, shout.text, unit, 1.4 + Math.max(0, 0.12 - shout.t) * 6, Math.floor(shout.t * 20) % 2 ? shout.color : DR.crema, DR.negro);
    }
    if (phase === 'fight' || phase === 'intro') {
      ctx.textAlign = 'center';
      if (touch) {
        // Los botones ya dicen qué hacen.
      } else if (round === 1 && played < 8) {
        // Al principio de la partida, un repaso corto; después no molesta.
        const keys = input.connected ? 'STICK MOVER  STICK ARRIBA SALTAR  STICK ABAJO AGACHAR  X ALTO  A BAJO  B PATADA  Y AGARRE  L1/R1 BLOQUEO' : 'A/D MOVER  W SALTAR  S AGACHAR  J ALTO  K BAJO  L PATADA  I AGARRE  ESPACIO BLOQUEO';
        dim(ctx, 0, h - unit * 2.2, w, unit * 2.2);
        outlined(ctx, keys, w / 2, h - unit * 1.1, fitSize(keys, Math.floor(unit * 0.75), w), DR.crema);
      } else {
        ctx.textAlign = 'right';
        outlined(ctx, 'ESC O START: PAUSA Y CONTROLES', w - unit, h - unit, Math.floor(unit * 0.6), DR.rosa);
      }
    }
    pause.draw(ctx, w, h, t, CONTROLS);
  };

  const pause = new PauseMenu({
    canPause: () => phase === 'fight' || phase === 'intro' || phase === 'ko',
    onRestart: () => newMatch(),
    onExit,
    layer: stage.overlayCanvas,
  });
  // Celular: stick y botones en pantalla (aprietan las mismas teclas). Si se gira parado, pausa.
  hudTouch.on = isTouch();
  const touch = hudTouch.on
    ? mountTouchPad(
        [
          { code: 'KeyJ', label: 'GOLPE ALTO' },
          { code: 'KeyK', label: 'GOLPE BAJO' },
          { code: 'KeyL', label: 'PATADA' },
          { code: 'KeyI', label: 'AGARRE' },
          { code: 'Space', label: 'BLOQUEO' },
        ],
        (portrait) => portrait && pause.pauseNow(),
      )
    : null;

  if (import.meta.env.DEV) (window as unknown as { drPelea: unknown }).drPelea = { fighters, shots: () => shots };
  room.setMode('pelea');
  room.takeover = { update, drawOverlay };

  return {
    stop() {
      pause.dispose();
      touch?.dispose();
      window.removeEventListener('pointerdown', tapEnd);
      stopClicks();
      input.dispose();
      room.takeover = null;
      room.setMode('pista');
      group.removeFromParent();
      mugs.forEach((m) => m.removeFromParent());
    },
  };
}
