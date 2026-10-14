import * as THREE from 'three';
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
  /** Cuánto se meten hacia adentro desde la pared. */
  deep: 2.8,
  /** Hasta dónde llegan los brazos (z); de ahí baja la escalera, hacia la entrada. */
  frontZ: 3.0,
  stairs: 2.8,
};

/**
 * El segundo piso: una franja más alta contra cada pared de costado, por afuera del palco, que
 * llega hasta el fondo. Se sube desde el palco, por una escalera que baja hacia la entrada y
 * termina en un descanso a la altura del palco. Al fondo no hay: ahí está la tele.
 */
export const PISO2 = {
  h: 3.0,
  deep: 2.6,
  /** Hasta dónde llega (z); de ahí baja la escalera al palco. */
  frontZ: -1.4,
  stairs: 2.8,
};

/** Ancho total de cada costado levantado: el palco más el segundo piso. */
export const ARM = PALCO.deep + PISO2.deep;

/** Altura del piso en un punto del boliche: 0 en la pista, `PALCO.h` o `PISO2.h` arriba, y lo que toque en las escaleras. */
export function floorAt(x: number, z: number) {
  if (Math.abs(x) >= CLUB.halfW - PISO2.deep && z < PISO2.frontZ + PISO2.stairs) {
    if (z <= PISO2.frontZ) return PISO2.h;
    return PALCO.h + (PISO2.h - PALCO.h) * (1 - (z - PISO2.frontZ) / PISO2.stairs);
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
function glow(color: THREE.ColorRepresentation, opacity: number) {
  const m = makePSXMaterial({ color, lit: false, opacity, side: THREE.DoubleSide });
  m.blending = THREE.AdditiveBlending;
  return m;
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
  const wall = (w: number, h: number, repeatX: number, repeatY: number) => {
    const geo = new THREE.PlaneGeometry(w, h, Math.ceil(w / 2), Math.ceil(h / 2));
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repeatX, uv.getY(i) * repeatY);
    return new THREE.Mesh(geo, makePSXMaterial({ map: wallTex }));
  };
  /** Cuántas veces se repite el ladrillo por metro de pared (a lo ancho y a lo largo). */
  const perW = 12 / 23, perD = 7 / 18;
  const back = wall(halfW * 2, ceilY, perW * halfW * 2, 4);
  back.position.set(0, ceilY / 2, backZ);
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
  // (Los tubos van altos: abajo, contra la pared, está el segundo piso.)
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

  // --- Palcos y segundo piso: en U, con sus escaleras y barandas -------------------------
  const sideX = halfW - ARM, rearZ = backZ + PALCO.deep, armLen = PALCO.frontZ - rearZ;
  /** Dónde arranca el segundo piso (x) y el centro de esa franja. */
  const upX = halfW - PISO2.deep, upMid = halfW - PISO2.deep / 2;
  const palcoTop = makePSXMaterial({ color: '#2a2038' });
  const palcoFront = makePSXMaterial({ map: wallTex, color: '#c9bfe0' });
  const palcoMat = [palcoFront, palcoFront, palcoTop, palcoFront, palcoFront, palcoFront];
  group.add(box(upX * 2, PALCO.h, PALCO.deep, palcoMat, 0, PALCO.h / 2, backZ + PALCO.deep / 2));
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
  // Escalones: oscuros, con el filo amarillo.
  const step = makeCanvas(8, 1);
  step.ctx.fillStyle = '#2a2038';
  step.ctx.fillRect(0, 0, 8, 1);
  step.ctx.fillStyle = DR.amarillo;
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
  };
  trim(sideX * 2, 0, rearZ + 0.012, false);
  const up2 = PISO2.frontZ - backZ, landing = PALCO.frontZ - PISO2.frontZ;
  for (const s of [-1, 1]) {
    // El palco de ese lado y su escalera a la pista, que ocupa todo el ancho del brazo.
    group.add(box(PALCO.deep, PALCO.h, armLen, palcoMat, s * (sideX + PALCO.deep / 2), PALCO.h / 2, rearZ + armLen / 2));
    trim(armLen, s * (sideX - 0.012), rearZ + armLen / 2, true);
    stairs(ARM, PALCO.h, PALCO.stairs, s * (halfW - ARM / 2), 0, PALCO.frontZ);
    // El segundo piso, contra la pared: llega hasta el fondo y baja al palco por su escalera.
    group.add(box(PISO2.deep, PISO2.h, up2, palcoMat, s * upMid, PISO2.h / 2, backZ + up2 / 2));
    trim(up2, s * (upX - 0.012), backZ + up2 / 2, true, PISO2.h);
    group.add(box(PISO2.deep, PALCO.h, landing, palcoMat, s * upMid, PALCO.h / 2, PISO2.frontZ + landing / 2));
    stairs(PISO2.deep, PISO2.h - PALCO.h, PISO2.stairs, s * upMid, PALCO.h, PISO2.frontZ);
    // Baranda del descanso, del lado de la entrada (ahí hay un escalón de un piso).
    group.add(box(PISO2.deep, 0.06, 0.06, rail, s * upMid, PISO2.h + 0.95, PISO2.frontZ - 0.02));
  }

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
      // Si cae en un palco o en el segundo piso, el charco queda arriba, no enterrado.
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
