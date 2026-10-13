import * as THREE from 'three';
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
  halfW: 8.2,
  backZ: -6.5,
  frontZ: 9.6,
  ceilY: 6.0,
  boothZ: 2.5,
  boothH: 1.0,
  djZ: 1.86,
  tele: { x: 0, y: 4.3, z: -6.32, w: 5.3, h: 2.98 },
};

export interface Club {
  group: THREE.Group;
  /** Cabina y parlantes: se esconden mientras se crea un personaje, para verlo de cerca. */
  booth: THREE.Group;
  /** Haces, charcos de luz y brillitos de la bola: se apagan en el creador, que si no tiñen al personaje y no se ven los colores. */
  fx: THREE.Group;
  /** La luz del boliche: la violeta de siempre, que late un poco con el bombo. La aplica el boiler. */
  light: { ambient: THREE.Color; key: THREE.Color; fog: THREE.Color };
  /** @param beats tiempo de baile en beats · @param energy 0–1 · @param t segundos */
  update(beats: number, energy: number, t: number): void;
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
  const light = { ambient: new THREE.Color(), key: new THREE.Color(), fog: new THREE.Color('#120a1f') };
  updaters.push((beats, energy) => {
    kick = Math.max(0, 1 - (beats - Math.floor(beats)) * 2.5) * energy;
    light.ambient.setRGB(0.4 + 0.04 * kick, 0.36 + 0.03 * kick, 0.5 + 0.05 * kick);
    light.key.setRGB(0.62, 0.58, 0.56).multiplyScalar(1 + 0.14 * kick);
  });

  // --- Pista: baldosas que cambian de color con el beat ------------------------------
  // Una sola textura con 4×4 píxeles por baldosa, que se redibuja en cada beat.
  const TX = 16, TZ = 16, PX = 4;
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
  const back = wall(halfW * 2, ceilY, 9, 3);
  back.position.set(0, ceilY / 2, backZ);
  const left = wall(depth, ceilY, 6, 3);
  left.rotation.y = Math.PI / 2;
  left.position.set(-halfW, ceilY / 2, (frontZ + backZ) / 2);
  const right = wall(depth, ceilY, 6, 3);
  right.rotation.y = -Math.PI / 2;
  right.position.set(halfW, ceilY / 2, (frontZ + backZ) / 2);
  // Techo (antes se veía el vacío al mirar para arriba) con sus vigas.
  const ceiling = new THREE.Mesh(wall(halfW * 2, depth, 9, 9).geometry, makePSXMaterial({ map: wallTex, color: '#9a90b0' }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, ceilY, (frontZ + backZ) / 2);
  group.add(back, left, right, ceiling);

  // Pilastras entre tapa y tapa de disco, cada una con su tubo de neón que late con el bombo.
  const pilar = makePSXMaterial({ color: '#241a33' });
  const tubes: { tube: PSXMaterial; halo: PSXMaterial; color: THREE.Color }[] = [];
  [0, 1, 2, 3].forEach((i) => {
    const z = backZ + 1.8 + i * 3.2;
    group.add(box(halfW * 2, 0.26, 0.22, pilar, 0, ceilY - 0.13, z));
    for (const s of [-1, 1]) {
      const color = new THREE.Color(DR_CYCLE[(i * 2 + (s > 0 ? 1 : 0)) % 4]);
      const tube = makePSXMaterial({ color, lit: false });
      const halo = glow(color, 0.1);
      group.add(box(0.3, ceilY, 0.55, pilar, s * (halfW - 0.15), ceilY / 2, z), box(0.06, 1.7, 0.06, tube, s * (halfW - 0.34), 2.75, z));
      const h = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.2), halo);
      h.rotation.y = -s * (Math.PI / 2);
      h.position.set(s * (halfW - 0.31), 2.75, z);
      h.renderOrder = 1;
      group.add(h);
      tubes.push({ tube, halo, color });
    }
  });
  updaters.push((beats, energy) => {
    // Los de un lado laten con el bombo y los del otro a contratiempo.
    const off = Math.max(0, 1 - (beats + 0.5 - Math.floor(beats + 0.5)) * 2.5) * energy;
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
  for (const s of [-1, 1]) inward(wall(sideW, ceilY, (9 * sideW) / (halfW * 2), 3), s * (doorW + sideW / 2), ceilY / 2);
  inward(wall(doorW * 2, ceilY - doorH, (9 * doorW) / halfW, (3 * (ceilY - doorH)) / ceilY), 0, doorH + (ceilY - doorH) / 2);
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
      p.position.set(side * (halfW - 0.02), 2.4 + ((i + (side > 0 ? 1 : 0)) % 2) * 1.1, backZ + 1 + i * 1.6);
      p.rotation.y = -side * (Math.PI / 2);
      group.add(p);
    }
  });

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
  for (const z of [-2.2, 1.2]) group.add(box(halfW * 2, 0.12, 0.12, metal, 0, ceilY - 0.3, z));
  for (const x of [-4, 0, 4]) group.add(box(0.12, 0.12, 3.6, metal, x, ceilY - 0.3, -0.5));
  // Haces que barren la pista: llegan justo hasta el piso y dejan su charco de luz.
  const beams: { beam: THREE.Mesh; pool: THREE.Mesh; mat: PSXMaterial; poolMat: PSXMaterial }[] = [];
  const beamColors = [DR.rojo, DR.amarillo, DR.verdeClaro, DR.rosa, DR.amarillo, DR.rojo];
  beamColors.forEach((color, i) => {
    const geo = new THREE.CylinderGeometry(0.03, 0.5, 1, 6, 1, true);
    geo.translate(0, -0.5, 0);
    const mat = glow(color, 0.1), poolMat = glow(color, 0.1);
    const beam = new THREE.Mesh(geo, mat);
    beam.position.set(-5 + i * 2, ceilY - 0.35, i % 2 ? 1.2 : -2.2);
    beam.renderOrder = 2;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(0.7, 8), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.renderOrder = 1;
    fx.add(beam, pool);
    group.add(box(0.3, 0.3, 0.3, metal, beam.position.x, ceilY - 0.45, beam.position.z));
    beams.push({ beam, pool, mat, poolMat });
  });
  updaters.push((beats, energy) => {
    const pulse = 1 - (beats - Math.floor(beats));
    beams.forEach(({ beam, pool, mat, poolMat }, i) => {
      const o = beam.position;
      const rz = -o.x * 0.05 + 0.5 * Math.sin(TAU * beats * 0.0625 + i * 1.7);
      const rx = (i % 2 ? 0.25 : 0) + 0.4 * Math.sin(TAU * beats * 0.03125 + i);
      beam.rotation.set(rx, 0, rz);
      // Para dónde apunta (el haz cuelga hacia -y) y a qué distancia toca el piso.
      const len = Math.min(9, o.y / (Math.cos(rz) * Math.cos(rx)));
      beam.scale.y = len;
      pool.position.set(o.x + Math.sin(rz) * len, 0.03, o.z - Math.cos(rz) * Math.sin(rx) * len);
      const a = 0.03 + (0.05 + 0.09 * pulse) * energy;
      mat.uniforms.uOpacity.value = a;
      poolMat.uniforms.uOpacity.value = a * 1.6;
    });
  });

  // Barras de led en el techo: una ola de colores que viene del fondo hacia la cabina en cada beat.
  const bars: PSXMaterial[] = [];
  for (let i = 0; i < 6; i++) {
    const m = makePSXMaterial({ color: '#000', lit: false });
    bars.push(m);
    group.add(box(halfW * 1.3, 0.06, 0.08, m, 0, ceilY - 0.62, backZ + 0.4 + i * 1.1));
  }
  updaters.push((beats, energy) => {
    const beat = Math.floor(beats);
    bars.forEach((m, i) => {
      const ph = beats - i / 6;
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
    sparkMat.uniforms.uOpacity.value = 0.12 + 0.4 * energy;
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
    const level = (1 - (beats - Math.floor(beats))) * energy * 3.4;
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
    hung.position.set(s * (halfW - 1.25), 3.95, backZ + 0.95);
    hung.rotation.set(0.22, -s * 0.5, 0);
    group.add(hung, box(0.04, ceilY - 4.55, 0.04, metal, s * (halfW - 1.25), (ceilY + 4.55) / 2, backZ + 0.85));
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
    update(beats, energy, t) {
      for (const u of updaters) u(beats, energy, t);
    },
  };
}
