import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LOOK, type Look, type Raro } from '../../../shared/look';
import { makeFaceTexture, makePSXMaterial, makePrintTexture } from '../../style-kit';

/**
 * La pista: hasta MAX personajes dibujados con instancing (una malla instanciada por parte del
 * cuerpo, cara, peinado, estampa y accesorio), así 150 bailarines son unos 30 draw calls.
 * Las poses se calculan en CPU cada frame: son un par de miles de matrices, no pesa nada.
 *
 * Cada tipo de cuerpo cambia las medidas de las partes (ancho del torso, grosor de brazos y
 * piernas, tamaño de la cabeza) y la altura total. Nunca se estira el personaje entero de
 * forma despareja: eso deforma los brazos al girarlos y achata la cabeza.
 */

export const MAX_DANCERS = 150;

const TAU = Math.PI * 2;
// Medidas del cuerpo base (metros).
const THIGH = 0.42, SHIN = 0.34, SHOE = 0.07, HIP_Y = THIGH + SHIN + SHOE;
const TORSO = 0.54, SHOULDER_Y = HIP_Y + TORSO - 0.06, NECK_Y = HIP_Y + TORSO;
const UPPER = 0.3, FORE = 0.26;

/** Medidas por cada opción de LOOK.cuerpo. */
interface Build {
  /** Altura total (escala pareja de todo el personaje). */
  h: number;
  /** Ancho y fondo del torso. */
  w: number;
  d: number;
  /** Grosor de brazos y piernas. */
  limb: number;
  /** Tamaño de la cabeza. */
  head: number;
}
const BUILDS: Build[] = [
  { h: 1, w: 1, d: 1, limb: 1, head: 1 },
  { h: 1.03, w: 0.76, d: 0.8, limb: 0.74, head: 0.94 },
  { h: 1.05, w: 1.42, d: 1.55, limb: 1.32, head: 1.04 },
  { h: 0.8, w: 1.08, d: 1.1, limb: 1.1, head: 1.18 },
  { h: 1.2, w: 0.88, d: 0.9, limb: 0.84, head: 0.9 },
];
const ACC_COLOR = ['', '#ff004a', '#0f1217', '#0f1217', '#ff004a', '#ffe600', '#b08a5a'];
const CAJA = 6;

const hang = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d).translate(0, -h / 2, 0);
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
const merge = (...g: THREE.BufferGeometry[]) => mergeGeometries(g.map((x) => (x.index ? x.toNonIndexed() : x)))!;

/** Caja con la textura solo en la cara de adelante (+z); las otras caras muestrean un píxel liso. */
function faceBox(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) if (Math.floor(i / 4) !== 4) uv.setXY(i, 0.03, 0.97);
  return g;
}

// Peinados y accesorios, relativos a la base del cuello. La cabeza es una caja que va de
// y=0.02 a y=0.30, con x y z entre -0.13 y 0.13; la cara mira a +z.
// Todo pelo sobresale 1 cm de la cabeza (nunca queda al ras: parpadea) y deja la cara libre.
const bx = (w: number, h: number, d: number, x: number, y: number, z: number) => at(new THREE.BoxGeometry(w, h, d), x, y, z);
/** Casco de pelo: tapa de arriba, nuca y patillas. `back` es hasta dónde baja atrás. */
const helmet = (back = 0.1, sides = 0.15) =>
  merge(
    bx(0.28, 0.07, 0.28, 0, 0.305, 0),
    bx(0.28, 0.3 - back, 0.03, 0, (0.3 + back) / 2, -0.133),
    bx(0.03, 0.29 - sides, 0.2, 0.132, (0.29 + sides) / 2, -0.03),
    bx(0.03, 0.29 - sides, 0.2, -0.132, (0.29 + sides) / 2, -0.03),
  );
/** Rulos sin la parte de arriba (lo que asoma por debajo de un gorro). */
const curlsSides = () => [bx(0.07, 0.17, 0.26, 0.17, 0.2, -0.03), bx(0.07, 0.17, 0.26, -0.17, 0.2, -0.03), bx(0.36, 0.26, 0.08, 0, 0.19, -0.17)];
const HAIR_GEOS: (THREE.BufferGeometry | null)[] = [
  // CORTO
  helmet(),
  // LARGO: la nuca y los costados bajan hasta los hombros.
  helmet(0, 0.05),
  // CRESTA
  bx(0.06, 0.15, 0.3, 0, 0.375, 0),
  // RULOS: un bloque arriba (deja la frente y los ojos a la vista) y los costados inflados.
  merge(bx(0.36, 0.2, 0.34, 0, 0.34, -0.02), ...curlsSides()),
  // PELADO
  null,
  // FLEQUILLO
  merge(helmet(), bx(0.28, 0.06, 0.03, 0, 0.25, 0.145)),
  // COLITA: gomita y cola atrás.
  merge(helmet(), bx(0.07, 0.07, 0.07, 0, 0.26, -0.19), bx(0.08, 0.2, 0.07, 0, 0.14, -0.21)),
  // (interno) RULOS con gorro puesto
  merge(...curlsSides()),
];
const RULOS = 3, CRESTA = 2, RULOS_CON_GORRO = 7;

/** Qué malla de pelo le toca (o -1 si no se ve): el gorro y la caja tapan lo de arriba. */
function hairIndex(l: Look): number {
  if (l.accesorio === CAJA) return -1;
  const hat = l.accesorio === 1 || l.accesorio === 2;
  if (hat && l.pelo === CRESTA) return -1;
  if (hat && l.pelo === RULOS) return RULOS_CON_GORRO;
  return l.pelo;
}

const ACC_GEOS: (THREE.BufferGeometry | null)[] = [
  null,
  merge(at(new THREE.BoxGeometry(0.3, 0.12, 0.3), 0, 0.33, 0), at(new THREE.BoxGeometry(0.26, 0.03, 0.16), 0, 0.285, 0.21)),
  merge(at(new THREE.BoxGeometry(0.3, 0.13, 0.3), 0, 0.34, 0), at(new THREE.BoxGeometry(0.46, 0.03, 0.46), 0, 0.28, 0)),
  at(new THREE.BoxGeometry(0.28, 0.06, 0.04), 0, 0.2, 0.125),
  merge(at(new THREE.ConeGeometry(0.04, 0.16, 4), 0.09, 0.38, 0), at(new THREE.ConeGeometry(0.04, 0.16, 4), -0.09, 0.38, 0)),
  at(new THREE.TorusGeometry(0.12, 0.022, 4, 8).rotateX(Math.PI / 2), 0, 0.5, 0),
  at(faceBox(0.38, 0.36, 0.38), 0, 0.17, 0),
];

interface Dancer {
  x: number;
  z: number;
  yaw: number;
  phase: number;
  look: Look;
  /** Variación de altura propia (para que dos iguales no queden clavados a la misma altura). */
  vary: number;
  name: string;
  /** Altura de la cabeza en el último frame (para los cartelitos). */
  headY: number;
}

/** Lugares de la pista, del más visible (centro, adelante) al menos. */
function makeSlots(): { x: number; z: number }[] {
  let seed = 11;
  const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const slots: { x: number; z: number; score: number }[] = [];
  for (let row = 0; row < 8; row++) {
    const z = -0.55 - row * 0.58;
    for (let x = -5.61 + (row % 2) * 0.33; x <= 5.7; x += 0.66) {
      const first = row === 0 && Math.abs(x) < 0.34;
      slots.push({ x: first ? 0 : x + (r() - 0.5) * 0.18, z: first ? z : z + (r() - 0.5) * 0.16, score: Math.abs(x) * 0.55 + row * 0.62 });
    }
  }
  // A los costados de la cabina.
  for (const z of [1.25, 1.95, 2.65]) {
    for (let i = 0; i < 3; i++) {
      for (const side of [1, -1]) slots.push({ x: side * (4.5 + i * 0.66 + (r() - 0.5) * 0.15), z: z + (r() - 0.5) * 0.15, score: 3 + i * 0.6 + z * 0.3 });
    }
  }
  return slots.sort((a, b) => a.score - b.score);
}

export class Crowd {
  readonly group = new THREE.Group();
  private slots = makeSlots();
  private dancers: Dancer[] = [];
  private solo = false;
  private thighs: THREE.InstancedMesh;
  private shins: THREE.InstancedMesh;
  private shoes: THREE.InstancedMesh;
  private upperArms: THREE.InstancedMesh;
  private foreArms: THREE.InstancedMesh;
  private hands: THREE.InstancedMesh;
  /** Una malla por estampa de remera, por cara, por peinado y por accesorio. */
  private torsos: THREE.InstancedMesh[];
  private heads: THREE.InstancedMesh[];
  private hair: (THREE.InstancedMesh | null)[];
  private acc: (THREE.InstancedMesh | null)[];
  private all: THREE.InstancedMesh[] = [];

  constructor(readonly capacity = MAX_DANCERS) {
    const plain = makePSXMaterial();
    const mesh = (geo: THREE.BufferGeometry, n: number, mat: THREE.Material = plain) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      // Crear ya el atributo de color: el shader se compila con color por instancia.
      m.setColorAt(0, new THREE.Color(1, 1, 1));
      this.group.add(m);
      this.all.push(m);
      return m;
    };
    this.thighs = mesh(hang(0.15, THIGH, 0.17), capacity * 2);
    this.shins = mesh(hang(0.125, SHIN, 0.14), capacity * 2);
    // La zapatilla y la mano van pegadas a la canilla y al antebrazo: usan su misma matriz.
    this.shoes = mesh(at(new THREE.BoxGeometry(0.14, SHOE, 0.25), 0, -SHIN - SHOE / 2, 0.045), capacity * 2);
    this.upperArms = mesh(hang(0.11, UPPER, 0.11), capacity * 2);
    this.foreArms = mesh(hang(0.09, FORE, 0.09), capacity * 2);
    this.hands = mesh(at(new THREE.BoxGeometry(0.095, 0.095, 0.1), 0, -FORE - 0.045, 0), capacity * 2);
    const torsoGeo = () => at(faceBox(0.4, TORSO, 0.22), 0, HIP_Y + TORSO / 2, 0);
    this.torsos = LOOK.estampa.map((_, i) => mesh(torsoGeo(), capacity, i ? makePSXMaterial({ map: makePrintTexture(i - 1), decal: true }) : plain));
    const headGeo = () => at(faceBox(0.26, 0.28, 0.26), 0, 0.16, 0);
    const faces = LOOK.cara.map((_, i) => makePSXMaterial({ map: makeFaceTexture(i) }));
    this.heads = faces.map((mat) => mesh(headGeo(), capacity, mat));
    this.hair = HAIR_GEOS.map((g) => (g ? mesh(g, capacity) : null));
    this.acc = ACC_GEOS.map((g, i) => (g ? mesh(g, capacity, i === CAJA ? faces[3] : plain) : null));
  }

  get count() {
    return this.dancers.length;
  }

  /** Quiénes bailan. El primero de la lista va al mejor lugar (ahí va el del visitante). */
  setDancers(list: Raro[]) {
    let seed = 99;
    const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    this.dancers = list.slice(0, Math.min(this.capacity, this.slots.length)).map((raro, i) => ({
      x: this.slots[i].x,
      z: this.slots[i].z,
      yaw: (r() - 0.5) * 0.5,
      phase: r() * 10,
      look: raro.look,
      vary: 0.96 + r() * 0.08,
      name: raro.name,
      headY: 1.7,
    }));
    this.paint();
  }

  /** Cambia el look de un bailarín sin rearmar la pista (vista previa del creador). */
  setLook(i: number, look: Look, name?: string) {
    const d = this.dancers[i];
    if (!d) return;
    d.look = look;
    if (name !== undefined) d.name = name;
    this.paint();
  }

  /** Mostrar solo al primero (mientras se arma el personaje, para verlo sin gente alrededor). */
  setSolo(solo: boolean) {
    this.solo = solo;
    this.paint();
  }

  private shown() {
    return this.solo ? this.dancers.slice(0, 1) : this.dancers;
  }

  /** Colores y cantidades por malla (cuando cambia quién baila o cómo se ve). */
  private paint() {
    const list = this.shown();
    const n = list.length;
    const c = new THREE.Color();
    const pair = (m: THREE.InstancedMesh, i: number, hex: string) => {
      c.set(hex);
      m.setColorAt(i * 2, c);
      m.setColorAt(i * 2 + 1, c);
    };
    const torsoN = this.torsos.map(() => 0), headN = this.heads.map(() => 0);
    const hairN = this.hair.map(() => 0), accN = this.acc.map(() => 0);
    list.forEach((d, i) => {
      const l = d.look;
      const skin = LOOK.piel[l.piel], shirt = LOOK.remera[l.remera], pants = LOOK.pantalon[l.pantalon];
      pair(this.thighs, i, pants);
      // Con short se ve la pierna; con musculosa, el brazo entero; con buzo, manga larga.
      pair(this.shins, i, l.abajo === 1 ? skin : pants);
      pair(this.shoes, i, LOOK.zapas[l.zapas]);
      pair(this.upperArms, i, l.arriba === 1 ? skin : shirt);
      pair(this.foreArms, i, l.arriba === 2 ? shirt : skin);
      pair(this.hands, i, skin);
      this.torsos[l.estampa].setColorAt(torsoN[l.estampa]++, c.set(shirt));
      this.heads[l.cara].setColorAt(headN[l.cara]++, c.set(skin));
      const hi = hairIndex(l);
      const hair = hi < 0 ? null : this.hair[hi];
      if (hair) hair.setColorAt(hairN[hi]++, c.set(LOOK.peloColor[l.peloColor]));
      const acc = this.acc[l.accesorio];
      if (acc) acc.setColorAt(accN[l.accesorio]++, c.set(ACC_COLOR[l.accesorio]));
    });
    for (const m of [this.thighs, this.shins, this.shoes, this.upperArms, this.foreArms, this.hands]) m.count = n * 2;
    this.torsos.forEach((m, i) => (m.count = torsoN[i]));
    this.heads.forEach((m, i) => (m.count = headN[i]));
    this.hair.forEach((m, i) => m && (m.count = hairN[i]));
    this.acc.forEach((m, i) => m && (m.count = accN[i]));
    for (const m of this.all) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  // Temporales para no generar basura en cada frame.
  private root = new THREE.Matrix4();
  private joint = new THREE.Matrix4();
  private local = new THREE.Matrix4();
  private out = new THREE.Matrix4();
  private euler = new THREE.Euler();
  private pos = new THREE.Vector3();
  private quat = new THREE.Quaternion();
  private scale = new THREE.Vector3();

  /** joint = parent · traslación · rotación (una articulación, sin escala). */
  private bend(parent: THREE.Matrix4, x: number, y: number, z: number, rx: number, ry: number, rz: number) {
    this.local.makeRotationFromEuler(this.euler.set(rx, ry, rz));
    this.local.setPosition(x, y, z);
    return this.joint.multiplyMatrices(parent, this.local);
  }

  /** Matriz de la articulación actual con el grosor de la parte (la escala va al final: no deforma). */
  private sized(sx: number, sy: number, sz: number) {
    return this.out.copy(this.joint).scale(this.scale.set(sx, sy, sz));
  }

  /** Brazo o pierna: parte de arriba, articulación del medio y parte de abajo (con mano o zapatilla). */
  private limb(upper: THREE.InstancedMesh, lower: THREE.InstancedMesh, tip: THREE.InstancedMesh, i: number, x: number, y: number, len: number, rx: number, rz: number, bendX: number, thick: number) {
    this.bend(this.root, x, y, 0, rx, 0, rz);
    upper.setMatrixAt(i, this.sized(thick, 1, thick));
    this.bend(this.out.copy(this.joint), 0, -len, 0, bendX, 0, 0);
    const m = this.sized(thick, 1, thick);
    lower.setMatrixAt(i, m);
    tip.setMatrixAt(i, m);
  }

  /**
   * @param beats tiempo de baile en beats (avanza solo mientras suena la música)
   * @param energy 0 = parados meciéndose, 1 = bailando a full
   * @param t tiempo en segundos (para el vaivén cuando no hay música)
   */
  update(beats: number, energy: number, t: number) {
    const torsoN = this.torsos.map(() => 0), headN = this.heads.map(() => 0);
    const hairN = this.hair.map(() => 0), accN = this.acc.map(() => 0);
    const e = energy;
    this.shown().forEach((d, i) => {
      const b = BUILDS[d.look.cuerpo] ?? BUILDS[0];
      const f = beats + d.phase * 0.012;
      const s = Math.sin(Math.PI * f);
      const hop01 = Math.abs(s);
      const w = Math.sin(TAU * f);
      const idle = Math.sin(t * 0.9 + d.phase);
      let hop = 0, yaw = d.yaw + idle * 0.08 * (1 - e), lean = 0, headRx = 0;
      // Hombros (x, z), codos, caderas y rodillas.
      let aLx = 0, aLz = 0.1, aRx = 0, aRz = -0.1, eL = -0.15, eR = -0.15;
      let tL = 0, tR = 0, kL = 0, kR = 0;
      switch (d.look.baile) {
        case 1: // manos arriba
          hop = hop01 * 0.07;
          aLz = 0.1 + (2.55 + 0.25 * w) * e;
          aRz = -0.1 - (2.55 + 0.25 * w) * e;
          eL = eR = -0.15 - 0.35 * Math.max(0, w) * e;
          headRx = -0.15 * e;
          kL = kR = (1 - hop01) * 0.3 * e;
          tL = tR = -kL * 0.5;
          break;
        case 2: // puño
          hop = hop01 * 0.1;
          aRz = -0.1 - 2.2 * e;
          eR = -0.2 - 1.1 * (1 - hop01) * e;
          aLx = -0.35 * e;
          eL = -1.3 * e;
          headRx = 0.2 * hop01 * e;
          kL = kR = (1 - hop01) * 0.35 * e;
          tL = tR = -kL * 0.5;
          break;
        case 3: { // robot: poses duras que cambian con cada beat
          const step = ((Math.floor(f) % 4) + 4) % 4;
          const k = Math.min(1, (f - Math.floor(f)) * 6);
          // [hombro izq x, codo izq, hombro der x, codo der]
          const P = [[-1.5, 0, 0, -1.5], [0, -1.5, -1.5, 0], [-1.5, -1.5, 0, 0], [0, 0, -1.5, -1.5]];
          const from = P[(step + 3) % 4], to = P[step];
          const mix = (j: number) => (from[j] + (to[j] - from[j]) * k) * e;
          aLx = mix(0);
          eL = mix(1);
          aRx = mix(2);
          eR = mix(3);
          yaw += [0.35, 0, -0.35, 0][step] * e;
          headRx = step % 2 ? 0.15 * e : 0;
          break;
        }
        case 4: // cabeceo
          hop = hop01 * 0.03;
          headRx = 0.55 * Math.max(0, w) * e;
          lean = 0.12 * e;
          aLx = aRx = -0.3 * e;
          eL = eR = -1.1 * e;
          kL = kR = Math.max(0, w) * 0.4 * e;
          tL = tR = -kL * 0.5;
          break;
        default: // saltito
          hop = hop01 * 0.14;
          aLx = 0.5 * s * e;
          aRx = -0.5 * s * e;
          eL = eR = -0.9 * e;
          tL = 0.3 * s * e;
          tR = -0.3 * s * e;
          kL = Math.max(0, -s) * 0.6 * e;
          kR = Math.max(0, s) * 0.6 * e;
          headRx = 0.1 * w * e;
      }
      hop *= e;
      // En el creador gira despacio para verlo de todos lados.
      if (this.solo) yaw = Math.sin(t * 0.7) * 0.9;
      const h = b.h * d.vary;
      this.root.compose(this.pos.set(d.x, hop, d.z), this.quat.setFromEuler(this.euler.set(lean, yaw, 0)), this.scale.set(h, h, h));

      const hip = 0.1 * b.w, shoulder = 0.2 * b.w + 0.055 * b.limb;
      this.limb(this.thighs, this.shins, this.shoes, i * 2, hip, HIP_Y, THIGH, tL, 0, kL, b.limb);
      this.limb(this.thighs, this.shins, this.shoes, i * 2 + 1, -hip, HIP_Y, THIGH, tR, 0, kR, b.limb);
      this.limb(this.upperArms, this.foreArms, this.hands, i * 2, shoulder, SHOULDER_Y, UPPER, aLx, aLz, eL, b.limb);
      this.limb(this.upperArms, this.foreArms, this.hands, i * 2 + 1, -shoulder, SHOULDER_Y, UPPER, aRx, aRz, eR, b.limb);

      const print = d.look.estampa;
      this.torsos[print].setMatrixAt(torsoN[print]++, this.out.copy(this.root).scale(this.scale.set(b.w, 1, b.d)));

      this.bend(this.root, 0, NECK_Y, 0, headRx, 0, 0);
      const head = this.sized(b.head, b.head, b.head);
      const face = d.look.cara;
      this.heads[face].setMatrixAt(headN[face]++, head);
      const hi = hairIndex(d.look);
      const hair = hi < 0 ? null : this.hair[hi];
      if (hair) hair.setMatrixAt(hairN[hi]++, head);
      const acc = this.acc[d.look.accesorio];
      if (acc) acc.setMatrixAt(accN[d.look.accesorio]++, head);
      d.headY = hop + (NECK_Y + 0.3 * b.head) * h;
    });
    for (const m of this.all) m.instanceMatrix.needsUpdate = true;
  }

  /** Posición de arriba de la cabeza del bailarín `i` (para colgarle el nombre). */
  headTop(i: number, out: THREE.Vector3) {
    const d = this.dancers[i];
    return d ? out.set(d.x, d.headY + (d.look.accesorio ? 0.16 : 0.04), d.z) : null;
  }

  nameOf(i: number) {
    return this.dancers[i]?.name ?? '';
  }
}
