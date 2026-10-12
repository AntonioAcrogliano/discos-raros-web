import * as THREE from 'three';
import { buildBoxRig } from '../../characters/rig';
import { DR, DR_CYCLE, LOGO_ASPECT, type PSXMaterial, box, makeCanvas, makeCheckerTexture, makeLogoCanvas, makePSXMaterial, makeWallTexture, setPSXMap, toPSXTexture } from '../../style-kit';
import { CLUB } from './club';

/**
 * Lo que hay alrededor del club: la vereda con la fachada y las puertas (la entrada del sitio)
 * y el patio de juegos, pegado a la pared derecha. Cada uno se muestra solo cuando la cámara
 * está ahí: la fachada taparía la cámara de los juegos, que se para más atrás que la puerta.
 */

const TAU = Math.PI * 2;

/** Medidas de la puerta (dos hojas) y de la vereda. */
export const PUERTA = { halfW: 1.15, h: 2.7, z: CLUB.frontZ };

/** Pared con textura de ladrillo repetida según su tamaño. */
function brick(w: number, h: number, mat: THREE.Material) {
  const geo = new THREE.PlaneGeometry(w, h, Math.max(1, Math.ceil(w / 2)), Math.max(1, Math.ceil(h / 2)));
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 1.6), uv.getY(i) * (h / 1.6));
  return new THREE.Mesh(geo, mat);
}

export interface Afuera {
  group: THREE.Group;
  /** Cuánto están abiertas las puertas (0 cerradas, 1 de par en par). */
  setDoors(open: number): void;
  update(beats: number, energy: number, t: number): void;
}

export function buildAfuera(): Afuera {
  const group = new THREE.Group();
  const { halfW, h, z } = PUERTA;
  const W = 13, H = 7.2;
  const updaters: ((beats: number, energy: number, t: number) => void)[] = [];

  // --- Fachada: pared de ladrillo con el hueco de la puerta ---------------------------------
  const wall = makePSXMaterial({ map: makeWallTexture('#2b1d33', '#120b18') });
  const side = (W - halfW) / 1;
  for (const s of [-1, 1]) {
    const p = brick(side, H, wall);
    p.position.set(s * (halfW + side / 2), H / 2, z);
    group.add(p);
  }
  const top = brick(halfW * 2, H - h, wall);
  top.position.set(0, h + (H - h) / 2, z);
  group.add(top);
  // Marco de la puerta y escalón.
  const frame = makePSXMaterial({ color: '#0a0a0e' });
  for (const s of [-1, 1]) group.add(box(0.16, h + 0.16, 0.3, frame, s * (halfW + 0.08), (h + 0.16) / 2, z + 0.02));
  group.add(box(halfW * 2 + 0.32, 0.16, 0.3, frame, 0, h + 0.08, z + 0.02));
  group.add(box(halfW * 2 + 0.8, 0.1, 0.9, makePSXMaterial({ color: '#3a3644' }), 0, 0.05, z + 0.5));

  // Las dos hojas: giran sobre las bisagras de afuera y abren hacia la vereda.
  const doorMat = makePSXMaterial({ color: DR.rojoOscuro });
  const trim = makePSXMaterial({ color: DR.amarillo });
  const glow = makePSXMaterial({ color: DR.amarillo, lit: false });
  const hinges: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(s * halfW, 0, z + 0.04);
    // La hoja va de la bisagra hacia el medio.
    const cx = -s * (halfW / 2);
    hinge.add(box(halfW - 0.02, h, 0.09, doorMat, cx, h / 2, 0));
    hinge.add(box(halfW - 0.2, 0.08, 0.1, trim, cx, 0.34, 0.012));
    hinge.add(box(halfW - 0.2, 0.08, 0.1, trim, cx, h - 0.34, 0.012));
    // Ojo de buey: por ahí se ve la luz de adentro, que late con el bombo.
    hinge.add(box(0.46, 0.46, 0.1, frame, cx, 1.75, 0.014));
    hinge.add(box(0.34, 0.34, 0.1, glow, cx, 1.75, 0.022));
    hinge.add(box(0.07, 0.42, 0.08, trim, -s * (halfW - 0.16), 1.2, 0.07));
    group.add(hinge);
    hinges.push(hinge);
  }
  // Rendija de luz por debajo de la puerta.
  const slit = box(halfW * 2, 0.03, 0.02, glow, 0, 0.115, z + 0.1);
  group.add(slit);
  updaters.push((beats, energy) => {
    const beat = Math.floor(beats);
    const pulse = Math.max(0, 1 - (beats - beat) * 2.2) * (0.35 + 0.65 * energy);
    glow.uniforms.uColor.value.set(DR_CYCLE[((beat % 3) + 3) % 3]).multiplyScalar(0.3 + 0.7 * pulse);
  });

  // --- Cartel: marquesina con el logo y foquitos que corren ---------------------------------
  const signY = h + 1.75;
  group.add(box(5.4, 2.7, 0.3, frame, 0, signY, z + 0.2));
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(4.1, 4.1 / LOGO_ASPECT), makePSXMaterial({ lit: false }));
  logo.position.set(0, signY, z + 0.37);
  logo.visible = false;
  group.add(logo);
  void makeLogoCanvas(128).then((cv) => {
    setPSXMap(logo.material as PSXMaterial, toPSXTexture(cv));
    logo.visible = true;
  });
  const bulbs: PSXMaterial[] = [];
  const bulb = (x: number, y: number) => {
    const m = makePSXMaterial({ color: DR.amarillo, lit: false });
    bulbs.push(m);
    group.add(box(0.11, 0.11, 0.08, m, x, y, z + 0.38));
  };
  for (let i = 0; i <= 12; i++) {
    bulb(-2.52 + i * 0.42, signY + 1.2);
    bulb(-2.52 + i * 0.42, signY - 1.2);
  }
  for (let i = 1; i <= 4; i++) {
    bulb(-2.52, signY - 1.2 + i * 0.48);
    bulb(2.52, signY - 1.2 + i * 0.48);
  }
  updaters.push((_b, _e, t) => {
    const step = Math.floor(t * 6);
    bulbs.forEach((m, i) => m.uniforms.uColor.value.set((i + step) % 3 === 0 ? DR.crema : (i + step) % 3 === 1 ? DR.amarillo : '#6a5a10'));
    // El cartel parpadea cada tanto, como un tubo viejo.
    (logo.material as PSXMaterial).uniforms.uColor.value.setScalar(Math.sin(t * 1.3) > 0.985 || Math.sin(t * 7.1) > 0.995 ? 0.45 : 1);
  });

  // --- Vereda, cordón y calle ---------------------------------------------------------------
  const tiles = makeCheckerTexture('#3b3742', '#2c2933', 2, 16);
  tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
  const plane = (w: number, d: number, mat: THREE.Material, x: number, y: number, zz: number, repeat = 1) => {
    const geo = new THREE.PlaneGeometry(w, d, Math.ceil(w / 2), Math.ceil(d / 2));
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * repeat, uv.getY(i) * d * repeat);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, zz);
    return m;
  };
  group.add(plane(W * 2, 5.4, makePSXMaterial({ map: tiles }), 0, 0, z + 2.7, 0.5));
  group.add(box(W * 2, 0.16, 0.24, makePSXMaterial({ color: '#55505e' }), 0, -0.02, z + 5.5));
  group.add(plane(W * 2, 12, makePSXMaterial({ color: '#16131c' }), 0, -0.1, z + 11.6));
  // Rayas de la calle.
  const paint = makePSXMaterial({ color: DR.crema, lit: false });
  for (let i = -3; i <= 3; i++) group.add(plane(1.5, 0.16, paint, i * 3.6, -0.09, z + 9.5));

  // --- Cosas de la puerta de un boliche -----------------------------------------------------
  // Postes dorados con soga: la fila.
  const gold = makePSXMaterial({ color: '#c9a227' });
  const rope = makePSXMaterial({ color: DR.rojo });
  for (const x of [-2.2, -4.4]) {
    group.add(box(0.1, 1, 0.1, gold, x, 0.5, z + 1.7));
    group.add(box(0.2, 0.06, 0.2, gold, x, 0.03, z + 1.7));
    group.add(box(0.15, 0.1, 0.15, gold, x, 1.03, z + 1.7));
  }
  group.add(box(2.2, 0.07, 0.06, rope, -3.3, 0.86, z + 1.7));
  // Farol con su haz.
  const metal = makePSXMaterial({ color: '#3a3a44' });
  group.add(box(0.14, 4.6, 0.14, metal, 4.6, 2.3, z + 4.2));
  group.add(box(1, 0.12, 0.14, metal, 4.2, 4.6, z + 4.2));
  group.add(box(0.36, 0.14, 0.3, makePSXMaterial({ color: DR.crema, lit: false }), 3.75, 4.5, z + 4.2));
  const beamGeo = new THREE.CylinderGeometry(0.14, 1.5, 4.5, 6, 1, true);
  beamGeo.translate(0, -2.25, 0);
  const beam = new THREE.Mesh(beamGeo, makePSXMaterial({ color: DR.amarillo, lit: false, opacity: 0.1, side: THREE.DoubleSide }));
  beam.position.set(3.75, 4.45, z + 4.2);
  beam.renderOrder = 2;
  group.add(beam);
  // Luna y estrellas, arriba del edificio.
  const moon = new THREE.Mesh(new THREE.CircleGeometry(0.9, 8), makePSXMaterial({ color: DR.crema, lit: false }));
  moon.position.set(-7.5, 10.2, z - 3);
  group.add(moon);
  const star = makePSXMaterial({ color: DR.rosa, lit: false });
  let seed = 23;
  const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 26; i++) group.add(box(0.07, 0.07, 0.02, star, (r() - 0.5) * 30, H + 0.6 + r() * 5, z - 2));

  // El patovica: grandote, de negro, con los brazos cruzados. Cabecea con el bombo.
  const pato = buildBoxRig({ skin: '#9c7358', shirt: '#0f1217', pants: '#0f1217', hair: '#141210', height: 1.95 });
  pato.root.position.set(2.15, 0.1, z + 0.75);
  pato.root.scale.set(1.35, 1, 1.25);
  pato.root.rotation.y = -0.25;
  group.add(pato.root);
  updaters.push((beats, energy, t) => {
    pato.armL.rotation.set(-0.75, 0, -0.5);
    pato.foreL.rotation.set(-1.35, -0.9, 0);
    pato.armR.rotation.set(-0.75, 0, 0.5);
    pato.foreR.rotation.set(-1.35, 0.9, 0);
    pato.head.rotation.x = 0.05 + 0.12 * Math.max(0, Math.sin(TAU * beats)) * energy;
    pato.head.rotation.y = 0.35 * Math.sin(t * 0.35);
    pato.body.position.y = Math.sin(t * 1.6) * 0.008;
  });

  return {
    group,
    setDoors(open) {
      hinges[0].rotation.y = -open * 1.85;
      hinges[1].rotation.y = open * 1.85;
      slit.visible = open < 0.05;
    },
    update(beats, energy, t) {
      for (const u of updaters) u(beats, energy, t);
    },
  };
}

// --- Patio ---------------------------------------------------------------------------------

/** Dónde está el patio (pegado a la pared derecha del club) y hacia dónde se lo mira. */
export const PATIO = { x: 12.6, z: 0, halfW: 5.2, halfD: 5 };

/** Pantalla de un fichín: franjas de colores y un cartel, en 32×24. */
function makeArcadeScreen(title: string, a: string, b: string) {
  const { canvas, ctx } = makeCanvas(32, 24);
  ctx.fillStyle = '#0b0a12';
  ctx.fillRect(0, 0, 32, 24);
  for (let y = 0; y < 24; y += 4) {
    ctx.fillStyle = (y / 4) % 2 ? a : b;
    ctx.fillRect(2, y + 9, 28, 2);
  }
  ctx.fillStyle = DR.amarillo;
  for (let i = 0; i < title.length; i++) ctx.fillRect(3 + i * 3, 3, 2, 3);
  ctx.fillStyle = DR.crema;
  ctx.fillRect(13, 13, 2, 4);
  ctx.fillRect(18, 12, 2, 5);
  return toPSXTexture(canvas);
}

export interface Patio {
  group: THREE.Group;
  update(beats: number, energy: number, t: number): void;
}

export function buildPatio(): Patio {
  const group = new THREE.Group();
  const { x, z, halfW, halfD } = PATIO;
  const updaters: ((beats: number, energy: number, t: number) => void)[] = [];

  // Piso de baldosas de patio y paredes: la del club (ladrillo oscuro) y tres medianeras.
  const floorTex = makeCheckerTexture('#7a3b2a', '#5e2c20', 2, 16);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  const fgeo = new THREE.PlaneGeometry(halfW * 2, halfD * 2, 6, 6);
  const fuv = fgeo.attributes.uv;
  for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * halfW, fuv.getY(i) * halfD);
  const floor = new THREE.Mesh(fgeo, makePSXMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(x, 0.01, z);
  group.add(floor);
  const club = makePSXMaterial({ map: makeWallTexture('#2b1d33', '#120b18') });
  const fence = makePSXMaterial({ map: makeWallTexture('#4a3f37', '#2a221d') });
  const back = brick(halfW * 2, 3.2, fence);
  back.position.set(x, 1.6, z - halfD);
  const right = brick(halfD * 2, 3.2, fence);
  right.rotation.y = -Math.PI / 2;
  right.position.set(x + halfW, 1.6, z);
  const left = brick(halfD * 2, 6, club);
  left.rotation.y = Math.PI / 2;
  left.position.set(x - halfW, 3, z);
  group.add(back, right, left);
  // La puerta por la que se sale del club, con la luz de adentro.
  const dark = makePSXMaterial({ color: '#0a0a0e' });
  const glow = makePSXMaterial({ color: DR.rojo, lit: false });
  group.add(box(0.1, 2.5, 1.5, dark, x - halfW + 0.05, 1.25, z + 1.6));
  group.add(box(0.1, 2.2, 1.2, glow, x - halfW + 0.07, 1.1, z + 1.6));
  updaters.push((beats, energy) => {
    const pulse = Math.max(0, 1 - (beats - Math.floor(beats)) * 2.2) * (0.3 + 0.7 * energy);
    glow.uniforms.uColor.value.set(DR.rojo).multiplyScalar(0.35 + 0.65 * pulse);
  });

  // Guirnalda de foquitos de colores, de pared a pared.
  const lamps: PSXMaterial[] = [];
  const wire = makePSXMaterial({ color: '#0a0a0e' });
  for (const [zz, sag] of [[-2.6, 0.5], [0.4, 0.7], [3.2, 0.55]]) {
    for (let i = 0; i <= 12; i++) {
      const k = i / 12;
      const px = x - halfW + k * halfW * 2, py = 3.5 - Math.sin(k * Math.PI) * sag;
      const m = makePSXMaterial({ color: DR_CYCLE[i % DR_CYCLE.length], lit: false });
      lamps.push(m);
      group.add(box(0.14, 0.16, 0.14, m, px, py - 0.1, zz));
      if (i < 12) {
        const nx = x - halfW + ((i + 1) / 12) * halfW * 2, ny = 3.5 - Math.sin(((i + 1) / 12) * Math.PI) * sag;
        const seg = box(Math.hypot(nx - px, ny - py), 0.03, 0.03, wire, (px + nx) / 2, (py + ny) / 2, zz);
        seg.rotation.z = Math.atan2(ny - py, nx - px);
        group.add(seg);
      }
    }
  }
  updaters.push((beats) => {
    const step = Math.floor(beats);
    lamps.forEach((m, i) => m.uniforms.uColor.value.set(DR_CYCLE[i % DR_CYCLE.length]).multiplyScalar((i + step) % 2 ? 1 : 0.35));
  });

  // Los fichines: un mueble por juego, contra la medianera del fondo.
  const cabinet = (cx: number, color: string, screen: THREE.Texture) => {
    const body = makePSXMaterial({ color });
    const g = new THREE.Group();
    g.add(box(0.9, 1.1, 0.8, body, 0, 0.55, 0));
    g.add(box(0.9, 0.9, 0.5, body, 0, 1.55, -0.15));
    g.add(box(0.9, 0.3, 0.7, dark, 0, 2.1, -0.05));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.55), makePSXMaterial({ map: screen, lit: false }));
    scr.position.set(0, 1.58, 0.11);
    scr.rotation.x = -0.18;
    g.add(scr);
    // Tablero con palanca y botones.
    const panel = box(0.9, 0.08, 0.42, dark, 0, 1.12, 0.3);
    panel.rotation.x = 0.25;
    g.add(panel, box(0.05, 0.16, 0.05, makePSXMaterial({ color: DR.crema }), -0.2, 1.22, 0.3), box(0.1, 0.1, 0.1, makePSXMaterial({ color: DR.rojo }), -0.2, 1.33, 0.3));
    for (const [bx, c] of [[0.1, DR.amarillo], [0.26, DR.verdeClaro]] as const) g.add(box(0.09, 0.05, 0.09, makePSXMaterial({ color: c, lit: false }), bx, 1.18, 0.32));
    g.position.set(cx, 0, z - halfD + 0.6);
    group.add(g);
    return scr.material as PSXMaterial;
  };
  // Bien separados: la ventana del menú va al medio de la pantalla y los taparía.
  const screens = [cabinet(x - 3.6, DR.rojo, makeArcadeScreen('PELEA', DR.rojo, DR.amarillo)), cabinet(x + 3.6, DR.verdeClaro, makeArcadeScreen('FUTBOL', DR.verdeClaro, DR.crema))];
  updaters.push((_b, _e, t) => screens.forEach((m, i) => m.uniforms.uColor.value.setScalar(0.8 + 0.2 * Math.sin(t * 9 + i * 2))));

  // Mesa de plástico con sillas, un cajón de birra, la parrilla y una planta.
  const white = makePSXMaterial({ color: '#d8dce8' });
  const table = (tx: number, tz: number) => {
    group.add(box(1, 0.06, 1, white, tx, 0.74, tz));
    for (const [dx, dz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) group.add(box(0.06, 0.72, 0.06, white, tx + dx, 0.36, tz + dz));
    for (const s of [-1, 1]) {
      group.add(box(0.46, 0.05, 0.46, white, tx + s * 0.95, 0.44, tz));
      group.add(box(0.05, 0.5, 0.46, white, tx + s * 1.17, 0.7, tz));
    }
    group.add(box(0.1, 0.24, 0.1, makePSXMaterial({ color: '#5a3a16' }), tx + 0.15, 0.89, tz - 0.1));
  };
  table(x + 2.9, z + 1.4);
  const crate = makePSXMaterial({ color: DR.amarillo });
  group.add(box(0.5, 0.34, 0.36, crate, x - 4.5, 0.17, z - 1.2), box(0.5, 0.34, 0.36, crate, x - 4.45, 0.51, z - 1.25));
  const iron = makePSXMaterial({ color: '#2a2a32' });
  group.add(box(1.2, 0.8, 0.7, makePSXMaterial({ map: makeWallTexture('#6a4a3a', '#3a2a22') }), x + 4.3, 0.4, z - 3.6));
  group.add(box(1.2, 0.05, 0.7, iron, x + 4.3, 0.9, z - 3.6));
  const ember = makePSXMaterial({ color: DR.rojo, lit: false });
  group.add(box(1, 0.06, 0.5, ember, x + 4.3, 0.83, z - 3.6));
  updaters.push((_b, _e, t) => ember.uniforms.uColor.value.set(DR.rojo).multiplyScalar(0.6 + 0.4 * Math.sin(t * 5)));
  const pot = makePSXMaterial({ color: '#8a4a2a' });
  const leaf = makePSXMaterial({ color: DR.verdeClaro });
  for (const [px, pz] of [[x - 4.3, z + 4], [x + 4.4, z + 4.1]]) {
    group.add(box(0.5, 0.5, 0.5, pot, px, 0.25, pz));
    const plant = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 5), leaf);
    plant.position.set(px, 1.25, pz);
    group.add(plant);
  }
  // La luna, por arriba de la medianera.
  const moon = new THREE.Mesh(new THREE.CircleGeometry(0.8, 8), makePSXMaterial({ color: DR.crema, lit: false }));
  moon.position.set(x + 2.5, 6.4, z - halfD - 4);
  group.add(moon);

  return {
    group,
    update(beats, energy, t) {
      for (const u of updaters) u(beats, energy, t);
    },
  };
}
