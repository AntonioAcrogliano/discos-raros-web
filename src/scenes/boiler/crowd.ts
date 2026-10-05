import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LOOK, type Look, type Raro } from '../../../shared/look';
import { makeFaceTexture, makePSXMaterial } from '../../style-kit';

/**
 * La pista: hasta MAX personajes dibujados con instancing (una malla instanciada por parte del
 * cuerpo, peinado y accesorio), así 150 bailarines son ~15 draw calls. Las poses se calculan
 * en CPU cada frame: son un par de miles de matrices, no pesa nada.
 */

export const MAX_DANCERS = 150;

const TAU = Math.PI * 2;
// Medidas del cuerpo base (metros). El "cuerpo" elegido lo escala a lo ancho y a lo alto.
const LEG_H = 0.8, TORSO_H = 0.56, ARM_H = 0.6, NECK_Y = LEG_H + TORSO_H + 0.02, SHOULDER_Y = LEG_H + TORSO_H - 0.04;
/** [ancho, alto] por cada opción de LOOK.cuerpo. */
const BODY_SCALE: [number, number][] = [[1, 1], [0.8, 1.04], [1.35, 1.02], [1.05, 0.8], [0.9, 1.18]];
const ACC_COLOR = ['', '#ff004a', '#0f1217', '#0f1217', '#ff004a', '#ffe600', '#b08a5a'];

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

// Peinados y accesorios, relativos a la base del cuello (la cabeza va de y=0.02 a y=0.30).
const HAIR_GEOS: (THREE.BufferGeometry | null)[] = [
  at(new THREE.BoxGeometry(0.28, 0.1, 0.28), 0, 0.29, -0.01),
  merge(at(new THREE.BoxGeometry(0.29, 0.1, 0.28), 0, 0.29, -0.01), at(new THREE.BoxGeometry(0.29, 0.36, 0.07), 0, 0.14, -0.14)),
  at(new THREE.BoxGeometry(0.06, 0.16, 0.3), 0, 0.37, 0),
  at(new THREE.IcosahedronGeometry(0.21, 0), 0, 0.3, -0.02),
  null,
];
const ACC_GEOS: (THREE.BufferGeometry | null)[] = [
  null,
  merge(at(new THREE.BoxGeometry(0.3, 0.12, 0.3), 0, 0.33, 0), at(new THREE.BoxGeometry(0.26, 0.03, 0.16), 0, 0.285, 0.21)),
  merge(at(new THREE.BoxGeometry(0.3, 0.13, 0.3), 0, 0.34, 0), at(new THREE.BoxGeometry(0.46, 0.03, 0.46), 0, 0.28, 0)),
  at(new THREE.BoxGeometry(0.28, 0.06, 0.04), 0, 0.2, 0.125),
  merge(at(new THREE.ConeGeometry(0.04, 0.16, 4), 0.09, 0.38, 0), at(new THREE.ConeGeometry(0.04, 0.16, 4), -0.09, 0.38, 0)),
  at(new THREE.TorusGeometry(0.12, 0.022, 4, 8).rotateX(Math.PI / 2), 0, 0.5, 0),
  at(faceBox(0.38, 0.36, 0.38), 0, 0.17, 0),
];
const CAJA = 6;

interface Dancer {
  x: number;
  z: number;
  yaw: number;
  phase: number;
  look: Look;
  sx: number;
  sy: number;
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
    const z = -0.25 - row * 0.6;
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
  private legs: THREE.InstancedMesh;
  private torso: THREE.InstancedMesh;
  private arms: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private hair: (THREE.InstancedMesh | null)[];
  private acc: (THREE.InstancedMesh | null)[];

  constructor(readonly capacity = MAX_DANCERS) {
    const plain = makePSXMaterial();
    const face = makePSXMaterial({ map: makeFaceTexture() });
    const mesh = (geo: THREE.BufferGeometry, n: number, mat: THREE.Material = plain) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      // Crear ya el atributo de color: el shader se compila con color por instancia.
      m.setColorAt(0, new THREE.Color(1, 1, 1));
      this.group.add(m);
      return m;
    };
    this.legs = mesh(hang(0.14, LEG_H, 0.16), capacity * 2);
    this.torso = mesh(at(new THREE.BoxGeometry(0.42, TORSO_H, 0.22), 0, LEG_H + TORSO_H / 2, 0), capacity);
    this.arms = mesh(hang(0.1, ARM_H, 0.1), capacity * 2);
    this.heads = mesh(at(faceBox(0.26, 0.28, 0.26), 0, 0.16, 0), capacity, face);
    this.hair = HAIR_GEOS.map((g) => (g ? mesh(g, capacity) : null));
    this.acc = ACC_GEOS.map((g, i) => (g ? mesh(g, capacity, i === CAJA ? face : plain) : null));
  }

  get count() {
    return this.dancers.length;
  }

  /** Quiénes bailan. El primero de la lista va al mejor lugar (ahí va el del visitante). */
  setDancers(list: Raro[]) {
    let seed = 99;
    const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    this.dancers = list.slice(0, Math.min(this.capacity, this.slots.length)).map((raro, i) => {
      const [sx, sy] = BODY_SCALE[raro.look.cuerpo] ?? [1, 1];
      const v = 0.94 + r() * 0.12;
      return { ...this.slots[i], yaw: (r() - 0.5) * 0.5, phase: r() * 10, look: raro.look, sx: sx * v, sy: sy * v, name: raro.name, headY: 1.7 };
    });
    this.paint();
  }

  /** Cambia el look de un bailarín sin rearmar la pista (vista previa del creador). */
  setLook(i: number, look: Look, name?: string) {
    const d = this.dancers[i];
    if (!d) return;
    const v = d.sx / (BODY_SCALE[d.look.cuerpo]?.[0] ?? 1);
    d.look = look;
    [d.sx, d.sy] = (BODY_SCALE[look.cuerpo] ?? [1, 1]).map((s) => s * v);
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
    const hairN = this.hair.map(() => 0);
    const accN = this.acc.map(() => 0);
    list.forEach((d, i) => {
      const l = d.look;
      c.set(LOOK.pantalon[l.pantalon]);
      this.legs.setColorAt(i * 2, c);
      this.legs.setColorAt(i * 2 + 1, c);
      this.torso.setColorAt(i, c.set(LOOK.remera[l.remera]));
      c.set(LOOK.piel[l.piel]);
      this.arms.setColorAt(i * 2, c);
      this.arms.setColorAt(i * 2 + 1, c);
      this.heads.setColorAt(i, c);
      // Con la caja puesta no se ve el pelo.
      const hair = l.accesorio === CAJA ? null : this.hair[l.pelo];
      if (hair) hair.setColorAt(hairN[l.pelo]++, c.set(LOOK.peloColor[l.peloColor]));
      const acc = this.acc[l.accesorio];
      if (acc) acc.setColorAt(accN[l.accesorio]++, c.set(ACC_COLOR[l.accesorio]));
    });
    this.legs.count = this.arms.count = n * 2;
    this.torso.count = this.heads.count = n;
    this.hair.forEach((m, i) => m && (m.count = hairN[i]));
    this.acc.forEach((m, i) => m && (m.count = accN[i]));
    for (const m of this.group.children as THREE.InstancedMesh[]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  // Temporales para no generar basura en cada frame.
  private root = new THREE.Matrix4();
  private local = new THREE.Matrix4();
  private out = new THREE.Matrix4();
  private euler = new THREE.Euler();
  private pos = new THREE.Vector3();
  private quat = new THREE.Quaternion();
  private scale = new THREE.Vector3();

  private part(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, rx: number, ry: number, rz: number) {
    this.local.makeRotationFromEuler(this.euler.set(rx, ry, rz));
    this.local.setPosition(x, y, z);
    mesh.setMatrixAt(i, this.out.multiplyMatrices(this.root, this.local));
  }

  /**
   * @param beats tiempo de baile en beats (avanza solo mientras suena la música)
   * @param energy 0 = parados meciéndose, 1 = bailando a full
   * @param t tiempo en segundos (para el vaivén cuando no hay música)
   */
  update(beats: number, energy: number, t: number) {
    const hairN = this.hair.map(() => 0);
    const accN = this.acc.map(() => 0);
    const e = energy;
    this.shown().forEach((d, i) => {
      const f = beats + d.phase * 0.012;
      const s = Math.sin(Math.PI * f);
      const hop01 = Math.abs(s);
      const w = Math.sin(TAU * f);
      const idle = Math.sin(t * 0.9 + d.phase);
      let hop = 0, yaw = d.yaw + idle * 0.08 * (1 - e), lean = 0, headRx = 0;
      let aLx = 0, aLz = 0.12, aRx = 0, aRz = -0.12, legSwing = 0;
      switch (d.look.baile) {
        case 1: // manos arriba
          hop = hop01 * 0.07;
          aLz = 0.12 + (2.6 + 0.25 * w) * e;
          aRz = -0.12 - (2.6 + 0.25 * w) * e;
          headRx = -0.15 * e;
          break;
        case 2: // puño
          hop = hop01 * 0.1;
          aRz = -0.12 - (2.3 + 0.5 * hop01) * e;
          aLx = 0.3 * s * e;
          headRx = 0.2 * hop01 * e;
          break;
        case 3: { // robot: poses duras que cambian con cada beat
          const step = ((Math.floor(f) % 4) + 4) % 4;
          const k = Math.min(1, (f - Math.floor(f)) * 6);
          const P = [[-1.5, 0.1, 0, -0.1], [0, 1.5, -1.5, -0.1], [0, 0.1, -1.5, -0.1], [-1.5, 1.5, 0, -1.5]];
          const a = P[(step + 3) % 4], b = P[step];
          aLx = (a[0] + (b[0] - a[0]) * k) * e;
          aLz = 0.12 + (a[1] + (b[1] - a[1]) * k) * e;
          aRx = (a[2] + (b[2] - a[2]) * k) * e;
          aRz = -0.12 + (a[3] + (b[3] - a[3]) * k) * e;
          yaw += [0.35, 0, -0.35, 0][step] * e;
          break;
        }
        case 4: // cabeceo
          hop = hop01 * 0.03;
          headRx = 0.55 * Math.max(0, w) * e;
          lean = 0.12 * e;
          aLx = aRx = -0.25 * e;
          break;
        default: // saltito
          hop = hop01 * 0.14;
          aLx = 0.55 * s * e;
          aRx = -0.55 * s * e;
          legSwing = 0.3 * s * e;
          headRx = 0.1 * w * e;
      }
      hop *= e;
      this.root.compose(this.pos.set(d.x, hop, d.z), this.quat.setFromEuler(this.euler.set(lean, yaw, 0)), this.scale.set(d.sx, d.sy, d.sx));
      this.part(this.legs, i * 2, 0.09, LEG_H, 0, legSwing, 0, 0);
      this.part(this.legs, i * 2 + 1, -0.09, LEG_H, 0, -legSwing, 0, 0);
      this.torso.setMatrixAt(i, this.root);
      this.part(this.arms, i * 2, 0.265, SHOULDER_Y, 0, aLx, 0, aLz);
      this.part(this.arms, i * 2 + 1, -0.265, SHOULDER_Y, 0, aRx, 0, aRz);
      this.part(this.heads, i, 0, NECK_Y, 0, headRx, 0, 0);
      const hair = d.look.accesorio === CAJA ? null : this.hair[d.look.pelo];
      if (hair) hair.setMatrixAt(hairN[d.look.pelo]++, this.out);
      const acc = this.acc[d.look.accesorio];
      if (acc) acc.setMatrixAt(accN[d.look.accesorio]++, this.out);
      d.headY = hop + (NECK_Y + 0.3) * d.sy;
    });
    for (const m of this.group.children as THREE.InstancedMesh[]) m.instanceMatrix.needsUpdate = true;
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
