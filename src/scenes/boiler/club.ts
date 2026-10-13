import * as THREE from 'three';
import {
  ANTRO,
  DR,
  FONT,
  LOGO_ASPECT,
  type PSXMaterial,
  box,
  fontsReady,
  makeCanvas,
  makeConcreteTexture,
  makeLogoCanvas,
  makePSXMaterial,
  makePosterTexture,
  makeRecordTexture,
  makeSpeakerTexture,
  setPSXMap,
  shade,
  toPSXTexture,
} from '../../style-kit';

/** Medidas del club (metros). La cámara mira hacia -z: cabina adelante, pista atrás, tele al fondo. */
export const CLUB = {
  halfW: 6.6,
  backZ: -5.3,
  frontZ: 9.6,
  ceilY: 5.6,
  boothZ: 2.5,
  boothH: 1.0,
  djZ: 1.86,
  tele: { x: 0, y: 4.15, z: -5.12, w: 4.8, h: 2.7 },
};

export interface Club {
  group: THREE.Group;
  /** Cabina y parlantes: se esconden mientras se crea un personaje, para verlo de cerca. */
  booth: THREE.Group;
  /** Haces, charcos de luz y láseres: se apagan en el creador, que si no tiñen al personaje y no se ven los colores. */
  fx: THREE.Group;
  /** La luz del momento (cambia con la escena de luces y late con el bombo): la aplica el boiler. */
  light: { ambient: THREE.Color; key: THREE.Color; fog: THREE.Color };
  /** @param beats tiempo de baile en beats · @param energy 0–1 · @param t segundos */
  update(beats: number, energy: number, t: number): void;
}

const TAU = Math.PI * 2;

/**
 * Escenas de luces: cambian cada 16 beats. Casi todo rojo, como corresponde; cada tanto todo
 * blanco frío, y una con los láseres verdes.
 */
const SCENES = [
  { wash: DR.rojo, beams: [DR.rojo, DR.rojo], laser: null },
  { wash: '#7f93c4', beams: [ANTRO.frio, DR.crema], laser: null },
  { wash: DR.rojo, beams: [DR.rojo, DR.crema], laser: DR.rojo },
  { wash: ANTRO.laser, beams: [ANTRO.laser, DR.amarillo], laser: ANTRO.laser },
].map((s) => ({ wash: new THREE.Color(s.wash), beams: s.beams.map((c) => new THREE.Color(c)), laser: s.laser ? new THREE.Color(s.laser) : null }));
const PHRASE = 16;

/** Material de luz: no pinta, suma (haces, charcos en el piso, resplandor de los tubos). */
function glow(color: THREE.ColorRepresentation, opacity: number) {
  const m = makePSXMaterial({ color, lit: false, opacity, side: THREE.DoubleSide });
  m.blending = THREE.AdditiveBlending;
  return m;
}

/** Repite la textura `rx`×`ry` veces a lo largo del plano, arrancando en (`u0`, `v0`). */
function tile(geo: THREE.BufferGeometry, rx: number, ry: number, u0 = 0, v0 = 0) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * rx, v0 + uv.getY(i) * ry);
  return geo;
}

export function buildClub(): Club {
  const group = new THREE.Group();
  const booth = new THREE.Group();
  const fx = new THREE.Group();
  group.add(booth, fx);
  const updaters: ((beats: number, energy: number, t: number) => void)[] = [];
  const { halfW, backZ, frontZ, ceilY } = CLUB;
  const depth = frontZ - backZ, midZ = (frontZ + backZ) / 2;

  // Lo que comparten todas las luces: la escena del momento y el golpe del bombo.
  let scene = SCENES[0];
  let kick = 0;
  const wash = new THREE.Color(DR.rojo);
  const light = { ambient: new THREE.Color(), key: new THREE.Color(), fog: new THREE.Color() };
  updaters.push((beats, energy) => {
    scene = SCENES[Math.floor(beats / PHRASE) % SCENES.length];
    kick = Math.max(0, 1 - (beats - Math.floor(beats)) * 2.5) * energy;
    wash.lerp(scene.wash, 0.06);
    // Con el set en pausa queda la luz de servicio: casi sin color.
    const w = 0.15 * (0.35 + 0.65 * energy), k = 0.44 + 0.2 * kick;
    light.ambient.setRGB(0.24 + wash.r * w, 0.24 + wash.g * w, 0.28 + wash.b * w);
    light.key.setRGB(k * (0.45 + 0.55 * wash.r), k * (0.45 + 0.55 * wash.g), k * (0.45 + 0.55 * wash.b));
    light.fog.setRGB(0.03 + wash.r * 0.05, 0.03 + wash.g * 0.05, 0.045 + wash.b * 0.05);
  });

  // --- Piso: losa de hormigón --------------------------------------------------------
  const floor = new THREE.Mesh(tile(new THREE.PlaneGeometry(halfW * 2, depth, 13, 15), 5, 6), makePSXMaterial({ map: makeConcreteTexture(ANTRO.piso, true) }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, midZ);
  group.add(floor);

  // --- Paredes y techo: hormigón a la vista -------------------------------------------
  const wallTex = makeConcreteTexture(ANTRO.hormigon);
  const wallMat = makePSXMaterial({ map: wallTex });
  const wall = (w: number, h: number, repeatX: number, repeatY: number, mat: THREE.Material = wallMat) =>
    new THREE.Mesh(tile(new THREE.PlaneGeometry(w, h, Math.ceil(w / 2), Math.ceil(h / 2)), repeatX, repeatY), mat);
  const back = wall(halfW * 2, ceilY, 4, 2);
  back.position.set(0, ceilY / 2, backZ);
  const left = wall(depth, ceilY, 5, 2);
  left.rotation.y = Math.PI / 2;
  left.position.set(-halfW, ceilY / 2, midZ);
  const right = wall(depth, ceilY, 5, 2);
  right.rotation.y = -Math.PI / 2;
  right.position.set(halfW, ceilY / 2, midZ);
  const ceiling = wall(halfW * 2, depth, 4, 5, makePSXMaterial({ map: wallTex, color: '#b9b9c4' }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, ceilY, midZ);
  group.add(back, left, right, ceiling);

  // Pilastras contra las paredes de los costados y, arriba de cada par, una viga de fierro.
  const pilar = makePSXMaterial({ color: shade(ANTRO.hormigon, 0.82) });
  const acero = makePSXMaterial({ color: ANTRO.acero });
  const fierro = makePSXMaterial({ color: ANTRO.fierro });
  const PILARES = [-4.0, -0.4, 3.2, 6.8];
  for (const z of PILARES) {
    for (const s of [-1, 1]) group.add(box(0.3, ceilY, 0.55, pilar, s * (halfW - 0.15), ceilY / 2, z));
    group.add(box(halfW * 2, 0.28, 0.22, fierro, 0, ceilY - 0.14, z));
  }

  // Tubos en las pilastras: respiran con el bombo, intercalados, y hay uno que anda mal.
  const tubes: { tube: PSXMaterial; halo: PSXMaterial }[] = [];
  PILARES.forEach((z) => {
    for (const s of [-1, 1]) {
      const tube = makePSXMaterial({ color: DR.rojo, lit: false });
      const halo = glow(DR.rojo, 0.2);
      group.add(box(0.06, 1.7, 0.06, tube, s * (halfW - 0.34), 2.75, z), box(0.1, 0.08, 0.1, fierro, s * (halfW - 0.34), 3.64, z), box(0.1, 0.08, 0.1, fierro, s * (halfW - 0.34), 1.86, z));
      const h = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.2), halo);
      h.rotation.y = -s * (Math.PI / 2);
      h.position.set(s * (halfW - 0.31), 2.75, z);
      h.renderOrder = 1;
      group.add(h);
      tubes.push({ tube, halo });
    }
  });
  const dim = new THREE.Color();
  updaters.push((beats, energy, t) => {
    const off = Math.max(0, 1 - (beats + 0.5 - Math.floor(beats + 0.5)) * 2.5) * energy;
    tubes.forEach(({ tube, halo }, i) => {
      let b = 0.3 + 0.7 * ((i >> 1) % 2 ? off : kick);
      if (i === 5 && Math.sin(t * 31) * Math.sin(t * 7.3) > 0.2) b *= 0.15;
      tube.uniforms.uColor.value.copy(dim.copy(wash).multiplyScalar(b).addScalar(b * 0.25));
      halo.uniforms.uColor.value.copy(wash);
      halo.uniforms.uOpacity.value = 0.02 + 0.11 * b;
    });
  });

  // Afiches pegados entre pilastra y pilastra, y a los costados de la pared del fondo.
  const posters = [makePosterTexture(3), makePosterTexture(8)].map((map) => makePSXMaterial({ map }));
  const poster = (w: number, i: number, u0: number) => new THREE.Mesh(tile(new THREE.PlaneGeometry(w, 1.3), w / 4.4, 1, u0), posters[i % 2]);
  for (let i = 0; i + 1 < PILARES.length; i++) {
    for (const s of [-1, 1]) {
      const p = poster(2.7, i + (s > 0 ? 1 : 0), i * 0.37 + (s > 0 ? 0.2 : 0));
      p.rotation.y = -s * (Math.PI / 2);
      p.position.set(s * (halfW - 0.02), 1.6, (PILARES[i] + PILARES[i + 1]) / 2);
      group.add(p);
    }
  }
  for (const s of [-1, 1]) {
    const p = poster(3.1, s > 0 ? 0 : 1, 0.55);
    p.position.set(s * 4.6, 1.6, backZ + 0.02);
    group.add(p);
  }

  // Ventilación de un lado, caños del otro.
  group.add(box(0.7, 0.45, depth - 0.4, acero, -5.2, ceilY - 0.56, midZ));
  for (let z = backZ + 1.4; z < frontZ; z += 2.1) group.add(box(0.78, 0.53, 0.08, fierro, -5.2, ceilY - 0.56, z));
  group.add(
    box(0.09, 0.09, depth, makePSXMaterial({ color: DR.rojoOscuro }), halfW - 0.42, 4.72, midZ),
    box(0.07, 0.07, depth, acero, halfW - 0.42, 4.5, midZ),
    box(0.07, 4.5, 0.07, acero, halfW - 0.42, 2.25, 5.0),
  );

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
  for (const s of [-1, 1]) inward(wall(sideW, ceilY, (4 * sideW) / (halfW * 2), 2), s * (doorW + sideW / 2), ceilY / 2);
  inward(wall(doorW * 2, ceilY - doorH, (4 * doorW) / halfW, (2 * (ceilY - doorH)) / ceilY), 0, doorH + (ceilY - doorH) / 2);
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
    flat(2.9, 1.3, posters[s > 0 ? 0 : 1], s * (doorW + 0.5 + 1.45), 1.6, 0.02);
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

  // --- Tele del fondo: el marco y la pantalla "apagada" con el logo --------------------
  const { tele } = CLUB;
  group.add(box(tele.w + 0.4, tele.h + 0.4, 0.2, fierro, tele.x, tele.y, tele.z - 0.08));
  group.add(box(0.3, ceilY - tele.y - tele.h / 2, 0.12, fierro, tele.x, (ceilY + tele.y + tele.h / 2) / 2, tele.z - 0.08));
  const screenMat = makePSXMaterial({ color: '#0c0c12', lit: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(tele.w, tele.h), screenMat);
  screen.position.set(tele.x, tele.y, tele.z + 0.03);
  group.add(screen);
  const teleLogo = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6 / LOGO_ASPECT), makePSXMaterial({ lit: false }));
  teleLogo.position.set(tele.x, tele.y, tele.z + 0.05);
  teleLogo.visible = false;
  group.add(teleLogo);

  // Blinders a los costados de la tele: pegan el fogonazo en el último beat de cada compás.
  const blinder = makePSXMaterial({ color: '#000', lit: false });
  const blinderHalo = glow(DR.crema, 0);
  for (const s of [-1, 1]) {
    const x = s * 3.55, y = 4.95, z = backZ + 0.12;
    group.add(box(1.0, 0.5, 0.16, fierro, x, y, z));
    for (const dx of [-0.24, 0.24]) {
      const lamp = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), blinder);
      lamp.position.set(x + dx, y, z + 0.09);
      group.add(lamp);
    }
    const h = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), blinderHalo);
    h.position.set(x, y, z + 0.11);
    h.renderOrder = 1;
    fx.add(h);
  }
  updaters.push((beats, energy) => {
    const b = 0.12 + (Math.floor(beats) % 4 === 3 ? 0.88 * kick : 0.1 * kick) * energy;
    blinder.uniforms.uColor.value.set(DR.crema).multiplyScalar(b);
    blinderHalo.uniforms.uOpacity.value = Math.max(0, b - 0.2) * 0.3;
  });

  // Parlantes colgados en las esquinas del fondo, apuntando a la pista.
  const speakerTex = makeSpeakerTexture();
  const cab = makePSXMaterial({ color: '#111116' });
  const front = makePSXMaterial({ map: speakerTex });
  for (const s of [-1, 1]) {
    const hung = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.7), [cab, cab, cab, cab, front, cab]);
    hung.position.set(s * 5.35, 3.95, backZ + 0.95);
    hung.rotation.set(0.22, -s * 0.5, 0);
    group.add(hung, box(0.04, ceilY - 4.55, 0.04, fierro, s * 5.35, (ceilY + 4.55) / 2, backZ + 0.85));
  }

  // --- Luces: truss, barras de led en el techo, haces, láseres y bola de espejos ----------
  for (const z of [-2.2, 1.2]) group.add(box(halfW * 2, 0.12, 0.12, acero, 0, ceilY - 0.3, z));
  for (const x of [-4, 0, 4]) group.add(box(0.12, 0.12, 3.6, acero, x, ceilY - 0.3, -0.5));

  // Barras de led: una ola que viene del fondo hacia la cabina en cada beat.
  const bars: PSXMaterial[] = [];
  for (let i = 0; i < 6; i++) {
    const m = makePSXMaterial({ color: '#000', lit: false });
    bars.push(m);
    group.add(box(8.4, 0.06, 0.08, m, 0, ceilY - 0.62, -4.9 + i * 1.1));
  }
  updaters.push((beats, energy) => {
    bars.forEach((m, i) => {
      const ph = beats - i / 6;
      const b = 0.08 + 0.92 * Math.pow(1 - (ph - Math.floor(ph)), 4) * energy;
      m.uniforms.uColor.value.copy(dim.copy(scene.beams[1]).multiplyScalar(b));
    });
  });

  // Haces que barren la pista: llegan justo hasta el piso y dejan su charco de luz.
  const beams: { beam: THREE.Mesh; pool: THREE.Mesh; mat: PSXMaterial; poolMat: PSXMaterial }[] = [];
  for (let i = 0; i < 8; i++) {
    const geo = new THREE.CylinderGeometry(0.04, 0.45, 1, 6, 1, true);
    geo.translate(0, -0.5, 0);
    const mat = glow(DR.rojo, 0.1), poolMat = glow(DR.rojo, 0.1);
    const beam = new THREE.Mesh(geo, mat);
    beam.position.set(-5.25 + i * 1.5, ceilY - 0.4, i % 2 ? 1.2 : -2.2);
    beam.renderOrder = 2;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(0.62, 8), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.renderOrder = 1;
    fx.add(beam, pool);
    group.add(box(0.3, 0.34, 0.3, fierro, beam.position.x, ceilY - 0.47, beam.position.z));
    beams.push({ beam, pool, mat, poolMat });
  }
  updaters.push((beats, energy) => {
    const pulse = 1 - (beats - Math.floor(beats));
    beams.forEach(({ beam, pool, mat, poolMat }, i) => {
      const o = beam.position;
      const rz = -o.x * 0.07 + 0.45 * Math.sin(TAU * beats * 0.0625 + i * 1.7);
      const rx = (i % 2 ? 0.3 : 0) + 0.38 * Math.sin(TAU * beats * 0.03125 + i);
      beam.rotation.set(rx, 0, rz);
      // Para dónde apunta (el haz cuelga hacia -y) y a qué distancia toca el piso.
      const len = Math.min(9, o.y / (Math.cos(rz) * Math.cos(rx)));
      beam.scale.y = len;
      pool.position.set(o.x + Math.sin(rz) * len, 0.03, o.z - Math.cos(rz) * Math.sin(rx) * len);
      const a = 0.012 + (0.022 + 0.05 * pulse) * energy;
      mat.uniforms.uOpacity.value = a;
      poolMat.uniforms.uOpacity.value = a * 2;
      mat.uniforms.uColor.value.lerp(scene.beams[i % 2], 0.1);
      poolMat.uniforms.uColor.value.copy(mat.uniforms.uColor.value);
    });
  });

  // Láseres: un abanico que sale de abajo de la tele y pasa por arriba de las cabezas.
  const laserMat = glow(ANTRO.laser, 0);
  const lasers: THREE.Mesh[] = [];
  const LASER = 15.5;
  group.add(box(0.5, 0.22, 0.3, fierro, 0, 2.42, backZ + 0.16));
  for (let i = 0; i < 7; i++) {
    const geo = new THREE.BoxGeometry(0.035, 0.035, LASER);
    geo.translate(0, 0, LASER / 2);
    const l = new THREE.Mesh(geo, laserMat);
    l.position.set(0, 2.42, backZ + 0.3);
    l.renderOrder = 2;
    l.rotation.order = 'YXZ';
    fx.add(l);
    lasers.push(l);
  }
  let laserOn = 0;
  updaters.push((beats, energy) => {
    laserOn += ((scene.laser ? 1 : 0) - laserOn) * 0.1;
    laserMat.uniforms.uOpacity.value = laserOn * (0.35 + 0.35 * kick) * energy;
    if (scene.laser) laserMat.uniforms.uColor.value.copy(scene.laser);
    const spread = 0.34 + 0.2 * Math.sin((TAU * beats) / 8);
    lasers.forEach((l, i) => {
      l.visible = laserOn > 0.02;
      l.rotation.y = ((i - 3) / 3) * spread + 0.12 * Math.sin((TAU * beats) / 16);
      // Siempre un poco hacia abajo: vistos desde la cabina no cruzan por delante de la tele.
      l.rotation.x = 0.07 + 0.05 * Math.sin((TAU * beats) / 4 + i * 0.9);
    });
  });

  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), makePSXMaterial({ color: '#d8dce8' }));
  ball.position.set(0, ceilY - 0.95, 0.4);
  group.add(ball, box(0.03, 0.6, 0.03, acero, 0, ceilY - 0.35, 0.4));
  updaters.push((_b, _e, t) => (ball.rotation.y = t * 0.6));

  // --- Cabina -------------------------------------------------------------------------
  const { boothZ, boothH } = CLUB;
  const boothDark = makePSXMaterial({ color: '#0d0d12' });
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
  // Raya de "no pasar" pintada en el piso, alrededor de la cabina.
  const hazard = makeCanvas(16, 4);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 16; x++) {
      hazard.ctx.fillStyle = ((x + y) >> 2) % 2 ? DR.amarillo : DR.negro;
      hazard.ctx.fillRect(x, y, 1, 1);
    }
  }
  const hazardTex = toPSXTexture(hazard.canvas);
  hazardTex.wrapS = THREE.RepeatWrapping;
  const hazardMat = makePSXMaterial({ map: hazardTex });
  for (const [w, x, z, turn] of [[5.0, 0, boothZ + 0.95, 0], [1.9, -2.4, boothZ + 0.1, 1], [1.9, 2.4, boothZ + 0.1, 1]] as const) {
    const line = new THREE.Mesh(tile(new THREE.PlaneGeometry(w, 0.2, Math.ceil(w), 1), w / 0.8, 1), hazardMat);
    line.rotation.set(-Math.PI / 2, 0, turn ? Math.PI / 2 : 0);
    line.position.set(x, 0.015, z);
    booth.add(line);
  }

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
    const level = (1 - (beats - Math.floor(beats))) * energy * 3.4;
    leds.forEach((m, i) => m.uniforms.uColor.value.set(Math.floor(i / 2) < level ? (i < 4 ? DR.verdeClaro : DR.rojo) : '#202020'));
  });

  // Columnas de parlantes a los costados: el de arriba late con el bombo.
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
    update(beats, energy, t) {
      for (const u of updaters) u(beats, energy, t);
    },
  };
}
