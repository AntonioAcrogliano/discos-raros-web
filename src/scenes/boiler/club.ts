import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Music } from './luces';
import {
  DR,
  DR_CYCLE,
  FONT,
  LOGO_ASPECT,
  type PSXMaterial,
  box,
  fontsReady,
  makeCanvas,
  makeCheckerTexture,
  makeLogoCanvas,
  makePSXMaterial,
  makeRecordTexture,
  makeSpeakerTexture,
  makeWallTexture,
  setPSXMap,
  toPSXTexture,
} from '../../style-kit';

/** Medidas del club (metros). La cámara mira hacia -z: cabina adelante, pista atrás, tele al fondo. */
export const CLUB = {
  halfW: 16,
  backZ: -12.5,
  frontZ: 9.6,
  ceilY: 7.8,
  boothZ: 2.5,
  boothH: 1.0,
  djZ: 1.86,
  tele: { x: 0, y: 5.5, z: -12.32, w: 7.2, h: 4.05 },
};

/**
 * Los palcos: un nivel levantado en U, contra la pared del fondo y las dos de los costados, al
 * que se sube por una escalera en la punta de cada brazo (del lado de la entrada). Son macizos:
 * abajo no se camina, así que la altura del piso depende solo de dónde se está parado.
 */
export const PALCO = {
  /** Altura del piso de arriba. */
  h: 1.5,
  /** Cuánto se meten hacia adentro desde la pared (el del fondo y los de los costados). */
  deep: 4.2,
  /** Hasta dónde llegan los brazos (z); de ahí baja la escalera, hacia la entrada. */
  frontZ: 3.0,
  stairs: 2.8,
};

/** Ancho de cada brazo del palco, desde la pared. */
export const ARM = PALCO.deep;

/** La barra: en el palco del fondo, a la derecha de la tele, de frente a la pista. El barman atiende de espaldas a la pared. */
export const BARRA = { x0: 4.8, x1: 11.8, front: -10.95, h: 1.05, barmanZ: -12.0 };

/**
 * El pasillo del fondo: sale por la pared, a la izquierda de la tele, a la altura del palco, y
 * termina en el baño. `end` es donde arranca el baño. Ninguno de los dos se ve desde la pista:
 * hay que ir.
 */
export const PASILLO = { x: -8, halfW: 1.6, end: -17.5, ceil: PALCO.h + 3.5 };
/** El baño, al final del pasillo: los cubículos contra la pared de la izquierda (hasta `stalls`) y las piletas contra la del fondo. */
export const BANO = { x0: -12, x1: -4, back: -21.5, stalls: -10.8, sinks: { x0: -10.2, x1: -5.0, deep: 0.55 } };

/**
 * Sillones y mesas altas en los brazos del palco: los sillones contra la pared, entre las
 * pilastras; las mesas cerca de la baranda (z de cada uno).
 */
export const LOUNGE = { sofas: [-9.1, -5.9, -2.7], sofaLen: 2.4, seatX: CLUB.halfW - 0.65, tables: [-11.9, 0.9], tableX: CLUB.halfW - ARM + 0.9, tableR: 0.32 };

/**
 * El sótano: un cuarto abajo del fondo del boliche, con dos caños. Se baja por una escalera que
 * sale de la pared derecha del pasillo y va derecho hacia la derecha (`ESCALERA`).
 */
export const SOTANO = { x0: -0.4, x1: 11.6, z0: -22, z1: -14, y: -3.0, ceil: 0.6, poles: [[3.4, -18.8], [7.8, -18.8]] as [number, number][] };
export const ESCALERA = { x0: PASILLO.x + PASILLO.halfW, x1: SOTANO.x0, z0: -16.8, z1: -14.8 };

/** ¿Está atrás de la pared del fondo (en el pasillo, el baño o el sótano)? */
export const inBack = (z: number) => z < CLUB.backZ;
/** ¿Está en el sótano o en su escalera? */
export const inCellar = (x: number, z: number) => inBack(z) && x > ESCALERA.x0;

/**
 * La caja en la que está un punto (la cámara no sale de ahí): el salón, o el pasillo y el baño.
 * Desde el pasillo, la cámara puede quedar en el salón, mirando por la puerta.
 */
export function roomAt(x: number, z: number) {
  const { halfW, backZ, frontZ, ceilY } = CLUB;
  if (!inBack(z)) return { x0: -halfW, x1: halfW, z0: backZ, z1: frontZ, y1: ceilY };
  if (inCellar(x, z)) {
    // En la escalera, la cámara puede quedar arriba, en el pasillo; abajo, no sale del sótano.
    if (x < SOTANO.x0) return { x0: PASILLO.x - PASILLO.halfW, x1: SOTANO.x1, z0: ESCALERA.z0, z1: ESCALERA.z1, y1: PASILLO.ceil };
    return { x0: ESCALERA.x0, x1: SOTANO.x1, z0: SOTANO.z0, z1: SOTANO.z1, y1: SOTANO.ceil };
  }
  const door = Math.abs(x - PASILLO.x) < PASILLO.halfW;
  if (z > PASILLO.end) return { x0: PASILLO.x - PASILLO.halfW, x1: PASILLO.x + PASILLO.halfW, z0: BANO.back, z1: frontZ, y1: PASILLO.ceil };
  return { x0: BANO.x0, x1: BANO.x1, z0: BANO.back, z1: door ? frontZ : PASILLO.end, y1: PASILLO.ceil };
}

/** Altura del piso en un punto del boliche: 0 en la pista, `PALCO.h` arriba, y lo que toque en las escaleras. */
export function floorAt(x: number, z: number) {
  if (inBack(z)) {
    // Atrás: el sótano, su escalera (que baja derecho hacia la derecha) o, si no, la altura del palco.
    if (x >= SOTANO.x0 && x <= SOTANO.x1 && z >= SOTANO.z0 && z <= SOTANO.z1) return SOTANO.y;
    if (x > ESCALERA.x0 && x < ESCALERA.x1 && z >= ESCALERA.z0 && z <= ESCALERA.z1) return PALCO.h + ((SOTANO.y - PALCO.h) * (x - ESCALERA.x0)) / (ESCALERA.x1 - ESCALERA.x0);
    return PALCO.h;
  }
  if (z <= CLUB.backZ + PALCO.deep) return PALCO.h;
  if (Math.abs(x) >= CLUB.halfW - ARM) {
    if (z <= PALCO.frontZ) return PALCO.h;
    if (z < PALCO.frontZ + PALCO.stairs) return PALCO.h * (1 - (z - PALCO.frontZ) / PALCO.stairs);
  }
  return 0;
}

export interface Club {
  group: THREE.Group;
  /** Cabina y parlantes: se esconden mientras se crea un personaje, para verlo de cerca. */
  booth: THREE.Group;
  /** Haces, charcos de luz y brillitos de la bola: se apagan en el creador, que si no tiñen al personaje y no se ven los colores. */
  fx: THREE.Group;
  /** La luz del boliche: la violeta de siempre, que late un poco con el bombo. La aplica el boiler. */
  light: { ambient: THREE.Color; key: THREE.Color; fog: THREE.Color };
  /**
   * @param beats tiempo de baile en beats · @param energy 0–1 · @param t segundos
   * @param music lo que suena de verdad, si el set está analizado (luces.ts): ahí el bombo y los platillos salen de la música.
   */
  update(beats: number, energy: number, t: number, music?: Music | null): void;
}

const TAU = Math.PI * 2;

/** Material de luz: no pinta, suma (haces, charcos en el piso, resplandor de los tubos). */
export function glow(color: THREE.ColorRepresentation, opacity: number) {
  const m = makePSXMaterial({ color, lit: false, opacity, side: THREE.DoubleSide });
  m.blending = THREE.AdditiveBlending;
  return m;
}

/**
 * Junta las mallas quietas de `parent` que comparten material en una sola: muchas menos llamadas
 * de dibujo (importa en el celu). Los colores que laten siguen andando: van en el material.
 * Quedan como están las de `keep` (las que se mueven o se prenden y apagan), los grupos, las de
 * varios materiales y los resplandores, que se dibujan en su orden.
 */
export function bake(parent: THREE.Object3D, keep: THREE.Object3D[] = []) {
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const o of [...parent.children]) {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material) || m.renderOrder || keep.includes(m)) continue;
    m.updateMatrix();
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    byMat.set(m.material, [...(byMat.get(m.material) ?? []), g.applyMatrix4(m.matrix)]);
    parent.remove(m);
  }
  for (const [mat, geos] of byMat) parent.add(new THREE.Mesh(mergeGeometries(geos)!, mat));
  return parent;
}

export function buildClub(): Club {
  const group = new THREE.Group();
  const booth = new THREE.Group();
  const fx = new THREE.Group();
  group.add(booth, fx);
  const updaters: ((beats: number, energy: number, t: number) => void)[] = [];
  const { halfW, backZ, frontZ, ceilY } = CLUB;
  const depth = frontZ - backZ;

  // El golpe del bombo, que comparten todas las luces, y la luz general que late con él.
  let kick = 0;
  let music: Music | null = null;
  const light = { ambient: new THREE.Color(), key: new THREE.Color(), fog: new THREE.Color('#120a1f') };
  /** El color que baña el boliche: cambia cada cuatro beats y tiñe la luz general, como los tachos de un boliche. */
  const wash = new THREE.Color(DR_CYCLE[0]), washTo = new THREE.Color();
  /** Las cegadoras de atrás de la pista (0–1): pegan con el bombo cuando el tema está arriba. */
  let blind = 0;
  updaters.push((beats, energy) => {
    kick = music ? music.kick : Math.max(0, 1 - (beats - Math.floor(beats)) * 2.5) * energy;
    wash.lerp(washTo.set(DR_CYCLE[Math.floor(beats / 4) % DR_CYCLE.length]), 0.12);
    // Con el tema arriba, o en la segunda mitad de cada frase de 16 si no se sabe qué suena.
    const up = music ? Math.max(0, Math.min(1, (music.loud - 0.62) * 5)) : energy > 0.8 && Math.floor(beats / 8) % 2 ? 1 : 0;
    blind = kick * kick * up;
    // Más oscuro entre golpe y golpe, y cada bombo prende el salón del color del momento.
    const dark = 1 - 0.3 * Math.min(1, energy), hit = 0.3 * kick + 0.1 * blind;
    light.ambient.setRGB(0.4 * dark + wash.r * hit, 0.36 * dark + wash.g * hit, 0.5 * dark + wash.b * hit);
    light.key.setRGB(0.62, 0.58, 0.56).multiplyScalar(dark + 0.35 * kick + 0.25 * blind);
    light.fog.set('#120a1f').lerp(wash, 0.07 * kick);
  });

  // --- Pista: baldosas que cambian de color con el beat ------------------------------
  // Una sola textura con 4×4 píxeles por baldosa, que se redibuja en cada beat.
  const TX = Math.round(halfW * 2), TZ = Math.round(depth), PX = 4;
  const floorCv = makeCanvas(TX * PX, TZ * PX);
  const floorTex = toPSXTexture(floorCv.canvas);
  const floorGeo = new THREE.PlaneGeometry(halfW * 2, depth, TX, TZ);
  const floor = new THREE.Mesh(floorGeo, makePSXMaterial({ map: floorTex, lit: false }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, (frontZ + backZ) / 2);
  group.add(floor);
  let lastBeat = NaN;
  const tile = new THREE.Color();
  updaters.push((beats, energy) => {
    const beat = Math.floor(beats);
    if (beat === lastBeat) return;
    lastBeat = beat;
    const { ctx } = floorCv;
    ctx.fillStyle = '#08060c';
    ctx.fillRect(0, 0, TX * PX, TZ * PX);
    for (let z = 0; z < TZ; z++) {
      for (let x = 0; x < TX; x++) {
        const i = x * 7 + z * 3 + 40;
        const on = (i + beat) % 3 === 0;
        tile.set(DR_CYCLE[(i + beat) % DR_CYCLE.length]).multiplyScalar(on ? 0.35 + 0.5 * energy : 0.1);
        ctx.fillStyle = `#${tile.getHexString()}`;
        ctx.fillRect(x * PX, z * PX, PX - 1, PX - 1);
      }
    }
    floorTex.needsUpdate = true;
  });

  // --- Paredes y techo ---------------------------------------------------------------
  const wallTex = makeWallTexture();
  /** Un solo material para todas las paredes de ladrillo: así se juntan en una sola malla (ver `bake`). */
  const wallMat = makePSXMaterial({ map: wallTex });
  const wall = (w: number, h: number, repeatX: number, repeatY: number) => {
    const geo = new THREE.PlaneGeometry(w, h, Math.ceil(w / 2), Math.ceil(h / 2));
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repeatX, uv.getY(i) * repeatY);
    return new THREE.Mesh(geo, wallMat);
  };
  /** Cuántas veces se repite el ladrillo por metro de pared (a lo ancho y a lo largo). */
  const perW = 12 / 23, perD = 7 / 18;
  /** Un pedazo de la pared del fondo, con el ladrillo donde estaría si la pared fuera entera. */
  const backPart = (x0: number, x1: number, y0: number, y1: number) => {
    const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0, Math.ceil((x1 - x0) / 2), Math.ceil((y1 - y0) / 2));
    geo.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + halfW) * perW, (p.getY(i) / ceilY) * 4);
    const m = new THREE.Mesh(geo, wallMat);
    m.position.z = backZ;
    return m;
  };
  // Con el hueco de la puerta del pasillo (que arranca a la altura del palco).
  const doorL = PASILLO.x - PASILLO.halfW, doorR = PASILLO.x + PASILLO.halfW;
  const back = new THREE.Group();
  for (const part of [backPart(-halfW, doorL, 0, ceilY), backPart(doorR, halfW, 0, ceilY), backPart(doorL, doorR, PASILLO.ceil, ceilY), backPart(doorL, doorR, 0, PALCO.h)]) back.add(part);
  bake(back);
  const left = wall(depth, ceilY, perD * depth, 4);
  left.rotation.y = Math.PI / 2;
  left.position.set(-halfW, ceilY / 2, (frontZ + backZ) / 2);
  const right = wall(depth, ceilY, perD * depth, 4);
  right.rotation.y = -Math.PI / 2;
  right.position.set(halfW, ceilY / 2, (frontZ + backZ) / 2);
  // Techo (antes se veía el vacío al mirar para arriba) con sus vigas.
  const ceiling = new THREE.Mesh(wall(halfW * 2, depth, perW * halfW * 2, (10 / 18) * depth).geometry, makePSXMaterial({ map: wallTex, color: '#9a90b0' }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, ceilY, (frontZ + backZ) / 2);
  group.add(back, left, right, ceiling);

  // Pilastras entre tapa y tapa de disco, cada una con su tubo de neón que late con el bombo.
  const pilar = makePSXMaterial({ color: '#241a33' });
  const tubes: { tube: PSXMaterial; halo: PSXMaterial; color: THREE.Color }[] = [];
  // (Los tubos van altos: abajo, contra la pared, están los palcos.)
  for (let i = 0; backZ + 1.8 + i * 3.2 < frontZ - 3; i++) {
    const z = backZ + 1.8 + i * 3.2;
    group.add(box(halfW * 2, 0.26, 0.22, pilar, 0, ceilY - 0.13, z));
    for (const s of [-1, 1]) {
      const color = new THREE.Color(DR_CYCLE[(i * 2 + (s > 0 ? 1 : 0)) % 4]);
      const tube = makePSXMaterial({ color, lit: false });
      const halo = glow(color, 0.1);
      group.add(box(0.3, ceilY, 0.55, pilar, s * (halfW - 0.15), ceilY / 2, z), box(0.06, 1.7, 0.06, tube, s * (halfW - 0.34), 5.2, z));
      const h = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.2), halo);
      h.rotation.y = -s * (Math.PI / 2);
      h.position.set(s * (halfW - 0.31), 5.2, z);
      h.renderOrder = 1;
      group.add(h);
      tubes.push({ tube, halo, color });
    }
  }
  updaters.push((beats, energy) => {
    // Los de un lado laten con el bombo y los del otro a contratiempo (con los platillos, si se sabe qué suena).
    const off = music ? music.high : Math.max(0, 1 - (beats + 0.5 - Math.floor(beats + 0.5)) * 2.5) * energy;
    tubes.forEach(({ tube, halo, color }, i) => {
      const b = 0.35 + 0.65 * (i % 2 ? off : kick);
      tube.uniforms.uColor.value.copy(color).multiplyScalar(b);
      halo.uniforms.uOpacity.value = 0.02 + 0.12 * b;
    });
  });

  // --- Pared de la entrada, con la puerta por la que se entró ------------------------------
  // Todo en planos que miran para adentro: desde la vereda no se ven (ahí está la fachada de
  // afuera.ts, en el mismo lugar), y tampoco tapan cuando la cámara queda del otro lado.
  // La puerta mide lo mismo que la de afuera (PUERTA).
  const doorW = 1.15, doorH = 2.7;
  const inward = (mesh: THREE.Mesh, x: number, y: number, off = 0) => {
    mesh.rotation.y = Math.PI;
    mesh.position.set(x, y, frontZ - off);
    group.add(mesh);
    return mesh;
  };
  const flat = (w: number, h: number, mat: THREE.Material, x: number, y: number, off: number) => inward(new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat), x, y, off);
  const sideW = halfW - doorW;
  for (const s of [-1, 1]) inward(wall(sideW, ceilY, perW * sideW, 4), s * (doorW + sideW / 2), ceilY / 2);
  inward(wall(doorW * 2, ceilY - doorH, perW * doorW * 2, (4 * (ceilY - doorH)) / ceilY), 0, doorH + (ceilY - doorH) / 2);
  const doorFrame = makePSXMaterial({ color: '#0a0a0e' });
  const doorMat = makePSXMaterial({ color: DR.rojoOscuro });
  const doorTrim = makePSXMaterial({ color: DR.amarillo });
  flat(doorW * 2 + 0.32, doorH + 0.16, doorFrame, 0, (doorH + 0.16) / 2, 0.02);
  for (const s of [-1, 1]) {
    const cx = s * (doorW / 2);
    flat(doorW - 0.03, doorH, doorMat, cx, doorH / 2, 0.04);
    flat(doorW - 0.2, 0.08, doorTrim, cx, 0.34, 0.06);
    flat(doorW - 0.2, 0.08, doorTrim, cx, doorH - 0.34, 0.06);
    // Ojo de buey: del otro lado es de noche.
    flat(0.46, 0.46, doorFrame, cx, 1.75, 0.06);
    flat(0.34, 0.34, makePSXMaterial({ color: '#1a2140', lit: false }), cx, 1.75, 0.08);
    flat(0.07, 0.42, doorTrim, s * 0.16, 1.2, 0.06);
  }
  // Cartel de salida, prendido.
  const exitCv = makeCanvas(48, 16);
  const exitTex = toPSXTexture(exitCv.canvas);
  const drawExit = () => {
    const { ctx } = exitCv;
    ctx.fillStyle = DR.verdeClaro;
    ctx.fillRect(0, 0, 48, 16);
    ctx.fillStyle = DR.crema;
    ctx.font = `8px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SALIDA', 24, 9);
    exitTex.needsUpdate = true;
  };
  drawExit();
  void fontsReady().then(drawExit);
  flat(1.3, 0.5, doorFrame, 0, doorH + 0.55, 0.04);
  flat(1.2, 0.4, makePSXMaterial({ map: exitTex, lit: false }), 0, doorH + 0.55, 0.06);

  // Tapas de discos colgadas en las paredes de los costados.
  const covers: [string, string][] = [[DR.crema, DR.rojo], [DR.amarillo, DR.verde], [DR.rosa, DR.rojo], [DR.verdeClaro, DR.amarillo], [DR.rojo, DR.crema]];
  covers.forEach(([bg, label], i) => {
    const mat = makePSXMaterial({ map: makeRecordTexture(bg, label), lit: false });
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), mat);
      p.position.set(side * (halfW - 0.02), 4.4 + ((i + (side > 0 ? 1 : 0)) % 2) * 1.15, backZ + 1 + i * 1.6);
      p.rotation.y = -side * (Math.PI / 2);
      group.add(p);
    }
  });

  // --- Palcos: en U, con sus escaleras y barandas ---------------------------------------
  /** Lo que no se mueve de acá para abajo (barra, sillones, baño, leds): al final se junta por material. */
  const deco = new THREE.Group();
  const sideX = halfW - ARM, rearZ = backZ + PALCO.deep, armLen = PALCO.frontZ - rearZ;
  const palcoTop = makePSXMaterial({ color: '#2a2038' });
  const palcoFront = makePSXMaterial({ map: wallTex, color: '#c9bfe0' });
  const palcoMat = [palcoFront, palcoFront, palcoTop, palcoFront, palcoFront, palcoFront];
  group.add(box(halfW * 2, PALCO.h, PALCO.deep, palcoMat, 0, PALCO.h / 2, backZ + PALCO.deep / 2));
  const rail = makePSXMaterial({ color: DR.amarillo });
  const post = makePSXMaterial({ color: '#0a0a0e' });
  const edge = makeCanvas(32, 2);
  for (let i = 0; i < 32; i++) {
    edge.ctx.fillStyle = Math.floor(i / 2) % 2 ? DR.rojo : DR.amarillo;
    edge.ctx.fillRect(i, 0, 1, 2);
  }
  const edgeTex = toPSXTexture(edge.canvas);
  edgeTex.wrapS = THREE.RepeatWrapping;
  const edgeMat = makePSXMaterial({ map: edgeTex, lit: false });
  // Escalones: oscuros, con el filo apenas marcado (la luz la ponen los leds).
  const step = makeCanvas(8, 1);
  step.ctx.fillStyle = '#2a2038';
  step.ctx.fillRect(0, 0, 8, 1);
  step.ctx.fillStyle = '#3d3050';
  step.ctx.fillRect(0, 0, 1, 1);
  const stepTex = toPSXTexture(step.canvas);
  stepTex.wrapS = THREE.RepeatWrapping;
  const stepMat = makePSXMaterial({ map: stepTex });
  /** Franja de la marca en el canto de arriba (como la de la cabina) y baranda con postes, a la altura `h`. */
  const trim = (len: number, x: number, z: number, turned: boolean, h = PALCO.h) => {
    const geo = new THREE.PlaneGeometry(len, 0.09, Math.ceil(len / 2), 1);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len * 0.9);
    const s = new THREE.Mesh(geo, edgeMat);
    s.position.set(x, h - 0.06, z);
    if (turned) s.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(s);
    const bar = turned ? box(0.06, 0.06, len, rail, x, h + 0.95, z) : box(len, 0.06, 0.06, rail, x, h + 0.95, z);
    group.add(bar);
    for (let k = 0; k <= Math.round(len / 2.2); k++) {
      const at = -len / 2 + (k * len) / Math.round(len / 2.2);
      group.add(box(0.07, 0.95, 0.07, post, turned ? x : x + at, h + 0.475, turned ? z + at : z));
    }
  };
  /** Escalera: una cuña de `w` de ancho que baja `rise` hacia la entrada desde `z0`, apoyada a la altura `base`, con los escalones pintados. */
  const stairs = (w: number, rise: number, run: number, x: number, base: number, z0: number) => {
    const wedge = new THREE.BoxGeometry(w, rise, run);
    const pos = wedge.attributes.position;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0 && pos.getZ(i) > 0) pos.setY(i, -rise / 2 + 0.02);
    const suv = wedge.attributes.uv;
    // La cara de arriba (la rampa) lleva una raya por escalón.
    for (let i = 8; i < 12; i++) suv.setXY(i, suv.getY(i) * 9, 0.5);
    const m = new THREE.Mesh(wedge, [palcoFront, palcoFront, stepMat, palcoFront, palcoFront, palcoFront]);
    m.position.set(x, base + rise / 2, z0 + run / 2);
    group.add(m);
    // Una tira de led en el filo de cada escalón (arriba de la raya pintada).
    for (let k = 1; k < STEPS; k++) {
      const t = k / STEPS - 1 / 144;
      deco.add(box(w - 0.1, 0.03, run / 36, stepLeds[k], x, base + rise * (1 - t) + 0.012, z0 + run * t));
    }
  };
  /** Los leds de los escalones: uno por escalón, compartido por todas las escaleras (el 1 es el de más arriba). */
  const STEPS = 9;
  const stepLeds = Array.from({ length: STEPS }, () => makePSXMaterial({ color: DR.amarillo, lit: false }));
  updaters.push((beats, energy) => {
    // Con cada bombo una ola de luz sube la escalera, del primer escalón al último.
    const color = DR_CYCLE[Math.floor(beats / 8) % DR_CYCLE.length];
    stepLeds.forEach((m, k) => {
      const ph = beats - (STEPS - k) / 18;
      const b = 0.22 + 0.78 * Math.pow(1 - (ph - Math.floor(ph)), 3) * Math.min(1, energy + 0.2);
      m.uniforms.uColor.value.set(color).multiplyScalar(b);
    });
  });
  /**
   * Pasamanos del costado abierto de una escalera: baja con los escalones, de `top` a `bottom`,
   * y llega hasta `upTo` (0 a 1) del largo, que es donde el escalón de costado se puede bajar.
   */
  const handrail = (x: number, z0: number, run: number, top: number, bottom: number, upTo: number) => {
    const len = run * upTo, drop = (top - bottom) * upTo;
    const bar = box(0.06, 0.06, Math.hypot(len, drop), rail, x, (top + top - drop) / 2 + 0.95, z0 + len / 2);
    bar.rotation.x = Math.atan2(drop, len);
    group.add(bar);
    for (const t of [0.5, 1]) {
      const y = top - drop * t;
      group.add(box(0.07, 0.95, 0.07, post, x, y + 0.475, z0 + len * t));
    }
  };
  /** Hasta dónde va el pasamanos: mientras el costado de la escalera sea más alto que un escalón. */
  const railTo = (rise: number) => 1 - 0.3 / rise;
  trim(sideX * 2, 0, rearZ + 0.012, false);
  for (const s of [-1, 1]) {
    // El palco de ese lado y su escalera a la pista, que ocupa todo el ancho del brazo.
    group.add(box(PALCO.deep, PALCO.h, armLen, palcoMat, s * (sideX + PALCO.deep / 2), PALCO.h / 2, rearZ + armLen / 2));
    trim(armLen, s * (sideX - 0.012), rearZ + armLen / 2, true);
    stairs(ARM, PALCO.h, PALCO.stairs, s * (halfW - ARM / 2), 0, PALCO.frontZ);
    handrail(s * (sideX - 0.012), PALCO.frontZ, PALCO.stairs, PALCO.h, 0, railTo(PALCO.h));
  }

  /** Cartel de neón con un texto: se dibuja en un canvas chiquito (y otra vez cuando carga la fuente). */
  const neonSign = (text: string, color: string, w: number, h: number) => {
    const cv = makeCanvas(text.length * 9 + 8, 16);
    const tex = toPSXTexture(cv.canvas);
    const draw = () => {
      const { ctx, canvas } = cv;
      ctx.fillStyle = '#0a0a0e';
      ctx.fillRect(0, 0, canvas.width, 16);
      ctx.strokeStyle = color;
      ctx.strokeRect(0.5, 0.5, canvas.width - 1, 15);
      ctx.fillStyle = color;
      ctx.font = `8px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, canvas.width / 2, 9);
      tex.needsUpdate = true;
    };
    draw();
    void fontsReady().then(draw);
    const mat = makePSXMaterial({ map: tex, lit: false });
    const halo = glow(color, 0.08);
    const sign = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    const glowPlane = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.5, h * 2.2), halo);
    glowPlane.position.z = 0.02;
    glowPlane.renderOrder = 1;
    sign.add(face, glowPlane);
    return { sign, mat, halo };
  };
  /** Un neón que titila a veces (como los de verdad) y late un poco con el bombo. */
  const flicker = (mat: PSXMaterial, halo: PSXMaterial, seed: number) =>
    updaters.push((_b, _e, t) => {
      const off = Math.sin(t * 13.7 + seed) > 0.985 || (Math.sin(t * 0.37 + seed) > 0.96 && Math.sin(t * 31 + seed) > 0);
      const b = off ? 0.25 : 0.85 + 0.15 * kick;
      mat.uniforms.uColor.value.setScalar(b);
      halo.uniforms.uOpacity.value = off ? 0.01 : 0.05 + 0.07 * kick;
    });

  // --- La barra: en el palco del fondo, de frente a la pista --------------------------------
  {
    const { x0, x1, front, h } = BARRA;
    const cx = (x0 + x1) / 2, len = x1 - x0, top = PALCO.h + h, deep = 0.55, cz = front - deep / 2;
    const counter = makePSXMaterial({ color: '#1d1626' });
    const wood = makePSXMaterial({ color: '#5a3320' });
    deco.add(box(len, h, deep, counter, cx, PALCO.h + h / 2, cz));
    deco.add(box(len + 0.2, 0.07, deep + 0.18, wood, cx, top + 0.035, cz + 0.04));
    // La franja de la marca arriba del frente y una tira de led abajo, que late con el bombo.
    const stripeGeo = new THREE.PlaneGeometry(len, 0.09, Math.ceil(len / 2), 1);
    const suv = stripeGeo.attributes.uv;
    for (let i = 0; i < suv.count; i++) suv.setX(i, suv.getX(i) * len * 0.9);
    const stripeMesh = new THREE.Mesh(stripeGeo, edgeMat);
    stripeMesh.position.set(cx, top - 0.1, front + 0.005);
    deco.add(stripeMesh);
    const barLed = makePSXMaterial({ color: DR.rojo, lit: false });
    deco.add(box(len - 0.1, 0.04, 0.02, barLed, cx, PALCO.h + 0.12, front + 0.01));
    const barGlow = glow(DR.rojo, 0.1);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.8), barGlow);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(cx, PALCO.h + 0.02, front + 0.4);
    pool.renderOrder = 1;
    fx.add(pool);
    const ledColor = new THREE.Color(DR.rojo);
    updaters.push(() => {
      barLed.uniforms.uColor.value.copy(ledColor).multiplyScalar(0.45 + 0.55 * kick);
      barGlow.uniforms.uOpacity.value = 0.04 + 0.1 * kick;
    });
    // Sobre la barra: vasos, una coctelera y las canillas de la birra.
    const glass = makePSXMaterial({ color: '#a8d8e8', lit: false });
    const metalBar = makePSXMaterial({ color: '#9a9aa8' });
    for (const gx of [0.4, 1.3, 1.45, 2.9, 4.6, 4.75, 6.2]) deco.add(box(0.07, 0.12, 0.07, glass, x0 + gx, top + 0.13, cz + 0.08 - (gx % 0.3) * 0.3));
    deco.add(box(0.1, 0.24, 0.1, metalBar, x0 + 3.6, top + 0.19, cz - 0.05));
    for (const k of [0, 1, 2]) {
      deco.add(box(0.05, 0.3, 0.05, metalBar, x0 + 5.2 + k * 0.22, top + 0.22, cz - 0.15));
      deco.add(box(0.04, 0.12, 0.08, makePSXMaterial({ color: [DR.amarillo, DR.rojo, DR.verdeClaro][k] }), x0 + 5.2 + k * 0.22, top + 0.42, cz - 0.15));
    }
    // Atrás, contra la pared: un espejo oscuro con dos estantes llenos de botellas de colores.
    const backY = PALCO.h + 1.35;
    deco.add(box(len - 0.4, 1.5, 0.04, makePSXMaterial({ color: '#232838', lit: false }), cx, backY + 0.65, backZ + 0.03));
    const shelf = makePSXMaterial({ color: '#3a2418' });
    const bottleColors = [DR.verdeClaro, DR.amarillo, '#c25a1a', DR.rosa, '#3a8fd0', DR.crema];
    const byColor = bottleColors.map(() => [] as THREE.BufferGeometry[]);
    let bseed = 5;
    const br = () => ((bseed = (bseed * 16807) % 2147483647) - 1) / 2147483646;
    for (const sy of [backY, backY + 0.62]) {
      deco.add(box(len - 0.3, 0.04, 0.26, shelf, cx, sy, backZ + 0.15));
      for (let bx = x0 + 0.35; bx < x1 - 0.3; bx += 0.17 + br() * 0.08) {
        const bh = 0.22 + br() * 0.14;
        byColor[Math.floor(br() * bottleColors.length)].push(new THREE.BoxGeometry(0.08, bh, 0.08).translate(bx, sy + 0.02 + bh / 2, backZ + 0.15), new THREE.BoxGeometry(0.03, 0.07, 0.03).translate(bx, sy + 0.02 + bh + 0.035, backZ + 0.15));
      }
    }
    byColor.forEach((geos, i) => geos.length && deco.add(new THREE.Mesh(mergeGeometries(geos)!, makePSXMaterial({ color: bottleColors[i], lit: false }))));
    // El cartel, y lámparas colgando del techo sobre la barra.
    const { sign, mat, halo } = neonSign('BARRA', DR.rosa, 2.4, 0.6);
    sign.position.set(cx, PALCO.h + 3.15, backZ + 0.05);
    deco.add(sign);
    flicker(mat, halo, 1.3);
    const lamp = makePSXMaterial({ color: DR.amarillo, lit: false });
    const shade = makePSXMaterial({ color: '#15101c' });
    for (const lx of [cx - 2.4, cx, cx + 2.4]) {
      const ly = top + 1.55;
      deco.add(box(0.02, ceilY - ly, 0.02, metalBar, lx, (ceilY + ly) / 2, cz));
      deco.add(box(0.36, 0.16, 0.36, shade, lx, ly, cz), box(0.24, 0.04, 0.24, lamp, lx, ly - 0.09, cz));
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.6, 1.4, 6, 1, true).translate(0, -0.7, 0), glow(DR.amarillo, 0.06));
      cone.position.set(lx, ly - 0.1, cz);
      cone.renderOrder = 2;
      fx.add(cone);
    }
  }

  // --- Brazos del palco: sillones entre las pilastras y mesas altas -------------------------
  {
    const { sofas, sofaLen, tables, tableX, tableR } = LOUNGE;
    const fabrics = [makePSXMaterial({ color: '#4a2a6a' }), makePSXMaterial({ color: DR.rojoOscuro })];
    const dark2 = makePSXMaterial({ color: '#15101c' });
    const lampOn = makePSXMaterial({ color: DR.amarillo, lit: false });
    const floorY = PALCO.h;
    for (const s of [-1, 1]) {
      sofas.forEach((z, i) => {
        const fab = fabrics[(i + (s > 0 ? 1 : 0)) % 2];
        // Asiento, respaldo contra la pared y los dos apoyabrazos. La gente se sienta en `seatX`.
        deco.add(box(0.75, 0.42, sofaLen, fab, s * (halfW - 0.35 - 0.75 / 2), floorY + 0.21, z));
        deco.add(box(0.3, 0.95, sofaLen, fab, s * (halfW - 0.2), floorY + 0.475, z));
        for (const e of [-1, 1]) deco.add(box(0.95, 0.62, 0.18, fab, s * (halfW - 0.5), floorY + 0.31, z + e * (sofaLen / 2 - 0.09)));
        // Almohadones de colores.
        deco.add(box(0.12, 0.3, 0.32, makePSXMaterial({ color: [DR.amarillo, DR.verdeClaro, DR.rosa][(i * 2 + (s > 0 ? 1 : 0)) % 3] }), s * (halfW - 0.42), floorY + 0.6, z - sofaLen / 2 + 0.45));
      });
      for (const z of tables) {
        // Mesa alta redonda con una velita.
        deco.add(box(0.07, 1.05, 0.07, dark2, s * tableX, floorY + 0.525, z));
        deco.add(box(0.4, 0.04, 0.4, dark2, s * tableX, floorY + 0.02, z));
        const topMesh = new THREE.Mesh(new THREE.CylinderGeometry(tableR, tableR, 0.05, 8), makePSXMaterial({ color: '#2e2438' }));
        topMesh.position.set(s * tableX, floorY + 1.07, z);
        deco.add(topMesh, box(0.06, 0.09, 0.06, lampOn, s * tableX, floorY + 1.14, z));
        const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), glow(DR.amarillo, 0.12));
        halo.position.set(s * tableX, floorY + 1.16, z);
        halo.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
        halo.renderOrder = 1;
        fx.add(halo);
      }
    }
  }

  // --- El pasillo del fondo y el baño --------------------------------------------------------
  {
    const { x: px, halfW: hw, end, ceil } = PASILLO;
    const floorY = PALCO.h, tall = ceil - floorY;
    const len = backZ - end;
    /** Una pared que mira hacia adentro, con la textura repetida cada `tile` metros. */
    const side = (w: number, mat: PSXMaterial, x: number, z: number, rotY: number, h = tall, y = floorY + h / 2) => {
      // (En pedazos de un metro: entero, la textura se tuerce con el bamboleo de la Play.)
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, Math.ceil(w), Math.ceil(h)), mat);
      const uv = m.geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * 0.5, uv.getY(i) * h * 0.5);
      m.position.set(x, y, z);
      m.rotation.y = rotY;
      deco.add(m);
      return m;
    };
    // Paredes del pasillo: pintadas con aerosol.
    const tag = makeCanvas(64, 64);
    const tagTex = toPSXTexture(tag.canvas);
    tagTex.wrapS = tagTex.wrapT = THREE.RepeatWrapping;
    const drawTags = () => {
      const { ctx } = tag;
      ctx.fillStyle = '#2b2236';
      ctx.fillRect(0, 0, 64, 64);
      let seed = 19;
      const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      // Chorreaduras y garabatos.
      for (let i = 0; i < 28; i++) {
        ctx.fillStyle = [DR.rosa, DR.amarillo, DR.verdeClaro, DR.rojo, '#5a4a70'][i % 5];
        const x = Math.floor(r() * 64), y = Math.floor(r() * 64);
        ctx.fillRect(x, y, 1 + Math.floor(r() * 5), 1);
        if (r() > 0.6) ctx.fillRect(x, y, 1, 2 + Math.floor(r() * 6));
      }
      ctx.font = `8px ${FONT}`;
      ctx.textBaseline = 'top';
      const words: [string, string][] = [['DR', DR.rojo], ['RAROS', DR.amarillo], ['<3', DR.rosa], ['DnB', DR.verdeClaro], ['PUM PUM', DR.crema]];
      words.forEach(([w, c], i) => {
        ctx.fillStyle = c;
        ctx.fillText(w, 2 + Math.floor(r() * 30), 4 + i * 12);
      });
      tagTex.needsUpdate = true;
    };
    drawTags();
    void fontsReady().then(drawTags);
    const tagMat = makePSXMaterial({ map: tagTex });
    side(len, tagMat, px - hw, backZ - len / 2, Math.PI / 2);
    // (La de la derecha tiene la puerta de la escalera del sótano.)
    side(backZ - ESCALERA.z1, tagMat, px + hw, (backZ + ESCALERA.z1) / 2, -Math.PI / 2);
    side(ESCALERA.z0 - end, tagMat, px + hw, (ESCALERA.z0 + end) / 2, -Math.PI / 2);
    // Piso de baldosas gastadas y techo bajo.
    const floorTile = makeCheckerTexture('#3a3046', '#1c1624', 2, 8);
    floorTile.wrapS = floorTile.wrapT = THREE.RepeatWrapping;
    const floorMat = makePSXMaterial({ map: floorTile });
    const plane = (w: number, d: number, mat: PSXMaterial, x: number, y: number, z: number, up: boolean, rep = 1) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d, Math.ceil(w), Math.ceil(d)), mat);
      const uv = m.geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * rep, uv.getY(i) * d * rep);
      m.rotation.x = up ? -Math.PI / 2 : Math.PI / 2;
      m.position.set(x, y, z);
      deco.add(m);
    };
    plane(hw * 2, len, floorMat, px, floorY + 0.005, backZ - len / 2, true);
    const ceilMat = makePSXMaterial({ map: wallTex, color: '#6a6080' });
    plane(hw * 2, len, ceilMat, px, ceil, backZ - len / 2, false, 0.4);
    // El marco de la puerta, visto desde la pista, y el cartel de BAÑOS arriba.
    const frame = makePSXMaterial({ color: '#0a0a0e' });
    for (const e of [-1, 1]) deco.add(box(0.18, tall, 0.2, frame, px + e * (hw + 0.09), floorY + tall / 2, backZ + 0.08));
    deco.add(box(hw * 2 + 0.36, 0.18, 0.2, frame, px, ceil + 0.09, backZ + 0.08));
    const { sign, mat, halo } = neonSign('BAÑOS', DR.verdeClaro, 1.9, 0.5);
    sign.position.set(px, ceil + 0.6, backZ + 0.05);
    deco.add(sign);
    flicker(mat, halo, 4.1);
    // Un tubo en el techo del pasillo que anda mal: titila todo el tiempo.
    const tube = makePSXMaterial({ color: DR.crema, lit: false });
    const tubeGlow = glow('#cfe8ff', 0.1);
    deco.add(box(0.08, 0.06, 1.4, tube, px, ceil - 0.05, backZ - len * 0.55));
    const tubePool = new THREE.Mesh(new THREE.PlaneGeometry(hw * 1.6, 2.4), tubeGlow);
    tubePool.rotation.x = -Math.PI / 2;
    tubePool.position.set(px, floorY + 0.02, backZ - len * 0.55);
    tubePool.renderOrder = 1;
    fx.add(tubePool);
    updaters.push((_b, _e, t) => {
      const on = Math.sin(t * 23) > -0.6 || Math.sin(t * 2.1) > 0.3 ? 1 : 0.15;
      tube.uniforms.uColor.value.set(DR.crema).multiplyScalar(on);
      tubeGlow.uniforms.uOpacity.value = 0.09 * on;
    });
    // Tapas de discos pegadas en el pasillo, torcidas.
    covers.slice(0, 3).forEach(([bg, label], i) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), makePSXMaterial({ map: makeRecordTexture(bg, label), lit: false }));
      // (Todas del lado izquierdo: en el derecho está la puerta del sótano.)
      const e = -1;
      p.position.set(px + e * (hw - 0.02), floorY + 1.7 + (i % 2) * 0.3, backZ - 1.2 - i * 1.5);
      p.rotation.set(0, -e * (Math.PI / 2), 0.15 * e);
      deco.add(p);
    });

    // El baño: azulejos, piletas con espejo y cubículos (uno ocupado: se le ven los pies).
    const { x0, x1, back: bz, stalls, sinks } = BANO;
    const tile = makeCanvas(16, 16);
    tile.ctx.fillStyle = '#56625f';
    tile.ctx.fillRect(0, 0, 16, 16);
    tile.ctx.fillStyle = '#b8c6c0';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) tile.ctx.fillRect(x * 4, y * 4, 3, 3);
    tile.ctx.fillStyle = '#7d8a6a';
    for (const [x, y] of [[2, 5], [9, 1], [13, 10], [5, 13]]) tile.ctx.fillRect(x, y, 1, 1);
    const tileTex = toPSXTexture(tile.canvas);
    tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
    const tileMat = makePSXMaterial({ map: tileTex });
    const bw = x1 - x0, bd = end - bz, bcx = (x0 + x1) / 2, bcz = (end + bz) / 2;
    side(bw, tileMat, bcx, bz, 0);
    side(bd, tileMat, x0, bcz, Math.PI / 2);
    side(bd, tileMat, x1, bcz, -Math.PI / 2);
    side(px - hw - x0, tileMat, (x0 + px - hw) / 2, end, Math.PI);
    side(x1 - px - hw, tileMat, (x1 + px + hw) / 2, end, Math.PI);
    const bathTile = makeCheckerTexture('#d8d2c4', '#2a2a30', 2, 8);
    bathTile.wrapS = bathTile.wrapT = THREE.RepeatWrapping;
    plane(bw, bd, makePSXMaterial({ map: bathTile }), bcx, floorY + 0.005, bcz, true, 1.2);
    plane(bw, bd, ceilMat, bcx, ceil, bcz, false, 0.4);
    // Piletas y espejo.
    const porcelain = makePSXMaterial({ color: '#e8e4dc' });
    const chrome = makePSXMaterial({ color: '#9a9aa8' });
    const scx = (sinks.x0 + sinks.x1) / 2, slen = sinks.x1 - sinks.x0;
    deco.add(box(slen, 0.85, sinks.deep, makePSXMaterial({ color: '#2a2430' }), scx, floorY + 0.425, bz + sinks.deep / 2));
    for (let k = 0; k < 3; k++) {
      const sx = sinks.x0 + (slen / 3) * (k + 0.5);
      deco.add(box(0.5, 0.06, 0.38, porcelain, sx, floorY + 0.88, bz + 0.3), box(0.04, 0.14, 0.04, chrome, sx, floorY + 0.98, bz + 0.1));
    }
    const mirror = makeCanvas(32, 16);
    mirror.ctx.fillStyle = '#5d7184';
    mirror.ctx.fillRect(0, 0, 32, 16);
    mirror.ctx.fillStyle = '#8fa4b6';
    for (let i = 0; i < 4; i++) mirror.ctx.fillRect(4 + i * 8, 2, 1, 12);
    mirror.ctx.fillStyle = DR.rojo;
    mirror.ctx.fillRect(20, 6, 6, 1);
    mirror.ctx.fillRect(20, 6, 1, 4);
    const mirrorMesh = new THREE.Mesh(new THREE.PlaneGeometry(slen - 0.3, 1.1), makePSXMaterial({ map: toPSXTexture(mirror.canvas), lit: false }));
    mirrorMesh.position.set(scx, floorY + 1.75, bz + 0.02);
    deco.add(mirrorMesh);
    // Cubículos: paneles entre uno y otro y las puertas al frente, que no llegan ni al piso ni al techo.
    const stallMat = makePSXMaterial({ color: '#2f5e52' });
    const sd = stalls - x0, n = 3, each = bd / n;
    for (let k = 0; k <= n; k++) deco.add(box(sd, 2.0, 0.05, stallMat, x0 + sd / 2, floorY + 1.2, bz + k * each));
    for (let k = 0; k < n; k++) {
      const z = bz + (k + 0.5) * each;
      deco.add(box(0.05, 1.75, each - 0.12, stallMat, stalls, floorY + 1.125, z));
      // Cartelito: libre o ocupado.
      const busy = k === 1;
      deco.add(box(0.02, 0.08, 0.16, makePSXMaterial({ color: busy ? DR.rojo : DR.verdeClaro, lit: false }), stalls + 0.03, floorY + 1.4, z - each / 2 + 0.25));
      if (busy) for (const e of [-1, 1]) deco.add(box(0.2, 0.08, 0.11, makePSXMaterial({ color: '#15101c' }), stalls - 0.25, floorY + 0.04, z + e * 0.1));
    }
    // Un secamanos y una luz pelada.
    deco.add(box(0.12, 0.35, 0.3, porcelain, x1 - 0.06, floorY + 1.35, bz + 1.6));
    const bulb = makePSXMaterial({ color: '#fff3c4', lit: false });
    deco.add(box(0.02, 0.4, 0.02, chrome, bcx, ceil - 0.2, bcz), box(0.1, 0.12, 0.1, bulb, bcx, ceil - 0.45, bcz));
  }

  group.add(bake(deco));

  // --- Tele del fondo: el marco y la pantalla "apagada" con el logo --------------------
  const { tele } = CLUB;
  const dark = makePSXMaterial({ color: '#0a0a0e' });
  group.add(box(tele.w + 0.4, tele.h + 0.4, 0.2, dark, tele.x, tele.y, tele.z - 0.08));
  group.add(box(0.3, ceilY - tele.y - tele.h / 2, 0.12, dark, tele.x, (ceilY + tele.y + tele.h / 2) / 2, tele.z - 0.08));
  const screenMat = makePSXMaterial({ color: '#141021', lit: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(tele.w, tele.h), screenMat);
  screen.position.set(tele.x, tele.y, tele.z + 0.03);
  group.add(screen);
  const teleLogo = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6 / LOGO_ASPECT), makePSXMaterial({ lit: false }));
  teleLogo.position.set(tele.x, tele.y, tele.z + 0.05);
  teleLogo.visible = false;
  group.add(teleLogo);

  // --- Luces: truss, haces que barren la pista y bola de espejos -----------------------
  const metal = makePSXMaterial({ color: '#3a3a44' });
  const TRUSS = [1.2, -2.2, -6.5];
  for (const z of TRUSS) group.add(box(halfW * 2, 0.12, 0.12, metal, 0, ceilY - 0.3, z));
  for (const x of [-4, 0, 4]) group.add(box(0.12, 0.12, 7.9, metal, x, ceilY - 0.3, -2.65));
  // Haces que barren la pista: llegan justo hasta el piso y dejan su charco de luz.
  const beams: { beam: THREE.Mesh; pool: THREE.Mesh; mat: PSXMaterial; poolMat: PSXMaterial }[] = [];
  const beamColors = [DR.rojo, DR.amarillo, DR.verdeClaro, DR.rosa, DR.amarillo, DR.rojo];
  for (let i = 0; i < 9; i++) {
    const color = beamColors[i % beamColors.length];
    const geo = new THREE.CylinderGeometry(0.03, 0.5, 1, 6, 1, true);
    geo.translate(0, -0.5, 0);
    const mat = glow(color, 0.1), poolMat = glow(color, 0.1);
    const beam = new THREE.Mesh(geo, mat);
    beam.position.set(-8 + i * 2, ceilY - 0.35, TRUSS[i % 3]);
    beam.renderOrder = 2;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(0.7, 8), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.renderOrder = 1;
    fx.add(beam, pool);
    group.add(box(0.3, 0.3, 0.3, metal, beam.position.x, ceilY - 0.45, beam.position.z));
    beams.push({ beam, pool, mat, poolMat });
  }
  updaters.push((beats, energy) => {
    const pulse = music ? music.kick : 1 - (beats - Math.floor(beats));
    const bar = Math.floor(beats / 4);
    beams.forEach(({ beam, pool, mat, poolMat }, i) => {
      const o = beam.position;
      // Cada cuatro beats los colores se corren un lugar.
      mat.uniforms.uColor.value.set(beamColors[(i + bar) % beamColors.length]);
      poolMat.uniforms.uColor.value.copy(mat.uniforms.uColor.value);
      const rz = -o.x * 0.05 + 0.62 * Math.sin(TAU * beats * 0.0625 + i * 1.7);
      const rx = (i % 2 ? 0.25 : 0) + 0.5 * Math.sin(TAU * beats * 0.03125 + i);
      beam.rotation.set(rx, 0, rz);
      // Para dónde apunta (el haz cuelga hacia -y) y a qué distancia toca el piso.
      const len = Math.min(11, o.y / (Math.cos(rz) * Math.cos(rx)));
      beam.scale.y = len;
      const px = o.x + Math.sin(rz) * len, pz = o.z - Math.cos(rz) * Math.sin(rx) * len;
      // Si cae en un palco, el charco queda arriba, no enterrado.
      pool.position.set(px, floorAt(px, pz) + 0.03, pz);
      const a = 0.03 + (0.07 + 0.2 * pulse) * energy;
      mat.uniforms.uOpacity.value = a;
      poolMat.uniforms.uOpacity.value = a * 1.6;
    });
  });

  // Cegadoras: una fila de focos en el truss de atrás, mirando a la pista. No encandilan la
  // pantalla entera: prenden ellas y su resplandor, y le suman un poco a la luz del salón.
  const lampMat = makePSXMaterial({ color: '#000', lit: false });
  const flare = glow(DR.crema, 0);
  for (const x of [-3, -1.8, 1.8, 3]) {
    group.add(box(0.5, 0.32, 0.2, metal, x, ceilY - 0.55, -2.2), box(0.4, 0.22, 0.04, lampMat, x, ceilY - 0.55, -2.08));
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), flare);
    f.position.set(x, ceilY - 0.55, -2.04);
    f.renderOrder = 2;
    fx.add(f);
  }
  const lampOn = new THREE.Color(DR.crema);
  updaters.push(() => {
    lampMat.uniforms.uColor.value.copy(lampOn).multiplyScalar(0.06 + 0.94 * blind);
    flare.uniforms.uOpacity.value = 0.3 * blind;
  });

  // Láseres: un abanico verde desde el truss de atrás, por arriba de las cabezas, cuando el tema está arriba.
  const laserMat = glow(DR.verdeClaro, 0);
  const lasers: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 1).translate(0, 0, 0.5), laserMat);
    l.position.set(0, ceilY - 0.75, -2.1);
    l.scale.z = 13;
    l.renderOrder = 2;
    fx.add(l);
    lasers.push(l);
  }
  let laserOn = 0;
  updaters.push((beats) => {
    const up = music ? Math.max(0, Math.min(1, (music.loud - 0.76) * 6)) : 0;
    laserOn += (up - laserOn) * 0.08;
    laserMat.uniforms.uOpacity.value = laserOn * (0.2 + 0.3 * kick);
    // El abanico se abre y se cierra cada ocho beats, y sube y baja más despacio.
    const spread = 0.13 + 0.09 * Math.sin(TAU * beats * 0.125), tilt = 0.3 + 0.16 * Math.sin(TAU * beats * 0.0625);
    lasers.forEach((l, i) => l.rotation.set(tilt, (i - 3) * spread, 0));
  });

  // Chorros de humo a los costados de la cabina: salen para arriba cuando cae el drop.
  const jetMat = glow(DR.crema, 0);
  const jets = [-2.5, 2.5].map((x) => {
    const j = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.07, 1, 6, 1, true).translate(0, 0.5, 0), jetMat);
    j.position.set(x, 0.05, CLUB.boothZ + 0.2);
    j.renderOrder = 2;
    j.visible = false;
    fx.add(j);
    return j;
  });
  let jetAt = -9, wasDrop = 0;
  updaters.push((_b, _e, t) => {
    const drop = music ? music.drop : 0;
    if (drop > 0.6 && wasDrop <= 0.6 && t - jetAt > 8) jetAt = t;
    wasDrop = drop;
    const u = (t - jetAt) / 1.8;
    for (const j of jets) {
      j.visible = u < 1;
      j.scale.set(0.6 + 1.1 * u, 4.6 * (1 - Math.pow(1 - Math.min(1, u * 2.2), 3)), 0.6 + 1.1 * u);
    }
    jetMat.uniforms.uOpacity.value = u < 1 ? 0.5 * (1 - u) * (1 - u) : 0;
  });

  // Barras de led en el techo: una ola de colores que viene del fondo hacia la cabina en cada beat.
  const bars: PSXMaterial[] = [];
  for (let i = 0; i < 9; i++) {
    const m = makePSXMaterial({ color: '#000', lit: false });
    bars.push(m);
    group.add(box(halfW * 1.3, 0.06, 0.08, m, 0, ceilY - 0.62, backZ + 0.4 + i * 1.3));
  }
  updaters.push((beats, energy) => {
    const beat = Math.floor(beats);
    bars.forEach((m, i) => {
      const ph = beats - i / bars.length;
      const b = 0.08 + 0.92 * Math.pow(1 - (ph - Math.floor(ph)), 4) * energy;
      m.uniforms.uColor.value.set(DR_CYCLE[(beat + i) % 4]).multiplyScalar(b);
    });
  });

  // Bola de espejos, ahora con sus brillitos dando vueltas por las paredes, el piso y el techo.
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), makePSXMaterial({ color: '#d8dce8' }));
  ball.position.set(0, ceilY - 0.95, 0.4);
  group.add(ball, box(0.03, 0.6, 0.03, metal, 0, ceilY - 0.35, 0.4));
  const sparkMat = glow(DR.crema, 0.4);
  const sparks: { mesh: THREE.Mesh; a: number; e: number }[] = [];
  for (let i = 0; i < 22; i++) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), sparkMat);
    mesh.renderOrder = 1;
    fx.add(mesh);
    // Repartidos en anillos: unos tiran para arriba, la mayoría para abajo y los costados.
    sparks.push({ mesh, a: (i * TAU * 0.618) % TAU, e: -1.1 + (i % 6) * 0.3 });
  }
  updaters.push((_b, energy, t) => {
    ball.rotation.y = t * 0.6;
    sparkMat.uniforms.uOpacity.value = music ? 0.15 + 0.25 * energy + 0.45 * music.high : 0.15 + 0.5 * energy;
    const o = ball.position;
    for (const { mesh, a, e } of sparks) {
      const dx = Math.cos(a + t * 0.6) * Math.cos(e), dy = Math.sin(e), dz = Math.sin(a + t * 0.6) * Math.cos(e);
      // Hasta dónde llega el rayo antes de chocar con una pared, el piso o el techo.
      const kx = dx > 0 ? (halfW - o.x) / dx : dx < 0 ? (-halfW - o.x) / dx : Infinity;
      const ky = dy > 0 ? (ceilY - o.y) / dy : dy < 0 ? -o.y / dy : Infinity;
      const kz = dz > 0 ? (frontZ - o.z) / dz : dz < 0 ? (backZ - o.z) / dz : Infinity;
      const hit = Math.min(kx, ky, kz), k = hit - 0.04;
      mesh.position.set(o.x + dx * k, o.y + dy * k, o.z + dz * k);
      mesh.rotation.set(hit === ky ? Math.PI / 2 : 0, hit === kx ? Math.PI / 2 : 0, 0);
    }
  });

  // --- Cabina -------------------------------------------------------------------------
  const { boothZ, boothH } = CLUB;
  const boothDark = makePSXMaterial({ color: '#15101c' });
  booth.add(box(3.6, boothH, 0.9, boothDark, 0, boothH / 2, boothZ));
  // Franjas rojas y amarillas arriba y abajo del frente, como en los reels.
  const stripe = makeCanvas(32, 2);
  for (let i = 0; i < 32; i++) {
    stripe.ctx.fillStyle = Math.floor(i / 2) % 2 ? DR.rojo : DR.amarillo;
    stripe.ctx.fillRect(i, 0, 1, 2);
  }
  const stripeMat = makePSXMaterial({ map: toPSXTexture(stripe.canvas), lit: false });
  for (const y of [0.07, boothH - 0.07]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.07), stripeMat);
    s.position.set(0, y, boothZ + 0.455);
    booth.add(s);
  }
  const boothLogo = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 1.32 / LOGO_ASPECT), makePSXMaterial({ lit: false }));
  boothLogo.position.set(0, boothH / 2, boothZ + 0.46);
  boothLogo.visible = false;
  booth.add(boothLogo);

  // Bandejas con discos girando, mixer con perillas y LEDs.
  const deck = makePSXMaterial({ color: '#2a2a32' });
  const vinyl = makePSXMaterial({ map: makeRecordTexture(DR.negro, DR.rojo) });
  const rim = makePSXMaterial({ color: DR.negro });
  const discs: THREE.Mesh[] = [];
  for (const x of [-1.1, 1.1]) {
    booth.add(box(0.78, 0.07, 0.7, deck, x, boothH + 0.035, boothZ - 0.06));
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 12), [rim, vinyl, rim]);
    disc.position.set(x, boothH + 0.085, boothZ - 0.06);
    booth.add(disc);
    discs.push(disc);
  }
  updaters.push((beats, energy) => discs.forEach((d, i) => (d.rotation.y = -beats * 1.1 * (i ? 1 : 0.97) * (0.2 + 0.8 * energy))));
  booth.add(box(0.62, 0.09, 0.66, deck, 0, boothH + 0.045, boothZ));
  const leds: PSXMaterial[] = [];
  for (let i = 0; i < 6; i++) {
    const m = makePSXMaterial({ color: '#202020', lit: false });
    leds.push(m);
    booth.add(box(0.05, 0.02, 0.05, m, -0.2 + (i % 2) * 0.4, boothH + 0.1, boothZ - 0.2 + Math.floor(i / 2) * 0.12));
  }
  for (const x of [-0.12, 0, 0.12]) booth.add(box(0.05, 0.05, 0.05, makePSXMaterial({ color: DR.crema }), x, boothH + 0.11, boothZ + 0.2));
  updaters.push((beats, energy) => {
    const level = music ? music.kick * 3.4 : (1 - (beats - Math.floor(beats))) * energy * 3.4;
    leds.forEach((m, i) => m.uniforms.uColor.value.set(Math.floor(i / 2) < level ? (i < 4 ? DR.verdeClaro : DR.rojo) : '#202020'));
  });

  // Parlantes a los costados: el de arriba late con el bombo.
  const speakerTex = makeSpeakerTexture();
  const cab = makePSXMaterial({ color: '#16161c' });
  const front = makePSXMaterial({ map: speakerTex });
  const pumping: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    for (const [y, pump] of [[0.65, false], [1.95, true]] as const) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.7), [cab, cab, cab, cab, front, cab]);
      s.position.set(side * 3.35, y, boothZ - 0.5);
      booth.add(s);
      if (pump) pumping.push(s);
    }
  }
  updaters.push(() => pumping.forEach((s) => s.scale.setScalar(1 + kick * 0.06)));
  // Y dos más colgados en las esquinas del fondo, apuntando a la pista.
  for (const s of [-1, 1]) {
    const hung = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.7), [cab, cab, cab, cab, front, cab]);
    hung.position.set(s * (halfW - 1.25), 6.3, backZ + 0.95);
    hung.rotation.set(0.22, -s * 0.5, 0);
    group.add(hung, box(0.04, ceilY - 6.9, 0.04, metal, s * (halfW - 1.25), (ceilY + 6.9) / 2, backZ + 0.85));
  }

  // El logo se carga aparte: cuando llega, se prende en la cabina y en la tele.
  void makeLogoCanvas(128).then((cv) => {
    const tex = toPSXTexture(cv);
    for (const m of [boothLogo, teleLogo]) {
      setPSXMap(m.material as PSXMaterial, tex);
      m.visible = true;
    }
  });

  // Todo lo quieto del salón y de la cabina, junto por material.
  bake(group, [floor, screen, teleLogo, ball]);
  bake(booth, [...discs, ...pumping, boothLogo]);

  return {
    group,
    booth,
    fx,
    light,
    update(beats, energy, t, m = null) {
      music = m;
      for (const u of updaters) u(beats, energy, t);
    },
  };
}
