import * as THREE from 'three';
import { loadGlbRig } from '../characters/glbRig';
import { type Rig, buildBoxRig } from '../characters/rig';
import { PadEdges } from '../juegos/gamepad';
import { type Control, PauseMenu, type SelectView, banner, dim, drawSelect, resultBox, selectClicks, topBand } from '../juegos/hud';
import type { BoilerRoom } from '../scenes/boiler';
import { DISCOS_COLORS, RAROS_COLORS } from '../scenes/boiler/djs';
import { DR, DR_CYCLE, type PSXMaterial, type PSXStage, blip, box, fitSize, makeCanvas, makeCheckerTexture, makePSXMaterial, makeRecordTexture, outlined, titleUnit, toPSXTexture } from '../style-kit';
import { BALL_R, type Controls, FIELD, KICK_SECONDS, MATCH_SECONDS, NO_CONTROLS, SOCCER_DIFFICULTIES, SoccerCpu, kickoff, newBall, newPlayer, simulate } from './game';

/**
 * CABEZAZOS: fútbol de cabezones, Discos contra Raros, 1 contra la CPU. Se juega de costado
 * en la pista del boiler room, con la gente y la tele de fondo. La física vive en game.ts.
 */

const ARENA_Z = 4.35;
/** Los personajes se achican y se les agranda la cabeza: son puro cabezón. */
const BODY_SCALE = 0.7, HEAD_SCALE = 3;

type Phase = 'select' | 'ready' | 'play' | 'goal' | 'end';

/** Controles, para la pantalla de selección y el menú de pausa. */
const CONTROLS: Control[] = [
  { action: 'MOVER', keys: ['A', 'D'], pad: ['@LR'] },
  { action: 'SALTAR', keys: ['W'], pad: ['A'] },
  { action: 'PATEAR', keys: ['J', 'ESPACIO'], pad: ['X'] },
  { action: 'RASANTE', keys: ['S', '+', 'J'], pad: ['@DOWN', '+', 'X'] },
  { action: 'TIRO VINILO', keys: ['K'], pad: ['B'] },
  { action: 'VINILO', note: 'BARRA LLENA Y PELOTA CERCA' },
  { action: 'CABEZAZO', note: 'SALTA HACIA LA PELOTA' },
  { action: 'GLOBITO', note: 'PATEA CON EL RIVAL ADELANTE' },
  { action: 'VOLEA', note: 'PATEA LA PELOTA ALTA' },
];

async function loadRig(file: string, fallback: Parameters<typeof buildBoxRig>[0]): Promise<Rig> {
  try {
    return await loadGlbRig(`${import.meta.env.BASE_URL}models/${file}`);
  } catch {
    return buildBoxRig(fallback);
  }
}

/** Teclado y joystick del jugador. */
class Pad {
  private held = new Set<string>();
  private pressed = new Set<string>();
  private padHeld = new Set<number>();
  private static KEYS = ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyJ', 'KeyK', 'Space', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

  constructor() {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.blur);
  }
  dispose() {
    window.removeEventListener('keydown', this.down);
    window.removeEventListener('keyup', this.up);
    window.removeEventListener('blur', this.blur);
  }
  private down = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !Pad.KEYS.includes(e.code)) return;
    e.preventDefault();
    if (e.repeat) return;
    this.held.add(e.code);
    this.pressed.add(e.code);
  };
  private up = (e: KeyboardEvent) => this.held.delete(e.code);
  private blur = () => this.held.clear();

  private pad = new PadEdges();
  get connected() {
    return this.pad.state.connected;
  }

  /** Pasar los botones del joystick a "teclas" equivalentes. Llamar una vez por frame. */
  poll() {
    const p = this.pad.poll();
    const map: [boolean, string][] = [
      [p.left, 'ArrowLeft'],
      [p.right, 'ArrowRight'],
      [p.up, 'ArrowUp'],
      [p.down, 'ArrowDown'],
      [p.a, 'PadA'],
      [p.x, 'KeyJ'],
      [p.b || p.y, 'KeyK'],
      [p.start, 'Enter'],
    ];
    map.forEach(([on, code], i) => {
      if (on && !this.padHeld.has(i)) {
        this.padHeld.add(i);
        this.held.add(code);
        this.pressed.add(code);
      } else if (!on && this.padHeld.has(i)) {
        this.padHeld.delete(i);
        this.held.delete(code);
      }
    });
  }

  private any(...codes: string[]) {
    return codes.some((c) => this.held.has(c));
  }
  /** ¿Se apretó alguna de estas desde la última vez? Se consume al leerlo. */
  took(...codes: string[]) {
    let hit = false;
    for (const c of codes) hit = this.pressed.delete(c) || hit;
    return hit;
  }
  flush() {
    this.pressed.clear();
  }

  controls(): Controls {
    const c: Controls = {
      move: (this.any('KeyD', 'ArrowRight') ? 1 : 0) - (this.any('KeyA', 'ArrowLeft') ? 1 : 0),
      jump: this.any('KeyW', 'ArrowUp', 'PadA'),
      low: this.any('KeyS', 'ArrowDown'),
      kick: this.took('KeyJ', 'Space'),
      special: this.took('KeyK'),
    };
    this.pressed.clear();
    return c;
  }
}

/** Red del arco: rayitas sobre transparente (los píxeles sin raya se descartan). */
function makeNetTexture() {
  const { canvas, ctx } = makeCanvas(16, 16);
  ctx.fillStyle = DR.crema;
  for (let i = 0; i < 16; i += 4) {
    ctx.fillRect(i, 0, 1, 16);
    ctx.fillRect(0, i, 16, 1);
  }
  const tex = toPSXTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export interface Futbol {
  stop(): void;
}

export async function startFutbol(stage: PSXStage, room: BoilerRoom, onExit: () => void): Promise<Futbol> {
  const rigs = await Promise.all([loadRig('discos.glb', DISCOS_COLORS), loadRig('raros.glb', RAROS_COLORS)]);
  const players = [newPlayer('DISCOS', 1), newPlayer('RAROS', -1)];
  const ball = newBall();
  const group = new THREE.Group();

  for (const rig of rigs) {
    rig.root.scale.setScalar(BODY_SCALE);
    rig.head.scale.setScalar(HEAD_SCALE);
    group.add(rig.root);
  }

  // --- Pelota (y el vinilo en que se convierte con el tiro especial) --------------------
  const ballMat = makePSXMaterial({ map: makeCheckerTexture(DR.crema, DR.negro, 4) });
  const ballMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(BALL_R, 1), ballMat);
  const label = makePSXMaterial({ map: makeRecordTexture('#15101c', DR.rojo), lit: false });
  const vinylMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 8), [makePSXMaterial({ color: DR.negro }), label, label]);
  vinylMesh.rotation.x = Math.PI / 2;
  group.add(ballMesh, vinylMesh);

  // --- Sombras --------------------------------------------------------------------------
  const shadowMat = makePSXMaterial({ color: '#000000', lit: false, opacity: 0.45 });
  const shadow = (r: number) => {
    const s = new THREE.Mesh(new THREE.CircleGeometry(r, 8), shadowMat);
    s.rotation.x = -Math.PI / 2;
    s.renderOrder = 1;
    group.add(s);
    return s;
  };
  const playerShadows = players.map(() => shadow(0.36));
  const ballShadow = shadow(0.2);

  // --- Arcos -----------------------------------------------------------------------------
  const post = makePSXMaterial({ color: DR.crema });
  const net = makePSXMaterial({ map: makeNetTexture(), lit: false, side: THREE.DoubleSide });
  const netPlane = (w: number, h: number) => {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * 3, uv.getY(i) * h * 3);
    return new THREE.Mesh(g, net);
  };
  const DEPTH = 1.3, goalW = FIELD.back - FIELD.half;
  for (const side of [-1, 1]) {
    const x0 = side * FIELD.half, xm = side * (FIELD.half + goalW / 2);
    for (const z of [-DEPTH / 2, DEPTH / 2]) {
      group.add(box(0.09, FIELD.goalH, 0.09, post, x0, FIELD.goalH / 2, ARENA_Z + z));
      group.add(box(goalW, 0.09, 0.09, post, xm, FIELD.goalH, ARENA_Z + z));
    }
    group.add(box(0.09, 0.09, DEPTH, post, x0, FIELD.goalH, ARENA_Z));
    const back = netPlane(DEPTH, FIELD.goalH);
    back.rotation.y = Math.PI / 2;
    back.position.set(side * FIELD.back, FIELD.goalH / 2, ARENA_Z);
    const top = netPlane(goalW, DEPTH);
    top.rotation.x = Math.PI / 2;
    top.position.set(xm, FIELD.goalH, ARENA_Z);
    const far = netPlane(goalW, FIELD.goalH);
    far.position.set(xm, FIELD.goalH / 2, ARENA_Z - DEPTH / 2);
    group.add(back, top, far);
  }
  // Línea del medio y de los arcos, pintadas en la pista.
  const line = makePSXMaterial({ color: DR.crema, lit: false });
  for (const x of [0, -FIELD.half, FIELD.half]) group.add(box(0.06, 0.012, DEPTH + 0.6, line, x, 0.012, ARENA_Z));
  room.scene.add(group);

  const input = new Pad();
  const cpu = new SoccerCpu();
  let me = 0;
  let difficulty = 1;
  let phase: Phase = 'select';
  let phaseT = 0;
  let clock = MATCH_SECONDS;
  let golden = false;
  let lastScorer = 0;
  let shake = 0;
  const walk = [0, 0];
  let camDist = 4.3, camY = 0.95;
  /** Cartelito del momento (TIRO VINILO!, ULTIMOS 10…). */
  let shout = { text: '', color: DR.crema as string, t: 9 };
  const say = (text: string, color: string = DR.amarillo) => (shout = { text, color, t: 0 });
  /** Segundos jugados en esta partida (la ayuda de teclas se muestra solo al principio). */
  let played = 0;

  const setDifficulty = (step: number) => {
    const d = Math.max(0, Math.min(SOCCER_DIFFICULTIES.length - 1, difficulty + step));
    if (d !== difficulty) blip(1100, 0.03, 'square', 0.04);
    difficulty = d;
  };
  const setPhase = (p: Phase) => {
    phase = p;
    phaseT = 0;
    input.flush();
  };
  const newMatch = () => {
    for (const p of players) {
      p.score = 0;
      p.power = 0;
      p.speed = 1;
    }
    cpu.difficulty = SOCCER_DIFFICULTIES[difficulty];
    clock = MATCH_SECONDS;
    golden = false;
    played = 0;
    kickoff(players, ball);
    setPhase('ready');
    blip(440, 0.12);
  };
  kickoff(players, ball);

  const update = (t: number, dt: number) => {
    pause.poll();
    input.poll();
    if (pause.busy) input.flush();
    phaseT += dt;

    const logic = () => {
    if (phase === 'select') {
      if (input.took('ArrowLeft', 'KeyA')) me = 0;
      if (input.took('ArrowRight', 'KeyD')) me = 1;
      if (input.took('ArrowUp', 'KeyW')) setDifficulty(-1);
      if (input.took('ArrowDown', 'KeyS')) setDifficulty(1);
      if (phaseT > 0.3 && input.took('Enter', 'KeyJ', 'Space', 'PadA')) {
        blip(880, 0.1);
        newMatch();
      }
    } else if (phase === 'ready') {
      if (phaseT > 1.4) {
        setPhase('play');
        blip(990, 0.25, 'square', 0.07);
      }
    } else if (phase === 'play') {
      const controls = players.map((p, i) => (i === me ? input.controls() : cpu.think(dt, p, ball, players[1 - i])));
      const ev = simulate(players, ball, controls, dt);
      if (ev.kick) blip(240, 0.07, 'square', 0.1);
      else if (ev.header) blip(330, 0.08, 'square', 0.1);
      else if (ev.bounce > 3) blip(160 + ev.bounce * 8, 0.04, 'square', Math.min(0.08, ev.bounce * 0.008));
      if (ev.header) say('CABEZAZO!', DR.verdeClaro);
      if (ev.special) {
        say('TIRO VINILO!', DR.rojo);
        blip(900, 0.25, 'sawtooth', 0.09);
        blip(1400, 0.2, 'square', 0.06, 0.05);
      }
      if (ev.knock) {
        say('LO VOLTEO!', DR.amarillo);
        blip(110, 0.25, 'sawtooth', 0.14);
        shake = 0.2;
      }
      const before = clock;
      if (!golden) clock = Math.max(0, clock - dt);
      if (before > 10 && clock <= 10) say('ULTIMOS 10!', DR.rojo);
      played += dt;
      if (ev.goal !== null) {
        players[ev.goal].score++;
        lastScorer = ev.goal;
        shake = 0.25;
        [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.14, 'square', 0.07, i * 0.09));
        setPhase('goal');
      } else if (clock <= 0 && !golden) {
        if (players[0].score !== players[1].score) {
          blip(220, 0.6, 'sawtooth', 0.08);
          setPhase('end');
        } else {
          // Empate: sigue hasta que alguien la meta.
          golden = true;
          say('GOL DE ORO!', DR.amarillo);
          blip(660, 0.3, 'square', 0.07);
        }
      }
    } else if (phase === 'goal') {
      // La pelota sigue rebotando en la red mientras festejan.
      simulate(players, ball, [NO_CONTROLS, NO_CONTROLS], dt);
      if (phaseT > 2) {
        if (golden || (clock <= 0 && players[0].score !== players[1].score)) setPhase('end');
        else {
          // Saca el que recibió el gol: la pelota cae hacia su lado.
          kickoff(players, ball, players[lastScorer].dir);
          setPhase('ready');
        }
      }
    } else if (phase === 'end') {
      if (phaseT > 0.8 && input.took('Enter', 'KeyJ', 'Space', 'PadA')) newMatch();
      else if (phaseT > 10) onExit();
    }

    };
    if (!pause.open) {
      logic();
      shout.t += dt;
    }

    // --- Dibujar el estado -------------------------------------------------------------
    const winner = players[0].score === players[1].score ? -1 : players[0].score > players[1].score ? 0 : 1;
    players.forEach((p, i) => {
      const rig = rigs[i];
      const celebrate = (phase === 'goal' && lastScorer === i) || (phase === 'end' && winner === i);
      const sad = (phase === 'goal' && lastScorer !== i) || (phase === 'end' && winner >= 0 && winner !== i);
      const hop = celebrate ? Math.abs(Math.sin(t * 9)) * 0.25 : 0;
      rig.root.position.set(p.x, p.y + hop, ARENA_Z);
      // De costado, un poco girado hacia la cámara; el que festeja mira al frente.
      rig.root.rotation.y = celebrate ? 0 : p.dir * (Math.PI / 2 - 0.55);
      rig.root.rotation.z = p.stun > 0 ? p.dir * 0.5 : 0;
      const running = Math.abs(p.vx) > 0.2 && p.y <= 0;
      if (running) walk[i] += dt * 13;
      const s = running ? Math.sin(walk[i]) : 0;
      const air = p.y > 0.05;
      const kick = p.kickT >= 0 ? Math.sin(Math.min(1, p.kickT / KICK_SECONDS) * Math.PI) : 0;
      rig.body.rotation.x = air ? -0.1 : running ? 0.12 : 0;
      rig.head.rotation.x = sad ? 0.45 : air ? -0.15 : Math.sin(t * 3 + i) * 0.04;
      rig.head.rotation.z = Math.sin(t * 2.2 + i * 2) * 0.05;
      rig.legR.rotation.x = -1.5 * kick + (air ? -0.5 : s * 0.7);
      rig.kneeR.rotation.x = kick > 0 ? 0.1 : air ? 0.9 : Math.max(0, s) * 0.5;
      rig.legL.rotation.x = air ? -0.3 : -s * 0.7 + kick * 0.3;
      rig.kneeL.rotation.x = air ? 0.9 : Math.max(0, -s) * 0.5;
      const up = celebrate ? 2.7 : air ? 0.9 : 0.25;
      rig.armL.rotation.set(celebrate ? 0 : -s * 0.6, 0, up);
      rig.armR.rotation.set(celebrate ? 0 : s * 0.6, 0, -up);
      rig.foreL.rotation.x = rig.foreR.rotation.x = celebrate ? -0.2 : -0.5;
      playerShadows[i].position.set(p.x, 0.02, ARENA_Z);
      playerShadows[i].scale.setScalar(1 / (1 + p.y * 0.4));
    });

    const special = ball.power > 0;
    ballMesh.visible = !special;
    vinylMesh.visible = special;
    ballMesh.position.set(ball.x, ball.y, ARENA_Z);
    ballMesh.rotation.z = -ball.spin;
    vinylMesh.position.copy(ballMesh.position);
    vinylMesh.rotation.z += dt * 30;
    ballShadow.position.set(ball.x, 0.02, ARENA_Z);
    ballShadow.scale.setScalar(1 / (1 + ball.y * 0.35));

    // Cámara fija de costado, con toda la cancha a la vista (más lejos si la pantalla es angosta).
    shake = Math.max(0, shake - dt);
    const sx = shake > 0 ? Math.sin(t * 90) * shake * 0.5 : 0;
    const select = phase === 'select';
    const want = select ? 4.3 : Math.max(5.7, 10.2 / Math.max(0.8, stage.camera.aspect));
    camDist += (want - camDist) * Math.min(1, dt * 4);
    camY += ((select ? 0.95 : 1.6) - camY) * Math.min(1, dt * 4);
    const cx = select ? 0 : ball.x * 0.08;
    stage.camera.position.set(cx + sx, camY + 0.35, ARENA_Z + camDist);
    stage.camera.lookAt(cx, camY, ARENA_Z);
    if (stage.camera.fov !== 46) {
      stage.camera.fov = 46;
      stage.camera.updateProjectionMatrix();
    }
  };

  const v = new THREE.Vector3();
  const screenX = (x: number) => (v.set(x, 1, ARENA_Z).project(stage.camera).x + 1) / 2;

  const selectView = (): SelectView => ({
    title: 'CABEZAZOS',
    prompt: 'ELEGI CON QUIEN JUGAS',
    players: players.map((p) => ({ name: p.name, cx: screenX(p.x) })),
    me,
    difficulty,
    difficulties: SOCCER_DIFFICULTIES.map((d) => d.name),
    controls: CONTROLS,
    cardTop: 0.27,
    cardBottom: 0.8,
    go: 'JUGAR',
    pad: input.connected,
  });
  // Con el mouse: las flechas de la dificultad y el personaje.
  const stopClicks = selectClicks(stage.overlayCanvas, () => (phase === 'select' ? selectView() : null), (hit) => {
    if ('difficulty' in hit) setDifficulty(hit.difficulty);
    else me = hit.player;
  });

  const drawOverlay = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    const unit = titleUnit(w, h);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    if (phase === 'select') return drawSelect(ctx, w, h, t, selectView());

    // --- Marcador: nombres, barra del tiro especial, goles y reloj ---
    topBand(ctx, w, unit * 4.6);
    const barW = Math.floor(w * 0.26), barH = Math.round(unit * 0.8), by = Math.round(unit * 2.5);
    players.forEach((p, i) => {
      const x0 = i ? w - unit - barW : unit;
      ctx.textAlign = i ? 'right' : 'left';
      outlined(ctx, i === me ? `1P ${p.name}` : `CPU ${p.name}`, i ? w - unit : unit, unit * 1.3, unit, i === me ? DR.amarillo : DR.crema);
      ctx.fillStyle = DR.crema;
      ctx.fillRect(x0 - 3, by - 3, barW + 6, barH + 6);
      ctx.fillStyle = DR.negro;
      ctx.fillRect(x0 - 1, by - 1, barW + 2, barH + 2);
      ctx.fillStyle = '#33303a';
      ctx.fillRect(x0, by, barW, barH);
      const full = p.power >= 1;
      ctx.fillStyle = full ? DR_CYCLE[Math.floor(t * 8) % DR_CYCLE.length] : DR.verdeClaro;
      const fill = Math.round(barW * p.power);
      ctx.fillRect(i ? x0 + barW - fill : x0, by, fill, barH);
      // Debajo de la barra, qué es y cuándo se puede usar.
      const tip = full ? (i === me ? 'TIRO VINILO LISTO: APRETA K' : 'TIRO VINILO LISTO') : 'TIRO VINILO';
      outlined(ctx, tip, i ? w - unit : unit, by + barH + unit * 0.9, Math.round(unit * 0.6), full && Math.floor(t * 4) % 2 ? DR.amarillo : DR.rosa);
    });
    ctx.textAlign = 'center';
    outlined(ctx, `${players[0].score} - ${players[1].score}`, w / 2, unit * 1.6, unit * 2, DR.crema, DR.rojo);
    const last = !golden && clock < 10;
    outlined(ctx, golden ? 'GOL DE ORO' : String(Math.ceil(clock)).padStart(2, '0'), w / 2, unit * 3.7, unit, golden ? DR.amarillo : last ? (Math.floor(t * 4) % 2 ? DR.rojo : DR.crema) : DR.rosa);

    const cy = h * 0.42;
    if (phase === 'ready') banner(ctx, w, cy, phaseT < 0.9 ? 'PREPARADOS' : 'YA!', unit * 2, 1.1, DR.amarillo, DR.rojo);
    else if (phase === 'goal') {
      const title = 'GOOOL!';
      const size = unit * 3;
      [...title].forEach((ch, i) => {
        const x = w / 2 + (i - (title.length - 1) / 2) * size;
        outlined(ctx, ch, x, cy + Math.round(Math.sin(t * 9 + i) * unit * 0.4), size, DR_CYCLE[(i + Math.floor(t * 8)) % DR_CYCLE.length]);
      });
      outlined(ctx, `DE ${players[lastScorer].name}`, w / 2, cy + unit * 4, unit, DR.crema);
    } else if (phase === 'end') {
      const won = players[me].score > players[1 - me].score;
      resultBox(ctx, w, h, t, {
        title: won ? 'GANASTE!' : 'PERDISTE',
        color: won ? DR.amarillo : DR.rojo,
        lines: [`${players[0].name} ${players[0].score} - ${players[1].score} ${players[1].name}`, `DIFICULTAD: ${SOCCER_DIFFICULTIES[difficulty].name}`],
        seconds: 10 - phaseT,
      });
      return;
    }
    if (shout.t < 0.9 && phase === 'play') {
      banner(ctx, w, h * 0.3, shout.text, unit, 1.4 + Math.max(0, 0.12 - shout.t) * 6, Math.floor(shout.t * 20) % 2 ? shout.color : DR.crema, DR.negro);
    }
    if (phase === 'play' || phase === 'ready') {
      if (played < 8) {
        const keys = input.connected ? 'STICK MOVER   A SALTAR   X PATEAR   STICK ABAJO+X RASANTE   B TIRO VINILO' : 'A/D MOVER   W SALTAR   J O ESPACIO PATEAR   S+J RASANTE   K TIRO VINILO';
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
    canPause: () => phase === 'ready' || phase === 'play' || phase === 'goal',
    onRestart: () => newMatch(),
    onExit,
  });

  if (import.meta.env.DEV) (window as unknown as { drFutbol: unknown }).drFutbol = { players, ball, phase: () => phase, end: () => setPhase('end') };
  room.setMode('pelea');
  room.takeover = { update, drawOverlay };

  return {
    stop() {
      pause.dispose();
      stopClicks();
      input.dispose();
      room.takeover = null;
      room.setMode('pista');
      group.removeFromParent();
      (ballMat as PSXMaterial).dispose();
    },
  };
}
