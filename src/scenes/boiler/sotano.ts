import * as THREE from 'three';
import { DR, FONT, type PSXMaterial, box, fontsReady, makeCanvas, makeCheckerTexture, makePSXMaterial, makeWallTexture, toPSXTexture } from '../../style-kit';
import { ESCALERA, PALCO, PASILLO, SOTANO, bake, glow } from './club';

/**
 * El sótano: un cuarto bajo, con luz roja y dos caños, abajo del fondo del boliche. Se baja por
 * la escalera que sale del pasillo. En cada caño baila uno: una parodia de hombre araña en sunga
 * y una de pelado amarillo y panzón en calzones (armados a mano, como el patova: no son raros).
 */
export interface Sotano {
  group: THREE.Group;
  update(beats: number, energy: number, t: number): void;
}

const TAU = Math.PI * 2;

/** Una pared, un piso o un techo: un plano en pedazos de un metro (enteros, la textura se tuerce), con la textura repetida cada `tile` metros. */
function plane(w: number, h: number, mat: PSXMaterial, tile = 2) {
  const geo = new THREE.PlaneGeometry(w, h, Math.ceil(w), Math.ceil(h));
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile);
  return new THREE.Mesh(geo, mat);
}

/** Cartel de neón (texto en un canvas chiquito, redibujado cuando carga la fuente). */
function neon(text: string, color: string, w: number, h: number) {
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
  const sign = new THREE.Group();
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.5, h * 2.2), glow(color, 0.1));
  halo.position.z = 0.02;
  halo.renderOrder = 1;
  sign.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), makePSXMaterial({ map: tex, lit: false })), halo);
  return sign;
}

/** Textura de telaraña: rojo con líneas negras que salen del medio y anillos. */
function webTexture(base: string) {
  const { canvas, ctx } = makeCanvas(16, 16);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#14080c';
  for (let i = 0; i < 16; i++) {
    ctx.fillRect(i, 8, 1, 1);
    ctx.fillRect(8, i, 1, 1);
    ctx.fillRect(i, i, 1, 1);
    ctx.fillRect(15 - i, i, 1, 1);
  }
  for (const r of [3, 6]) {
    ctx.strokeStyle = '#14080c';
    ctx.strokeRect(8 - r + 0.5, 8 - r + 0.5, r * 2, r * 2);
  }
  const tex = toPSXTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Lados de los cilindros y las esferas: redondeados, pero de pocos polígonos (como en la Play). */
const SEG = 8;
const cyl = (rt: number, rb: number, h: number, mat: PSXMaterial, x: number, y: number, z: number, sz = 1) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, SEG), mat);
  m.position.set(x, y, z);
  m.scale.z = sz;
  return m;
};
const ball = (r: number, mat: PSXMaterial, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, SEG, 6), mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
};

/**
 * Bailarín de cilindros y esferas: grupos anidados (cadera, torso, cabeza, hombros y codos,
 * piernas y rodillas). Mira a +z; el brazo izquierdo está en +x. Las piezas de cada grupo se
 * juntan por material (`bake`): son muchas y si no, cada una costaría una llamada de dibujo.
 */
interface PoleDancer {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  /** Hombro y codo, izquierdo y derecho. */
  arms: [THREE.Group, THREE.Group][];
  /** Cadera y rodilla, izquierda y derecha. */
  legs: [THREE.Group, THREE.Group][];
  belly: THREE.Mesh | null;
}

interface Outfit {
  skin: PSXMaterial;
  /** Sunga o calzones. */
  under: PSXMaterial;
  hands?: PSXMaterial;
  shins?: PSXMaterial;
  feet?: PSXMaterial;
  belly?: boolean;
  head(g: THREE.Group): void;
}

function buildDancer(o: Outfit): PoleDancer {
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.92;
  root.add(hips);
  // La sunga (o el calzón), con la cola redonda.
  hips.add(cyl(0.185, 0.165, 0.2, o.under, 0, -0.02, 0, 0.68));
  for (const s of [1, -1]) hips.add(ball(0.1, o.under, s * 0.08, -0.06, -0.05, 1, 1, 0.85));
  const torso = new THREE.Group();
  torso.position.y = 0.06;
  hips.add(torso);
  torso.add(cyl(0.2, 0.155, 0.5, o.skin, 0, 0.29, 0, 0.62), ball(0.2, o.skin, 0, 0.45, 0, 1.05, 0.5, 0.64));
  for (const s of [1, -1]) torso.add(ball(0.075, o.skin, s * 0.235, 0.49, 0));
  torso.add(cyl(0.055, 0.062, 0.1, o.skin, 0, 0.58, 0));
  let belly: THREE.Mesh | null = null;
  if (o.belly) belly = ball(0.235, o.skin, 0, 0.16, 0.06, 1, 0.9, 0.95);
  const head = new THREE.Group();
  head.position.y = 0.6;
  torso.add(head);
  o.head(head);
  const arms: [THREE.Group, THREE.Group][] = [1, -1].map((s) => {
    const sh = new THREE.Group();
    sh.position.set(s * 0.245, 0.5, 0);
    torso.add(sh);
    sh.add(cyl(0.055, 0.045, 0.3, o.skin, 0, -0.15, 0), ball(0.047, o.skin, 0, -0.3, 0));
    const el = new THREE.Group();
    el.position.y = -0.3;
    sh.add(el);
    el.add(cyl(0.046, 0.038, 0.27, o.skin, 0, -0.135, 0), ball(0.058, o.hands ?? o.skin, 0, -0.3, 0, 0.9, 1.25, 0.75));
    bake(sh);
    bake(el);
    return [sh, el];
  });
  const legs: [THREE.Group, THREE.Group][] = [1, -1].map((s) => {
    const hip = new THREE.Group();
    hip.position.set(s * 0.095, 0, 0);
    hips.add(hip);
    hip.add(cyl(0.088, 0.066, 0.44, o.skin, 0, -0.22, 0), ball(0.066, o.skin, 0, -0.44, 0));
    const knee = new THREE.Group();
    knee.position.y = -0.44;
    hip.add(knee);
    knee.add(cyl(0.064, 0.048, 0.42, o.shins ?? o.skin, 0, -0.21, 0), ball(0.07, o.feet ?? o.skin, 0, -0.44, 0.05, 0.9, 0.6, 1.9));
    bake(hip);
    bake(knee);
    return [hip, knee];
  });
  bake(hips);
  bake(torso);
  bake(head);
  // (La panza rebota: va aparte, sin juntar.)
  if (belly) torso.add(belly);
  return { root, hips, torso, head, arms, legs, belly };
}

/** El enmascarado: máscara roja con telaraña y ojos blancos grandes, guantes y botas, y una sunga. */
function spiderGuy() {
  const web = webTexture('#c8102e');
  const red = makePSXMaterial({ map: web });
  const blue = makePSXMaterial({ color: '#1f3d99' });
  const white = makePSXMaterial({ color: DR.crema, lit: false });
  const black = makePSXMaterial({ color: '#0a0a0e' });
  return buildDancer({
    skin: makePSXMaterial({ color: '#e9b796' }),
    under: red,
    hands: red,
    shins: red,
    feet: blue,
    head(g) {
      g.add(ball(0.14, red, 0, 0.17, 0, 0.95, 1.2, 1.02));
      // Los ojos: blancos, grandes y achinados hacia afuera, con su borde negro, pegados a la máscara.
      for (const s of [1, -1]) {
        const eye = new THREE.Group();
        eye.position.set(s * 0.058, 0.2, 0.128);
        eye.rotation.set(0, s * 0.42, s * 0.45);
        const rim = new THREE.Mesh(new THREE.CircleGeometry(0.056, 10), black);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.046, 10), white);
        rim.scale.y = lens.scale.y = 0.62;
        lens.position.z = 0.003;
        eye.add(rim, lens);
        g.add(eye);
      }
    },
  });
}

/** El pelado amarillo: panzón, en calzones blancos y medias, con dos pelos, ojos saltones y la barba de dos días. */
function yellowGuy() {
  // (Con la luz violeta del boliche el amarillo se ponía marrón: se lo pasa de vueltas para que llegue amarillo.)
  const yellow = makePSXMaterial({ color: new THREE.Color(1.75, 1.45, 0.12) });
  const white = makePSXMaterial({ color: new THREE.Color(1.55, 1.55, 1.5) });
  const eyeWhite = makePSXMaterial({ color: '#ffffff', lit: false });
  const black = makePSXMaterial({ color: '#0a0a0e' });
  const stubble = makePSXMaterial({ color: new THREE.Color(1.15, 0.85, 0.45) });
  return buildDancer({
    skin: yellow,
    under: white,
    feet: white,
    belly: true,
    head(g) {
      // La cabeza es una lata con la tapa redonda.
      g.add(cyl(0.135, 0.13, 0.24, yellow, 0, 0.14, 0, 0.95));
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.135, SEG, 4, 0, TAU, 0, Math.PI / 2), yellow);
      dome.position.y = 0.26;
      dome.scale.z = 0.95;
      g.add(dome);
      // Dos pelos arriba (dos arquitos) y el zigzag del costado.
      for (const [x, z] of [[-0.025, 0.01], [0.025, -0.03]]) {
        const hair = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, 3, 6, Math.PI), black);
        hair.position.set(x, 0.385, z);
        hair.rotation.y = 0.3;
        g.add(hair);
      }
      for (const s of [1, -1]) for (const k of [0, 1, 2]) g.add(box(0.01, 0.035, 0.022, black, s * 0.132, 0.22 + (k % 2) * 0.02, -0.07 + k * 0.022));
      // Ojos saltones con el punto negro, la nariz larga, la barba y las orejas.
      for (const s of [1, -1]) g.add(ball(0.052, eyeWhite, s * 0.055, 0.21, 0.115), ball(0.012, black, s * 0.055, 0.21, 0.166));
      const nose = cyl(0.024, 0.026, 0.09, yellow, 0, 0.15, 0.16);
      nose.rotation.x = Math.PI / 2;
      g.add(nose, ball(0.1, stubble, 0, 0.06, 0.065, 1.15, 0.78, 0.9));
      for (const s of [1, -1]) g.add(ball(0.035, yellow, s * 0.135, 0.15, -0.01, 0.5, 1, 0.8));
    },
  });
}

export function buildSotano(): Sotano {
  const group = new THREE.Group();
  const updaters: ((beats: number, energy: number, t: number, dt: number) => void)[] = [];
  const { x0, x1, z0, z1, y, ceil, poles } = SOTANO;
  const w = x1 - x0, d = z1 - z0, h = ceil - y, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

  // --- El cuarto: ladrillo bordó, piso de damero rojo y techo bajo ----------------------------
  const brick = makeWallTexture('#3a1420', '#14060c');
  brick.wrapS = brick.wrapT = THREE.RepeatWrapping;
  const wallMat = makePSXMaterial({ map: brick });
  const put = (m: THREE.Mesh, x: number, yy: number, z: number, ry: number, rx = 0) => {
    m.position.set(x, yy, z);
    m.rotation.set(rx, ry, 0);
    group.add(m);
  };
  const floorTex = makeCheckerTexture('#4a0f1e', '#12060a', 2, 8);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  put(plane(w, d, makePSXMaterial({ map: floorTex }), 1.2), cx, y + 0.005, cz, 0, -Math.PI / 2);
  put(plane(w, d, makePSXMaterial({ map: brick, color: '#8a7090' })), cx, ceil, cz, 0, Math.PI / 2);
  put(plane(w, h, wallMat), cx, y + h / 2, z0, 0);
  put(plane(w, h, wallMat), cx, y + h / 2, z1, Math.PI);
  put(plane(d, h, wallMat), x1, y + h / 2, cz, -Math.PI / 2);
  // La de la izquierda, con el hueco de la escalera.
  put(plane(ESCALERA.z0 - z0, h, wallMat), x0, y + h / 2, (z0 + ESCALERA.z0) / 2, Math.PI / 2);
  put(plane(z1 - ESCALERA.z1, h, wallMat), x0, y + h / 2, (z1 + ESCALERA.z1) / 2, Math.PI / 2);

  // --- La escalera: un túnel que baja derecho desde el pasillo, con leds rojos en los escalones ---
  const sx0 = ESCALERA.x0, sx1 = ESCALERA.x1, sz = (ESCALERA.z0 + ESCALERA.z1) / 2, sw = ESCALERA.z1 - ESCALERA.z0;
  const run = sx1 - sx0, rise = PALCO.h - y, top = PASILLO.ceil;
  put(plane(run, top - y, wallMat), (sx0 + sx1) / 2, (top + y) / 2, ESCALERA.z0, 0);
  put(plane(run, top - y, wallMat), (sx0 + sx1) / 2, (top + y) / 2, ESCALERA.z1, Math.PI);
  put(plane(run, sw, makePSXMaterial({ map: brick, color: '#8a7090' })), (sx0 + sx1) / 2, top, sz, 0, Math.PI / 2);
  // (Arriba del techo del sótano, el túnel termina en una pared.)
  put(plane(sw, top - ceil, wallMat), sx1, (top + ceil) / 2, sz, -Math.PI / 2);
  const wedge = new THREE.BoxGeometry(run, rise, sw);
  const pos = wedge.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0 && pos.getX(i) > 0) pos.setY(i, -rise / 2 + 0.02);
  const dark = makePSXMaterial({ color: '#1c0a12' });
  const stair = new THREE.Mesh(wedge, dark);
  stair.position.set((sx0 + sx1) / 2, y + rise / 2, sz);
  group.add(stair);
  const STEPS = 14;
  const stepLed = makePSXMaterial({ color: DR.rojo, lit: false });
  for (let k = 1; k < STEPS; k++) {
    const u = k / STEPS;
    group.add(box(run / 40, 0.03, sw - 0.1, stepLed, sx0 + run * u, PALCO.h - rise * u + 0.015, sz));
  }
  // El cartel, colgado a la entrada del túnel, mirando al pasillo.
  const entry = neon('SOTANO', DR.rojo, 1.5, 0.42);
  entry.position.set(sx0 + 0.15, top - 0.45, sz);
  entry.rotation.y = -Math.PI / 2;
  group.add(entry);

  // --- Los caños, sus tarimas y una lámpara roja arriba de cada uno ------------------------------
  const chrome = makePSXMaterial({ color: '#d8dce8' });
  const stage = makePSXMaterial({ color: '#1a0c14' });
  const rim = makePSXMaterial({ color: DR.rosa, lit: false });
  const lamp = makePSXMaterial({ color: DR.rojo, lit: false });
  for (const [px, pz] of poles) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, h, 8), chrome);
    pole.position.set(px, y + h / 2, pz);
    const tarima = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.12, 10), stage);
    tarima.position.set(px, y + 0.06, pz);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.03, 10), rim);
    ring.position.set(px, y + 0.03, pz);
    group.add(pole, tarima, ring, box(0.5, 0.12, 0.5, dark, px, ceil - 0.06, pz), box(0.36, 0.04, 0.36, lamp, px, ceil - 0.13, pz));
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 1.1, h - 0.2, 8, 1, true).translate(0, -(h - 0.2) / 2, 0), glow(DR.rojo, 0.08));
    cone.position.set(px, ceil - 0.15, pz);
    cone.renderOrder = 2;
    group.add(cone);
  }
  // Luz roja que late con el bombo en las lámparas y el borde de las tarimas.
  updaters.push((beats, energy) => {
    const kick = Math.max(0, 1 - (beats - Math.floor(beats)) * 2.5) * Math.min(1, energy + 0.3);
    lamp.uniforms.uColor.value.set(DR.rojo).multiplyScalar(0.55 + 0.45 * kick);
    rim.uniforms.uColor.value.set(Math.floor(beats / 4) % 2 ? DR.rosa : DR.rojo).multiplyScalar(0.5 + 0.5 * kick);
    stepLed.uniforms.uColor.value.set(DR.rojo).multiplyScalar(0.35 + 0.65 * kick);
  });
  // Cartel adentro, en la pared del fondo, y un par de parlantes en las esquinas.
  const inside = neon('SOTANO', DR.rosa, 2.6, 0.7);
  inside.position.set(cx, y + 2.35, z0 + 0.04);
  group.add(inside);
  const cab = makePSXMaterial({ color: '#16161c' });
  for (const sx of [x0 + 0.8, x1 - 0.8]) group.add(box(0.9, 1.4, 0.7, cab, sx, y + 0.7, z0 + 0.5));

  // --- Los dos bailarines ----------------------------------------------------------------------
  const dancers = [spiderGuy(), yellowGuy()].map((rig, i) => {
    group.add(rig.root);
    return { rig, pole: poles[i], angle: i * 2.1, phase: i * 3, style: i };
  });
  updaters.push((beats, energy, t, dt) => {
    for (const dc of dancers) {
      const { rig, pole, style } = dc;
      const e = 0.4 + 0.6 * Math.min(1, energy);
      // Cada ocho beats, un giro: se cuelga del caño, sube las piernas y da vueltas más rápido.
      const cyc = (((beats + dc.phase) % 8) + 8) % 8 / 8;
      const spin = cyc > 0.7 ? Math.sin(((cyc - 0.7) / 0.3) * Math.PI) : 0;
      // (El pelado gira más despacio y se cuelga menos: le pesa la panza.)
      const heavy = style === 1 ? 0.6 : 1;
      dc.angle += dt * (0.55 + 2.6 * spin * heavy) * e;
      const r = 0.42 - 0.12 * spin;
      rig.root.position.set(pole[0] + Math.sin(dc.angle) * r, y + 0.12 + 0.32 * spin * heavy, pole[1] + Math.cos(dc.angle) * r);
      // El caño queda a su izquierda (+x): mira para donde camina, y se tira para afuera.
      rig.root.rotation.set(0, dc.angle + Math.PI / 2, 0.16 + 0.18 * spin);
      const sway = Math.sin(beats * Math.PI);
      rig.hips.position.x = 0.05 * sway;
      rig.hips.rotation.y = 0.28 * sway;
      // El pelado, además, mueve la cola para atrás y para adelante, y la panza le rebota.
      rig.hips.rotation.x = style === 1 ? 0.22 * Math.max(0, Math.sin(beats * TAU)) : 0;
      if (rig.belly) rig.belly.scale.set(1 + 0.05 * Math.abs(sway), 1 - 0.06 * Math.abs(Math.sin(beats * TAU)), 1);
      rig.torso.rotation.set(-0.12 - 0.15 * spin, 0, -0.1 * sway);
      rig.head.rotation.set(0.1 * Math.sin(beats * TAU), 0.35 * Math.sin(t * 0.7 + style), 0);
      // La izquierda agarra el caño, arriba; la derecha baila (o se rasca la panza).
      const [[shL, elL], [shR, elR]] = rig.arms;
      shL.rotation.set(0, 0, 2.55 - 0.15 * spin);
      elL.rotation.set(0.15, 0, 0);
      if (style === 1 && !spin) {
        shR.rotation.set(-0.6, 0, -0.15);
        elR.rotation.set(-1.4 + 0.25 * Math.sin(t * 9), 0, 0);
      } else {
        shR.rotation.set(-0.4 * Math.sin(beats * Math.PI), 0, -(0.9 + 0.6 * Math.sin((beats * Math.PI) / 2) + 0.8 * spin));
        elR.rotation.set(-0.6, 0, 0);
      }
      // Piernas: caminando alrededor del caño, o recogidas en el giro.
      const step = dc.angle * 5;
      rig.legs.forEach(([hip, knee], k) => {
        const s = Math.sin(step + k * Math.PI);
        hip.rotation.set((0.4 * s) * (1 - spin) - 1.3 * spin, 0, 0);
        knee.rotation.set(0.5 * Math.max(0, -s) * (1 - spin) + 1.7 * spin, 0, 0);
      });
    }
  });

  bake(group, [stair]);
  let last = 0;
  return {
    group,
    update(beats, energy, t) {
      const dt = Math.min(0.1, Math.max(0, t - last));
      last = t;
      for (const u of updaters) u(beats, energy, t, dt);
    },
  };
}
