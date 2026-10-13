import * as THREE from 'three';
import { type Look, type LookView, type Raro, type SetInfo, validLook } from '../../../shared/look';
import type { PistaData } from '../../api';
import { DR, type PSXStage, audioLive, outlined, psxUniforms, street, titleUnit } from '../../style-kit';
import { isTouch, sinTildes } from '../../ui/dom';
import { PATIO, PUERTA, buildAfuera, buildPatio } from './afuera';
import { CLUB, buildClub } from './club';
import { Crowd, MAX_DANCERS } from './crowd';
import { loadGlbRig } from '../../characters/glbRig';
import { buildPlaceholderDjs, makeDjs } from './djs';
import { Tele } from './tele';

const FOG = '#120a1f';

/** 'afuera' es la vereda (la entrada del sitio) y 'patio' el patio de juegos; el resto pasa adentro. */
export type BoilerMode = 'afuera' | 'pista' | 'creador' | 'pelea' | 'patio';

/** Otro modo de juego (la pelea) que usa el club de escenario: maneja la cámara y dibuja su HUD. */
export interface Takeover {
  update(t: number, dt: number): void;
  drawOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void;
}

export interface BoilerRoom {
  scene: THREE.Scene;
  /** Con el modo 'pelea': la pista sigue bailando atrás y esto maneja cámara y carteles. */
  takeover: Takeover | null;
  /** Quiénes están en la pista (lo que devuelve la API). */
  setPista(data: PistaData): void;
  /** Vista previa del personaje que se está armando (null = volver a lo guardado). */
  setDraft(draft: { name: string; look: Look } | null): void;
  /** 'creador' acerca la cámara al personaje del visitante y esconde la cabina; 'pelea' saca a los DJs de la cabina. */
  setMode(mode: BoilerMode): void;
  /**
   * La entrada: desde la vereda se camina a la puerta (el set se escucha bajito, de afuera),
   * se abren las hojas, el sonido sube y la cámara termina en la pista.
   * @param skip entrar de una, sin la animación.
   * @param ask lo que pasa cuando el patova revisa la lista: la entrada espera a que termine
   *   y devuelve el nombre con el que lo hace pasar (null = entra sin anotarse).
   */
  enter(skip?: boolean, ask?: () => Promise<string | null>): Promise<void>;
  /** El raro del que está en la puerta, frente al patova (null = nadie). */
  setGuest(look: Look | null): void;
  /** En el creador: qué parte del personaje se mira de cerca. */
  setView(view: LookView): void;
  /** En el creador: para dónde mira el personaje (null = gira solo). */
  setSpin(yaw: number | null): void;
  /** Pone un set en la tele y la pista baila a su BPM. */
  play(set: SetInfo, playlist?: SetInfo[]): void;
  playing(): SetInfo | null;
  /** ¿Está sonando? */
  isPlaying(): boolean;
  /** Prende el sonido del set. Hay que llamarlo adentro del primer click (PRESS START): en iPhone, después ya no deja. */
  unlockSound(): void;
  /** Pausa o reanuda el set. */
  toggle(): void;
  /** Pasa al set siguiente (1) o al anterior (-1) de la lista. */
  skip(d: number): void;
  /** Avisa cuando el set empieza a sonar o se pausa. */
  onPlayState: ((playing: boolean) => void) | null;
  onNowPlaying: ((set: SetInfo) => void) | null;
  drawOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void;
}

export function createBoilerRoom(stage: PSXStage): BoilerRoom {
  const touch = isTouch();
  const scene = new THREE.Scene();
  const fog = new THREE.Color(FOG);
  stage.post.clearColor.copy(fog);
  psxUniforms.uFog.value = 1;
  psxUniforms.uFogColor.value.copy(fog);
  psxUniforms.uFogNear.value = 9;
  psxUniforms.uFogFar.value = 26;
  // Luz de boliche: poca ambiente, tirando a violeta.
  psxUniforms.uAmbient.value.setRGB(0.4, 0.36, 0.5);
  psxUniforms.uLightColor.value.setRGB(0.62, 0.58, 0.56);
  psxUniforms.uLightDir.value.set(0.25, 0.8, 0.9).normalize();

  const club = buildClub();
  const crowd = new Crowd(touch ? 70 : MAX_DANCERS);
  crowd.roam = true;
  // Arrancan los de cajas; cuando cargan los modelos de verdad, los reemplazan.
  const placeholders = buildPlaceholderDjs();
  let djs = makeDjs(placeholders.discos, placeholders.raros);
  const djGroup = new THREE.Group();
  djGroup.add(djs.discos.root, djs.raros.root);
  const models = import.meta.env.BASE_URL + 'models/';
  Promise.all([loadGlbRig(models + 'discos.glb'), loadGlbRig(models + 'raros.glb')])
    .then(([discos, raros]) => {
      djGroup.clear();
      djs = makeDjs(discos, raros);
      djGroup.add(discos.root, raros.root);
    })
    .catch((e) => console.warn('No cargaron los modelos de los DJs, quedan los de cajas.', e));
  const tele = new Tele(stage);
  const afuera = buildAfuera();
  const patio = buildPatio();
  patio.group.visible = false;
  scene.add(club.group, crowd.group, djGroup, tele.object, afuera.group, patio.group);

  // --- Quién baila ---------------------------------------------------------------------
  let pista: PistaData = { total: 0, raros: [], mine: null };
  let draft: Raro | null = null;
  /** ¿El primer lugar de la pista es el del visitante? */
  let hasFirst = false;
  const rebuild = () => {
    const first = draft ?? pista.mine;
    hasFirst = Boolean(first);
    const others = pista.raros.filter((x) => x.id !== pista.mine?.id);
    // Solo baila gente que se sumó de verdad: si no hay nadie, la pista está vacía.
    crowd.setDancers([...(first ? [first] : []), ...others]);
    pickShowcase();
  };

  // Nombres: se ven un rato al entrar a la pista (unos pocos, más el propio) y después
  // solo el del raro al que se le pasa el mouse por encima (en el celu, al que se toca).
  const NAMES_SECONDS = 7;
  let namesLeft = 0;
  /** Dónde está el puntero (0–1 de la pantalla) y hasta cuándo vale (un toque dura un rato). */
  const pointer = { x: -1, y: -1, until: 0 };
  const point = (e: PointerEvent) => {
    // Solo sobre la pista: arriba de una ventana o de la barra no se señala a nadie.
    const on = e.target === stage.renderer.domElement || e.target === document.body || e.target === document.documentElement;
    pointer.x = on ? e.clientX / window.innerWidth : -1;
    pointer.y = e.clientY / window.innerHeight;
    pointer.until = e.pointerType === 'mouse' ? Infinity : performance.now() + 2500;
  };
  window.addEventListener('pointermove', point);
  window.addEventListener('pointerdown', point);
  document.documentElement.addEventListener('pointerleave', () => (pointer.x = -1));

  // Mirar la pista: arrastrando (mouse o dedo) la cámara gira alrededor y sube; con la rueda o
  // pellizcando se mete arriba de la cabina, encima de los raros. Si no se toca nada, vuelve sola.
  // Y pasear por el boliche: un toque (o clic) en el piso o en un raro lleva la cámara hasta ahí;
  // en la compu también se camina con WASD. Parado en un lugar se puede girar todo alrededor.
  const look = { yaw: 0, pitch: 0, zoom: 0, idle: 99, at: null as { x: number; z: number } | null };
  const IDLE_SECONDS = 12;
  const fingers = new Map<number, { x: number; y: number; sx: number; sy: number; t0: number }>();
  const walk = new Set<string>();
  const WALK_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
  window.addEventListener('keydown', (e) => {
    if (mode === 'pista' && WALK_KEYS.has(e.code) && !document.querySelector('.con-ventana') && !(e.target as Element).closest?.('input, textarea')) walk.add(e.code);
  });
  window.addEventListener('keyup', (e) => walk.delete(e.code));
  window.addEventListener('blur', () => walk.clear());
  const stand = (x: number, z: number) => {
    look.at = { x: clamp(x, -CLUB.halfW + 1.4, CLUB.halfW - 1.4), z: clamp(z, CLUB.backZ + 1.4, CLUB.frontZ - 1.4) };
    look.idle = 0;
  };
  const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
  const onFloor = (e: Event) => mode === 'pista' && (e.target === document.body || e.target === document.documentElement);
  const zoomBy = (d: number) => {
    look.zoom = clamp(look.zoom + d, 0, 1);
    look.idle = 0;
  };
  window.addEventListener('pointerdown', (e) => {
    if (onFloor(e)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t0: performance.now() });
  });
  window.addEventListener('pointermove', (e) => {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    if (mode !== 'pista') return fingers.clear();
    const dx = e.clientX - f.x, dy = e.clientY - f.y;
    if (fingers.size === 1) {
      look.yaw = look.at ? look.yaw - dx * 0.005 : clamp(look.yaw - dx * 0.005, -1.25, 1.25);
      look.pitch = clamp(look.pitch + dy * 0.004, -0.1, 0.7);
      look.idle = 0;
    } else {
      // Dos dedos: lo que se separan o se juntan es el zoom.
      const other = [...fingers.entries()].find(([id]) => id !== e.pointerId)![1];
      zoomBy((Math.hypot(e.clientX - other.x, e.clientY - other.y) - Math.hypot(f.x - other.x, f.y - other.y)) / 250);
    }
    f.x = e.clientX;
    f.y = e.clientY;
  });
  const lift = (e: PointerEvent) => fingers.delete(e.pointerId);
  window.addEventListener('pointerup', (e) => {
    const f = fingers.get(e.pointerId);
    // Un toque corto y sin arrastrar: ir hasta ahí (al raro que se tocó, o a ese lugar del piso).
    if (!f || fingers.size > 1 || mode !== 'pista' || performance.now() - f.t0 > 350 || Math.hypot(e.clientX - f.sx, e.clientY - f.sy) > 8) return;
    const i = pointed();
    if (i >= 0 && crowd.headTop(i, v)) return stand(v.x, v.z);
    v.set((e.clientX / window.innerWidth) * 2 - 1, 1 - (e.clientY / window.innerHeight) * 2, 0.5).unproject(stage.camera).sub(stage.camera.position);
    if (v.y > -0.02) return;
    const k = -stage.camera.position.y / v.y;
    stand(stage.camera.position.x + v.x * k, stage.camera.position.z + v.z * k);
  });
  window.addEventListener('pointerup', lift);
  window.addEventListener('pointercancel', lift);
  window.addEventListener('wheel', (e) => onFloor(e) && zoomBy(-e.deltaY * 0.0012), { passive: true });
  let showcase: number[] = [];
  const pickShowcase = () => {
    const named: number[] = [];
    for (let i = hasFirst ? 1 : 0; i < crowd.count; i++) if (crowd.nameOf(i)) named.push(i);
    showcase = [];
    for (let k = 0; k < (touch ? 3 : 6) && named.length; k++) showcase.push(named.splice(Math.floor(Math.random() * named.length), 1)[0]);
  };
  rebuild();

  // --- Música y beat ---------------------------------------------------------------------
  let current: SetInfo | null = null;
  let playlist: SetInfo[] = [];
  let bpm = 126;
  let beats = 0;
  let energy = 0.7;
  tele.onState = (p) => room.onPlayState?.(p);
  tele.onEnded = () => {
    // Terminó el set: sigue el anterior de la lista (del más nuevo al más viejo).
    if (!current || !playlist.length) return;
    const i = playlist.findIndex((s) => s.id === current!.id);
    room.play(playlist[(i + 1) % playlist.length], playlist);
  };

  /** Arriba de 150 BPM (drum and bass) se baila a medio tiempo, si no es un flipper. */
  const danceBpmOf = (b: number) => (b > 150 ? b / 2 : b);

  // --- Cámara ----------------------------------------------------------------------------
  let mode: BoilerMode = 'afuera';
  let view: LookView = 'todo';
  const camPos = new THREE.Vector3(0, 2.2, 6.7);
  const camTarget = new THREE.Vector3(0, 1.75, 0.4);
  // --- Entrada y volumen -------------------------------------------------------------------
  /** Segundos desde que se apretó entrar (-1 = todavía en la vereda). */
  let entering = -1;
  let entered: (() => void) | null = null;
  /** La entrada: llegar (0–1.7), el patova mira y revisa la lista (hasta 3.3), abre (3.3–4.3) y se entra. */
  const ENTER_SECONDS = 6.6, DOOR_AT = 3.3;
  /** En qué momento el patova pregunta el nombre: ahí la entrada espera la respuesta. */
  const ASK_AT = 2.2;
  let ask: (() => Promise<string | null>) | null = null;
  let asking = false;
  /** Lo que dice el patova al dejarlo pasar. */
  let welcome = 'ESTAS. PASA.';
  /** El creador está abierto en la puerta: la cámara se acerca al raro que se está armando (0–1). */
  let dressing = false, dressK = 0, doorSpin: number | null = null;
  // En iPhone el volumen del player no se puede manejar: ahí el set suena a volumen normal desde que se aprieta.
  const fixedVolume = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
  /** Cuánto se escucha el set desde la vereda (0–1). El audio de YouTube no se puede filtrar: "de afuera" es bajito, con el ambiente de la calle encima. */
  const OUTSIDE = 0.12;
  /** Volumen del set al que hay que llegar (0–1). */
  let wantVolume = OUTSIDE;

  tele.volume = fixedVolume ? 1 : OUTSIDE;
  const ease = (x: number) => {
    const k = Math.max(0, Math.min(1, x));
    return k * k * (3 - 2 * k);
  };
  const a0 = new THREE.Vector3(), a1 = new THREE.Vector3();
  const wantPos = new THREE.Vector3();
  const wantTarget = new THREE.Vector3();
  let fov = 52;

  stage.scene = scene;
  stage.onResize = (w, h) => tele.setSize(w, h);
  stage.onAfterRender = () => tele.render();
  stage.onUpdate = (t, dt) => {
    // Sin video (o si YouTube no cargó) la pista baila igual; con el video en pausa, se frena.
    const target = mode === 'creador' ? 0.8 : mode === 'pelea' ? 1 : tele.videoId ? (tele.playing ? 1 : 0.12) : 0.7;
    energy += (target - energy) * Math.min(1, dt * 3);
    const danceBpm = danceBpmOf(bpm);
    beats += (dt * danceBpm) / 60 * (0.25 + 0.75 * Math.min(1, energy * 1.4));
    club.update(beats, energy, t);
    if (mode === 'pista') crowd.wander(dt, energy);
    crowd.update(beats, energy, t);
    djs.update(beats, energy);
    if (afuera.group.visible) afuera.update(beats, energy, t);
    if (patio.group.visible) patio.update(beats, energy, t);
    // El volumen del set va llegando de a poco a donde tiene que estar.
    if (!fixedVolume) tele.volume = tele.volume + Math.sign(wantVolume - tele.volume) * Math.min(Math.abs(wantVolume - tele.volume), dt * 1.2);
    stage.post.pulse = Math.max(0, 1 - (beats - Math.floor(beats)) * 2) * energy;

    if (mode === 'pista' && namesLeft > 0) namesLeft -= dt;

    if (mode === 'pelea') return room.takeover?.update(t, dt);

    const portrait = stage.camera.aspect < 1;
    let wantFov: number;
    if (mode === 'afuera') {
      // En la vereda la cámara no persigue nada: va por un camino fijo hasta adentro.
      const e = Math.max(0, entering);
      if (entering >= ASK_AT && ask) {
        // El patova ya tiene la lista en la mano: pregunta, y todo espera la respuesta.
        const question = ask;
        ask = null;
        asking = true;
        entering = ASK_AT;
        void question().then((name) => {
          asking = false;
          welcome = name ? sinTildes(`ESTAS, ${name}. PASA.`) : 'BUENO, PASA.';
        });
      }
      if (entering >= 0 && !asking) entering += dt;
      // Parado en la calle, del otro lado del carril por donde pasan los autos.
      const back = portrait ? 12.5 : 9.8, z = PUERTA.z;
      afuera.traffic = entering < 0;
      // 1) Caminar hasta la puerta. 2) El patova te mira, revisa la lista y te abre.
      // 3) Entrar hasta el lugar de siempre.
      const walk = ease(e / 1.9), open = ease((e - DOOR_AT) / 1.0), inside = ease((e - DOOR_AT - 0.8) / 2.1);
      const moving = (e > 0 && e < 1.8) || (e > DOOR_AT + 0.8 && e < ENTER_SECONDS - 0.4) ? 1 : 0;
      // Frena a unos pasos de la puerta, con el patova en cuadro (en vertical entra menos a lo ancho).
      const stop = portrait ? 6.6 : 4;
      a0.set(Math.sin(t * 0.2) * 0.3 * (1 - walk), 1.75 + Math.abs(Math.sin(e * 6.5)) * 0.045 * moving, z + back + (stop - back) * walk);
      a1.set(0, portrait ? 2.7 : 2.2, portrait ? 9.6 : 6.7);
      camPos.lerpVectors(a0, a1, inside);
      // Mientras revisa la lista, la mirada se va un poco hacia él.
      const chat = ease((e - 1.2) / 0.7) * (1 - ease((e - DOOR_AT - 0.2) / 0.7));
      a0.set((portrait ? 1.5 : 1.25) * chat, (portrait ? 3.4 : 2.6 - 0.5 * walk) * (1 - chat) + 1.75 * chat, z);
      a1.set(0, portrait ? 2.35 : 1.75, 0.4);
      camTarget.lerpVectors(a0, a1, inside);
      // Armando el raro en la puerta: la cámara se le acerca, como en el creador de adentro.
      dressK += ((dressing ? 1 : 0) - dressK) * Math.min(1, dt * 4);
      afuera.guestDress(dressing, doorSpin);
      let dressFov = portrait ? 66 : 52;
      if (dressK > 0.001) {
        const g = afuera.guestSpot(), big = Math.max(1, g.size);
        const at = view === 'cabeza' ? 1.5 * g.size : view === 'piernas' ? 0.45 * g.size : 0.95 * big;
        const dist = view === 'todo' ? 3.3 * big : 2.3;
        if (portrait) {
          // El menú tapa más de la mitad de abajo: el personaje va arriba, visto desde lo alto.
          const [up, down, far] = view === 'todo' ? [1.75 * big, 1.55 * big, 4.6 * big] : view === 'cabeza' ? [1.0, 1.5, 3.0] : [1.4, 1.75, 3.5];
          wantPos.set(g.x, at + up, g.z + far);
          wantTarget.set(g.x, at - down, g.z);
          dressFov = 62;
        } else {
          // El menú va a la izquierda: el personaje queda del otro lado.
          const side = -0.9 * (dist / 3.95);
          wantPos.set(g.x + side, at + (view === 'todo' ? big : 0.45), g.z + dist);
          wantTarget.set(g.x + side, at, g.z);
          dressFov = 48;
        }
        camPos.lerp(wantPos, dressK);
        camTarget.lerp(wantTarget, dressK);
      }
      afuera.setDoors(open);
      afuera.guestWalk(ease((e - DOOR_AT - 0.35) / 1.5));
      // El patova: te mira cuando llegás, baja la vista a la lista, te vuelve a mirar y abre.
      const list = ease((e - 1.5) / 0.5) * (1 - ease((e - DOOR_AT + 0.45) / 0.35));
      afuera.bouncer(ease((e - 0.4) / 0.8) * (1 - ease((e - DOOR_AT - 0.9) / 0.6)), list, ease((e - DOOR_AT + 0.1) / 0.6) * (1 - ease((e - DOOR_AT - 1.6) / 0.8)), camPos.x, camPos.z);
      // Al abrirse la puerta el set pasa de escucharse bajito a sonar a pleno, y el ambiente
      // de la vereda (la calle, la gente de la fila) queda atrás.
      const clear = ease((e - DOOR_AT) / 1.6);
      wantVolume = OUTSIDE + (1 - OUTSIDE) * clear;
      // Si el navegador ya deja sonar, la vereda se escucha desde antes de apretar nada.
      if (!street.playing && e < ENTER_SECONDS - 1 && audioLive()) street.start(0.6);
      street.level(0.6 * (1 - clear));
      fov = (portrait ? 66 : 52) + (dressFov - (portrait ? 66 : 52)) * dressK;
      stage.camera.position.copy(camPos);
      stage.camera.lookAt(camTarget);
      if (Math.abs(stage.camera.fov - fov) > 0.01) {
        stage.camera.fov = fov;
        stage.camera.updateProjectionMatrix();
      }
      if (e >= ENTER_SECONDS) {
        street.stop();
        room.setMode('pista');
        entered?.();
        entered = null;
      }
      return;
    }
    if (mode === 'patio') {
      wantPos.set(PATIO.x + Math.sin(t * 0.13) * 0.5, portrait ? 2.6 : 2.0, PATIO.back + (portrait ? 14.5 : 9.4));
      wantTarget.set(PATIO.x, portrait ? 1.9 : 1.45, PATIO.back);
      wantFov = portrait ? 66 : 54;
    } else if (mode === 'creador') {
      // El menú va a la izquierda (o abajo en el celular): el personaje queda del otro lado.
      // Según la pestaña se acerca a la cabeza o a las piernas (la altura depende del cuerpo).
      const size = crowd.scaleOf(0), big = Math.max(1, size);
      const at = view === 'cabeza' ? 1.5 * size : view === 'piernas' ? 0.45 * size : 0.95 * big;
      const dist = view === 'todo' ? 3.3 * big : 2.3;
      if (portrait) {
        // El menú tapa más de la mitad de abajo: el personaje va arriba, visto desde lo alto para
        // que la tele de la pared del fondo quede fuera de cuadro.
        const [up, down, back] = view === 'todo' ? [1.75 * big, 1.55 * big, 4.6 * big] : view === 'cabeza' ? [1.0, 1.5, 3.0] : [1.4, 1.75, 3.5];
        wantPos.set(0, at + up, -0.55 + back);
        wantTarget.set(0, at - down, -0.55);
        wantFov = 62;
      } else {
        const side = -0.9 * (dist / 3.95);
        // Un poco desde arriba: así la tele de la pared del fondo no queda atrás de la cabeza.
        wantPos.set(side, at + (view === 'todo' ? big : 0.45), -0.55 + dist);
        wantTarget.set(side, at, -0.55);
        wantFov = 48;
      }
    } else {
      const kick = stage.post.pulse * 0.04;
      wantPos.set(Math.sin(t * 0.13) * 1.3, (portrait ? 2.7 : 2.2) + Math.sin(t * 0.21) * 0.1, (portrait ? 9.6 : 6.7) - kick);
      wantTarget.set(0, portrait ? 2.35 : 1.75, 0.4);
      wantFov = portrait ? 66 : 52;
      // Lo que movió el visitante: gira alrededor de adonde mira; con zoom, el centro se corre
      // a la pista y la cámara sube lo justo para pasar por arriba de los DJs.
      look.idle += dt;
      if (walk.size) {
        // Adelante es para donde mira la cámara.
        const f = (walk.has('KeyW') ? 1 : 0) - (walk.has('KeyS') ? 1 : 0), r = (walk.has('KeyD') ? 1 : 0) - (walk.has('KeyA') ? 1 : 0);
        const at = look.at ?? { x: 0, z: -0.6 }, s = Math.sin(look.yaw), c = Math.cos(look.yaw), step = 3 * dt;
        stand(at.x + (-s * f + c * r) * step, at.z + (-c * f - s * r) * step);
      }
      if (look.idle > IDLE_SECONDS && !fingers.size) {
        if (look.at) {
          // Vuelve a la toma de siempre (por el lado más corto si dio toda la vuelta).
          look.at = null;
          look.yaw = clamp(Math.atan2(Math.sin(look.yaw), Math.cos(look.yaw)), -1.25, 1.25);
        }
        const back = Math.exp(-dt * 1.5);
        look.yaw *= back;
        look.pitch *= back;
        look.zoom *= back;
      }
      if (look.at) {
        // Parado en un lugar de la pista: la cámara le gira alrededor, de cerca.
        const pitch = clamp(0.22 + look.pitch, 0.05, 0.95);
        const dx = Math.sin(look.yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = Math.cos(look.yaw) * Math.cos(pitch);
        // Contra una pared (o el techo) la cámara se acerca, en vez de quedar del otro lado.
        const room = (from: number, d: number, min: number, max: number) => (d > 1e-4 ? (max - from) / d : d < -1e-4 ? (min - from) / d : Infinity);
        const dist = Math.min(4.6 - 2.6 * look.zoom, room(look.at.x, dx, -CLUB.halfW + 0.4, CLUB.halfW - 0.4), room(1.3, dy, 0, CLUB.ceilY - 0.5), room(look.at.z, dz, CLUB.backZ + 0.4, CLUB.frontZ - 0.4));
        wantTarget.set(look.at.x, 1.3, look.at.z);
        wantPos.set(look.at.x + dx * dist, 1.3 + dy * dist, look.at.z + dz * dist);
      } else if (Math.abs(look.yaw) + Math.abs(look.pitch) + look.zoom > 0.002) {
        a0.subVectors(wantPos, wantTarget);
        const far = a0.length(), z = ease(look.zoom);
        const yaw = Math.atan2(a0.x, a0.z) + look.yaw;
        const pitch = Math.max(Math.asin(a0.y / far) + look.pitch, 0.35 * z);
        const dist = far + (4.2 - far) * z;
        wantTarget.y += (1.5 - wantTarget.y) * z;
        wantTarget.z += (-2.2 - wantTarget.z) * z;
        wantPos.set(
          clamp(wantTarget.x + Math.sin(yaw) * Math.cos(pitch) * dist, -CLUB.halfW + 0.5, CLUB.halfW - 0.5),
          Math.min(wantTarget.y + Math.sin(pitch) * dist, CLUB.ceilY - 0.5),
          Math.max(wantTarget.z + Math.cos(yaw) * Math.cos(pitch) * dist, CLUB.backZ + 0.5),
        );
      }
    }
    const k = Math.min(1, dt * 4);
    camPos.lerp(wantPos, k);
    camTarget.lerp(wantTarget, k);
    fov += (wantFov - fov) * k;
    stage.camera.position.copy(camPos);
    stage.camera.lookAt(camTarget);
    if (Math.abs(stage.camera.fov - fov) > 0.01) {
      stage.camera.fov = fov;
      stage.camera.updateProjectionMatrix();
    }
  };

  const v = new THREE.Vector3();
  const label = (ctx: CanvasRenderingContext2D, w: number, h: number, i: number, color: string, arrow: boolean, t: number) => {
    const name = sinTildes(crowd.nameOf(i));
    if (!crowd.headTop(i, v) || (!name && !arrow)) return;
    v.project(stage.camera);
    if (v.z > 1 || v.z < -1) return;
    // Chicos, para que no tapen a la gente: el propio un poco más grande que los demás.
    const unit = Math.max(6, Math.round(titleUnit(w, h) * (arrow ? 0.7 : 0.5)));
    const x = Math.round((v.x * 0.5 + 0.5) * w);
    let y = Math.round((-v.y * 0.5 + 0.5) * h) - unit;
    if (arrow) {
      const bob = Math.round(Math.abs(Math.sin(t * 5)) * 3);
      outlined(ctx, 'V', x, y - bob, unit, DR.rojo);
      y -= unit + 4;
    }
    if (name) outlined(ctx, name, x, y, unit, color);
  };
  /** El raro que está abajo del puntero (el de más adelante, si se tapan), o -1. */
  const feet = new THREE.Vector3();
  const pointed = () => {
    if (pointer.x < 0 || performance.now() > pointer.until) return -1;
    const px = pointer.x * 2 - 1, py = 1 - pointer.y * 2;
    let best = -1, near = Infinity;
    for (let i = 0; i < crowd.count; i++) {
      if (!crowd.headTop(i, v)) continue;
      feet.set(v.x, 0, v.z).project(stage.camera);
      v.project(stage.camera);
      if (v.z > 1 || v.z < -1 || v.z >= near) continue;
      const tall = v.y - feet.y;
      if (py > v.y + tall * 0.1 || py < feet.y || Math.abs(px - v.x) * stage.camera.aspect > tall * 0.3) continue;
      best = i;
      near = v.z;
    }
    return best;
  };

  const room: BoilerRoom = {
    scene,
    takeover: null,
    onNowPlaying: null,
    onPlayState: null,
    toggle: () => tele.toggle(),
    skip(d) {
      if (!current || !playlist.length) return;
      const i = playlist.findIndex((s) => s.id === current!.id);
      room.play(playlist[(i + d + playlist.length) % playlist.length]);
    },
    setPista(data) {
      // Un guardado con opciones viejas (de antes de un cambio de menú) no se dibuja.
      // Uno de antes de que hubiera más opciones se completa con "nada" en lo que le falta.
      const fix = (r: Raro | null): Raro | null => {
        const look = r && validLook(r.look);
        return r && look ? { ...r, look } : null;
      };
      pista = { ...data, raros: data.raros.map(fix).filter((r): r is Raro => r !== null), mine: fix(data.mine) };
      rebuild();
    },
    setDraft(d) {
      // En la vereda el que se arma es el raro parado en la puerta.
      if (mode === 'afuera') return afuera.guest(d ? d.look : null);
      const had = hasFirst;
      draft = d ? { id: 'draft', ...d } : null;
      const first = draft ?? pista.mine;
      // Mientras se edita, alcanza con repintar el primero; si aparece o desaparece, se rearma.
      if (first && had) crowd.setLook(0, first.look, first.name);
      else rebuild();
    },
    setMode(m) {
      // En la vereda, "abrir el creador" es armar el raro ahí mismo: no se cambia de lugar.
      if (mode === 'afuera' && entering >= 0 && entering < ENTER_SECONDS && (m === 'creador' || dressing)) {
        dressing = m === 'creador';
        view = 'todo';
        doorSpin = null;
        return;
      }
      if (m === 'pista' && mode !== 'pista') {
        namesLeft = NAMES_SECONDS;
        pickShowcase();
      }
      mode = m;
      club.booth.visible = m !== 'creador';
      for (const b of club.beams) b.visible = m !== 'creador';
      djGroup.visible = m === 'pista' || m === 'afuera';
      tele.interactive = m === 'pista';
      afuera.group.visible = m === 'afuera';
      // Los juegos ('pelea') se juegan en el patio.
      patio.group.visible = m === 'patio' || m === 'pelea';
      // En el patio la música llega más baja.
      if (m !== 'afuera') wantVolume = m === 'patio' || m === 'pelea' ? 0.4 : 1;
      crowd.setSolo(m === 'creador');
      view = 'todo';
      crowd.spin = null;
    },
    setView(v) {
      view = v;
    },
    setSpin(yaw) {
      if (mode === 'afuera') doorSpin = yaw;
      else crowd.spin = yaw;
    },
    setGuest: (look) => afuera.guest(look),
    enter(skip, question) {
      if (mode !== 'afuera') return Promise.resolve();
      ask = skip ? null : (question ?? null);
      // Este es el primer click: recién ahora el navegador deja sonar.
      tele.enableSound();
      if (skip) {
        entering = ENTER_SECONDS;
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        entered = resolve;
        if (entering < 0) entering = 0;
        // Un segundo toque (o tecla) saltea la espera de la lista: la puerta se abre ya.
        const hurry = () => {
          if (mode !== 'afuera') return stopHurry();
          // (No mientras el patova espera el nombre: ahí manda la ventana de la lista.)
          if (!ask && !asking && entering > 0.4 && entering < DOOR_AT) entering = DOOR_AT;
        };
        const stopHurry = () => {
          window.removeEventListener('pointerdown', hurry);
          window.removeEventListener('keydown', hurry);
        };
        window.addEventListener('pointerdown', hurry);
        window.addEventListener('keydown', hurry);
      });
    },
    play(set, list) {
      if (list) playlist = list;
      current = set;
      bpm = set.bpm;
      room.onNowPlaying?.(set);
      void tele.play(set.id);
    },
    unlockSound: () => tele.enableSound(),
    isPlaying: () => tele.playing,
    playing: () => current,
    drawOverlay(ctx, w, h, t) {
      if (mode === 'pelea') return room.takeover?.drawOverlay(ctx, w, h, t);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (mode === 'afuera' && entering > 1.6 && entering < DOOR_AT + 1.2 && !asking) {
        // Lo que dice el patova, abajo, como subtítulo (mientras pregunta el nombre lo dice la ventana).
        const says = entering < DOOR_AT - 0.5 ? 'A VER SI ESTAS EN LA LISTA...' : welcome;
        const unit = titleUnit(w, h);
        outlined(ctx, says, w / 2, Math.round(h * 0.84), Math.min(unit, Math.floor((w * 0.9) / says.length)), entering < DOOR_AT - 0.5 ? DR.crema : DR.amarillo);
      }
      if (mode === 'creador') return void (hasFirst && label(ctx, w, h, 0, DR.amarillo, false, t));
      if (mode !== 'pista') return;
      if (tele.stuck && Math.floor(t * 2) % 4 !== 3) {
        // El set no arrancó solo: cartel titilando abajo de la tele, que es donde hay que tocar.
        const says = 'TOCA LA TELE PARA QUE SUENE';
        v.set(CLUB.tele.x, CLUB.tele.y - CLUB.tele.h / 2 - 0.3, CLUB.tele.z).project(stage.camera);
        const y = v.z > 1 || v.z < -1 ? h * 0.3 : (-v.y * 0.5 + 0.5) * h;
        outlined(ctx, says, w / 2, Math.round(Math.max(h * 0.12, Math.min(h * 0.8, y))), Math.min(titleUnit(w, h), Math.floor((w * 0.92) / says.length)), DR.amarillo);
      }
      if (namesLeft > 0) {
        // Al final se van apagando.
        ctx.globalAlpha = Math.min(1, namesLeft);
        for (const i of showcase) label(ctx, w, h, i, DR.crema, false, t);
        if (hasFirst) label(ctx, w, h, 0, DR.amarillo, true, t);
        if (look.idle > IDLE_SECONDS) {
          const says = 'ARRASTRA PARA MIRAR - TOCA PARA IR';
          outlined(ctx, says, w / 2, Math.round(h * 0.9), Math.max(6, Math.min(Math.round(titleUnit(w, h) * 0.5), Math.floor((w * 0.92) / says.length))), DR.crema);
        }
        ctx.globalAlpha = 1;
      }
      const i = pointed();
      const mine = hasFirst && i === 0;
      if (i >= 0 && !(namesLeft > 0.5 && (mine || showcase.includes(i)))) label(ctx, w, h, i, mine ? DR.amarillo : DR.crema, mine, t);
    },
  };
  return room;
}

export { CLUB };
