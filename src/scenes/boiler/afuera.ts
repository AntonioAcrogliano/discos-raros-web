import * as THREE from 'three';
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
  const pato = buildPatova();
  pato.root.position.set(2.2, 0.1, z + 0.8);
  pato.root.rotation.y = -0.22;
  group.add(pato.root);
  updaters.push((beats, energy, t) => {
    pato.head.rotation.x = 0.04 + 0.13 * Math.max(0, Math.sin(TAU * beats)) * energy;
    pato.head.rotation.y = 0.4 * Math.sin(t * 0.35);
    // Respira: el pecho y los brazos suben apenas.
    pato.chest.position.y = Math.sin(t * 1.6) * 0.012;
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

/**
 * El patovica, armado a mano (no es un muñeco genérico: los brazos cruzados se modelan ya
 * cruzados, que con articulaciones quedaban atravesándose). Pelado, de anteojos negros,
 * con auricular, espalda de ropero y remera negra de SEGURIDAD.
 */
function buildPatova() {
  const root = new THREE.Group();
  const black = makePSXMaterial({ color: '#15141b' });
  const dark = makePSXMaterial({ color: '#0a0a0e' });
  const skin = makePSXMaterial({ color: '#a97a5c' });
  const skinDark = makePSXMaterial({ color: '#8a6048' });
  const white = makePSXMaterial({ color: DR.crema, lit: false });
  /** Caja girada: primero se la gira sobre su centro y después se la ubica. */
  const part = (parent: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, zz: number, rx = 0, ry = 0, rz = 0) => {
    const m = box(w, h, d, mat, x, y, zz);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  };

  // Piernas separadas, bien plantado.
  for (const s of [-1, 1]) {
    part(root, 0.27, 0.92, 0.3, black, s * 0.2, 0.52, 0, 0, 0, s * -0.05);
    part(root, 0.29, 0.1, 0.42, dark, s * 0.22, 0.05, 0.05);
  }
  part(root, 0.66, 0.24, 0.36, black, 0, 1.06, 0);
  part(root, 0.68, 0.06, 0.38, dark, 0, 1.0, 0);
  part(root, 0.1, 0.07, 0.02, makePSXMaterial({ color: '#c9a227' }), 0, 1.0, 0.2);

  // Del pecho para arriba: respira todo junto.
  const chest = new THREE.Group();
  root.add(chest);
  // Torso en V: cintura, pecho y hombros cada vez más anchos.
  part(chest, 0.72, 0.26, 0.38, black, 0, 1.28, 0);
  part(chest, 0.9, 0.34, 0.44, black, 0, 1.56, 0);
  part(chest, 1.02, 0.14, 0.42, black, 0, 1.76, 0);
  for (const s of [-1, 1]) part(chest, 0.26, 0.26, 0.34, black, s * 0.52, 1.7, 0);
  // El cartel de la espalda (se ve cuando la cámara le pasa por al lado al entrar).
  part(chest, 0.5, 0.09, 0.02, white, 0, 1.6, -0.225);
  // Brazos: del hombro bajan hacia adelante hasta el codo…
  for (const s of [-1, 1]) part(chest, 0.23, 0.48, 0.25, black, s * 0.53, 1.47, 0.1, -0.5, 0, s * 0.1);
  // …y los antebrazos se cruzan por delante del pecho, uno arriba del otro.
  part(chest, 0.66, 0.19, 0.2, skin, 0.1, 1.39, 0.33, 0, 0, 0.2);
  part(chest, 0.66, 0.19, 0.2, skin, -0.1, 1.31, 0.4, 0, 0, -0.16);
  // Las manos: una asoma sobre el brazo de enfrente y la otra queda abrazándolo por abajo.
  part(chest, 0.15, 0.17, 0.16, skinDark, 0.4, 1.47, 0.36, 0, 0, 0.2);
  part(chest, 0.15, 0.17, 0.16, skinDark, -0.42, 1.26, 0.42, 0, 0, -0.16);
  // Cuello de toro.
  part(chest, 0.3, 0.14, 0.28, skin, 0, 1.87, 0.01);

  // Cabeza: pelada, mandíbula ancha, anteojos negros y auricular con cable.
  const head = new THREE.Group();
  head.position.set(0, 1.93, 0.01);
  chest.add(head);
  part(head, 0.33, 0.3, 0.34, skin, 0, 0.19, 0);
  part(head, 0.35, 0.13, 0.33, skin, 0, 0.08, 0.02);
  part(head, 0.29, 0.06, 0.3, skin, 0, 0.36, -0.01);
  for (const s of [-1, 1]) part(head, 0.04, 0.1, 0.08, skinDark, s * 0.185, 0.2, 0);
  part(head, 0.36, 0.085, 0.05, dark, 0, 0.235, 0.165);
  for (const s of [-1, 1]) part(head, 0.02, 0.03, 0.2, dark, s * 0.175, 0.245, 0.07);
  part(head, 0.07, 0.07, 0.07, skinDark, 0, 0.165, 0.185);
  part(head, 0.16, 0.022, 0.02, dark, 0, 0.075, 0.186);
  part(head, 0.34, 0.02, 0.05, skinDark, 0, 0.3, 0.165);
  part(head, 0.03, 0.05, 0.05, white, 0.2, 0.19, 0.02);
  part(chest, 0.015, 0.2, 0.015, white, 0.2, 1.97, -0.02);

  root.scale.setScalar(1.06);
  return { root, chest, head };
}

// --- Patio ---------------------------------------------------------------------------------

/**
 * El patio, pegado a la pared derecha del club. Es largo hacia adelante: acá se juegan los
 * juegos, y la cámara de costado se para bien atrás. `gameZ` es la línea de la cancha y del
 * ring; de ahí hacia la cámara no puede haber muebles.
 */
export const PATIO = { x: 12.8, back: -5, front: 13, halfW: 5.8, gameZ: -0.4, wallH: 4.6 };

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
  const { x, halfW, wallH } = PATIO;
  const z = PATIO.back + 5, halfD = 5;
  const depth = PATIO.front - PATIO.back, midZ = (PATIO.front + PATIO.back) / 2;
  const updaters: ((beats: number, energy: number, t: number) => void)[] = [];

  // Piso de baldosas de patio y paredes: la del club (ladrillo oscuro) y las medianeras.
  const floorTex = makeCheckerTexture('#7a3b2a', '#5e2c20', 2, 16);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  const fgeo = new THREE.PlaneGeometry(halfW * 2, depth, 6, 10);
  const fuv = fgeo.attributes.uv;
  for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * halfW, (fuv.getY(i) * depth) / 2);
  const floor = new THREE.Mesh(fgeo, makePSXMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(x, 0.01, midZ);
  group.add(floor);
  const club = makePSXMaterial({ map: makeWallTexture('#2b1d33', '#120b18') });
  const fence = makePSXMaterial({ map: makeWallTexture('#4a3f37', '#2a221d') });
  const back = brick(halfW * 2, wallH, fence);
  back.position.set(x, wallH / 2, PATIO.back);
  const right = brick(depth, wallH, fence);
  right.rotation.y = -Math.PI / 2;
  right.position.set(x + halfW, wallH / 2, midZ);
  const left = brick(depth, 6.4, club);
  left.rotation.y = Math.PI / 2;
  left.position.set(x - halfW, 3.2, midZ);
  group.add(back, right, left);
  // La puerta por la que se sale del club, con la luz de adentro.
  const dark = makePSXMaterial({ color: '#0a0a0e' });
  const glow = makePSXMaterial({ color: DR.rojo, lit: false });
  group.add(box(0.1, 2.5, 1.5, dark, x - halfW + 0.05, 1.25, z - 2.6));
  group.add(box(0.1, 2.2, 1.2, glow, x - halfW + 0.07, 1.1, z - 2.6));
  updaters.push((beats, energy) => {
    const pulse = Math.max(0, 1 - (beats - Math.floor(beats)) * 2.2) * (0.3 + 0.7 * energy);
    glow.uniforms.uColor.value.set(DR.rojo).multiplyScalar(0.35 + 0.65 * pulse);
  });

  // Guirnaldas de foquitos de colores, de pared a pared (altas: la pelota pasa por abajo).
  const lamps: PSXMaterial[] = [];
  const wire = makePSXMaterial({ color: '#0a0a0e' });
  for (const [zz, sag] of [[-3.2, 0.5], [-0.4, 0.75], [2.6, 0.6], [5.6, 0.7]]) {
    for (let i = 0; i <= 12; i++) {
      const k = i / 12;
      const px = x - halfW + k * halfW * 2, py = wallH + 0.3 - Math.sin(k * Math.PI) * sag;
      const m = makePSXMaterial({ color: DR_CYCLE[i % DR_CYCLE.length], lit: false });
      lamps.push(m);
      group.add(box(0.14, 0.16, 0.14, m, px, py - 0.1, zz));
      if (i < 12) {
        const nx = x - halfW + ((i + 1) / 12) * halfW * 2, ny = wallH + 0.3 - Math.sin(((i + 1) / 12) * Math.PI) * sag;
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
  // Todo contra el fondo: de la línea de la cancha para adelante el patio queda libre.
  table(x + 0.9, z - 3.7);
  const crate = makePSXMaterial({ color: DR.amarillo });
  group.add(box(0.5, 0.34, 0.36, crate, x - 1.7, 0.17, z - 4.5), box(0.5, 0.34, 0.36, crate, x - 1.65, 0.51, z - 4.55));
  const iron = makePSXMaterial({ color: '#2a2a32' });
  group.add(box(1.2, 0.8, 0.7, makePSXMaterial({ map: makeWallTexture('#6a4a3a', '#3a2a22') }), x + 5.3, 0.4, z - 2.4));
  group.add(box(1.2, 0.05, 0.7, iron, x + 5.3, 0.9, z - 2.4));
  const ember = makePSXMaterial({ color: DR.rojo, lit: false });
  group.add(box(1, 0.06, 0.5, ember, x + 5.3, 0.83, z - 2.4));
  updaters.push((_b, _e, t) => ember.uniforms.uColor.value.set(DR.rojo).multiplyScalar(0.6 + 0.4 * Math.sin(t * 5)));
  const pot = makePSXMaterial({ color: '#8a4a2a' });
  const leaf = makePSXMaterial({ color: DR.verdeClaro });
  for (const [px, pz] of [[x - 5.2, z - 4.5], [x + 5.2, z - 4.5]]) {
    group.add(box(0.5, 0.5, 0.5, pot, px, 0.25, pz));
    const plant = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 5), leaf);
    plant.position.set(px, 1.25, pz);
    group.add(plant);
  }
  // La luna, por arriba de la medianera.
  const moon = new THREE.Mesh(new THREE.CircleGeometry(0.8, 8), makePSXMaterial({ color: DR.crema, lit: false }));
  moon.position.set(x + 2.5, 7.6, z - halfD - 4);
  group.add(moon);

  return {
    group,
    update(beats, energy, t) {
      for (const u of updaters) u(beats, energy, t);
    },
  };
}
