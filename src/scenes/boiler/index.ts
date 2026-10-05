import * as THREE from 'three';
import { type Look, type Raro, type SetInfo, randomLook } from '../../../shared/look';
import type { PistaData } from '../../api';
import { DR, type PSXStage, outlined, psxUniforms, titleUnit } from '../../style-kit';
import { isTouch, sinTildes } from '../../ui/dom';
import { CLUB, buildClub } from './club';
import { Crowd, MAX_DANCERS } from './crowd';
import { loadGlbRig } from '../../characters/glbRig';
import { buildPlaceholderDjs, makeDjs } from './djs';
import { Tele } from './tele';

/** Con menos gente real que esto, la pista se completa con extras sin nombre. */
const MIN_FILL = 48;
const FOG = '#120a1f';

export type BoilerMode = 'pista' | 'creador';

export interface BoilerRoom {
  /** Quiénes están en la pista (lo que devuelve la API). */
  setPista(data: PistaData): void;
  /** Vista previa del personaje que se está armando (null = volver a lo guardado). */
  setDraft(draft: { name: string; look: Look } | null): void;
  /** 'creador' acerca la cámara al personaje del visitante y esconde la cabina. */
  setMode(mode: BoilerMode): void;
  /** Pone un set en la tele y la pista baila a su BPM. */
  play(set: SetInfo, playlist?: SetInfo[]): void;
  playing(): SetInfo | null;
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
  scene.add(club.group, crowd.group, djGroup, tele.object);

  // --- Quién baila ---------------------------------------------------------------------
  let pista: PistaData = { total: 0, raros: [], mine: null };
  let draft: Raro | null = null;
  /** ¿El primer lugar de la pista es el del visitante? */
  let hasFirst = false;
  const bots: Raro[] = [];
  {
    let seed = 2024;
    const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < MAX_DANCERS; i++) bots.push({ id: `bot-${i}`, name: '', look: randomLook(r) });
  }
  const rebuild = () => {
    const first = draft ?? pista.mine;
    hasFirst = Boolean(first);
    const others = pista.raros.filter((x) => x.id !== pista.mine?.id);
    const list = [...(first ? [first] : []), ...others];
    const fill = Math.max(0, Math.min(crowd.capacity, MIN_FILL) - list.length);
    crowd.setDancers([...list, ...bots.slice(0, fill)]);
    pickShowcase();
  };

  // Nombres que se muestran de a ratos (además del propio, que está siempre).
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
  tele.onEnded = () => {
    // Terminó el set: sigue el anterior de la lista (del más nuevo al más viejo).
    if (!current || !playlist.length) return;
    const i = playlist.findIndex((s) => s.id === current!.id);
    room.play(playlist[(i + 1) % playlist.length], playlist);
  };

  // --- Cámara ----------------------------------------------------------------------------
  let mode: BoilerMode = 'pista';
  const camPos = new THREE.Vector3(0, 2.2, 6.7);
  const camTarget = new THREE.Vector3(0, 1.75, 0.4);
  const wantPos = new THREE.Vector3();
  const wantTarget = new THREE.Vector3();
  let fov = 52;
  let lastShowcase = 0;

  stage.scene = scene;
  stage.onResize = (w, h) => tele.setSize(w, h);
  stage.onAfterRender = () => tele.render();
  stage.onUpdate = (t, dt) => {
    // Sin video (o si YouTube no cargó) la pista baila igual; con el video en pausa, se frena.
    const target = mode === 'creador' ? 0.8 : tele.videoId ? (tele.playing ? 1 : 0.12) : 0.7;
    energy += (target - energy) * Math.min(1, dt * 3);
    // Arriba de 150 BPM (drum and bass) se baila a medio tiempo, si no es un flipper.
    const danceBpm = bpm > 150 ? bpm / 2 : bpm;
    beats += (dt * danceBpm) / 60 * (0.25 + 0.75 * Math.min(1, energy * 1.4));
    club.update(beats, energy, t);
    crowd.update(beats, energy, t);
    djs.update(beats, energy);
    stage.post.pulse = Math.max(0, 1 - (beats - Math.floor(beats)) * 2) * energy;

    if (t - lastShowcase > 5) {
      lastShowcase = t;
      pickShowcase();
    }

    const portrait = stage.camera.aspect < 1;
    let wantFov: number;
    if (mode === 'creador') {
      // El menú va a la izquierda (o abajo en el celular): el personaje queda del otro lado.
      if (portrait) {
        wantPos.set(0, 0.7, 4.2);
        wantTarget.set(0, 0.15, -0.55);
        wantFov = 62;
      } else {
        wantPos.set(-0.9, 1.25, 3.4);
        wantTarget.set(-0.9, 1.05, -0.55);
        wantFov = 48;
      }
    } else {
      const kick = stage.post.pulse * 0.04;
      wantPos.set(Math.sin(t * 0.13) * 1.3, (portrait ? 2.7 : 2.2) + Math.sin(t * 0.21) * 0.1, (portrait ? 9.6 : 6.7) - kick);
      wantTarget.set(0, portrait ? 2.35 : 1.75, 0.4);
      wantFov = portrait ? 66 : 52;
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
    const unit = titleUnit(w, h);
    const x = Math.round((v.x * 0.5 + 0.5) * w);
    let y = Math.round((-v.y * 0.5 + 0.5) * h) - unit;
    if (arrow) {
      const bob = Math.round(Math.abs(Math.sin(t * 5)) * 3);
      outlined(ctx, 'V', x, y - bob, unit, DR.rojo);
      y -= unit + 4;
    }
    if (name) outlined(ctx, name, x, y, unit, color);
  };

  const room: BoilerRoom = {
    onNowPlaying: null,
    setPista(data) {
      pista = data;
      rebuild();
    },
    setDraft(d) {
      const had = hasFirst;
      draft = d ? { id: 'draft', ...d } : null;
      const first = draft ?? pista.mine;
      // Mientras se edita, alcanza con repintar el primero; si aparece o desaparece, se rearma.
      if (first && had) crowd.setLook(0, first.look, first.name);
      else rebuild();
    },
    setMode(m) {
      mode = m;
      club.booth.visible = djGroup.visible = m === 'pista';
      crowd.setSolo(m === 'creador');
    },
    play(set, list) {
      if (list) playlist = list;
      current = set;
      bpm = set.bpm;
      void tele.play(set.id);
      room.onNowPlaying?.(set);
    },
    playing: () => current,
    drawOverlay(ctx, w, h, t) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (mode === 'pista') for (const i of showcase) label(ctx, w, h, i, DR.crema, false, t);
      if (hasFirst) label(ctx, w, h, 0, DR.amarillo, mode === 'pista', t);
    },
  };
  return room;
}

export { CLUB };
