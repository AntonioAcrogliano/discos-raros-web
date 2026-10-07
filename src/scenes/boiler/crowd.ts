import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LOOK, type Look, type Raro } from '../../../shared/look';
import { make3DGlassesTexture, makeFaceTexture, makeHeartGlassesTexture, makePSXMaterial, makePrintTexture } from '../../style-kit';
import { dance, makePose } from './dances';

/**
 * La pista: hasta MAX personajes dibujados con instancing (una malla instanciada por parte del
 * cuerpo y por cada cara, peinado, estampa, prenda y accesorio). Las mallas que nadie usa no se
 * dibujan, así que 150 bailarines son unas decenas de draw calls.
 * Las poses se calculan en CPU cada frame: son un par de miles de matrices, no pesa nada.
 *
 * Cada tipo de cuerpo cambia las medidas de las partes (ancho del torso, grosor de brazos y
 * piernas, tamaño de la cabeza) y la altura total. Nunca se estira el personaje entero de
 * forma despareja: eso deforma los brazos al girarlos y achata la cabeza.
 */

export const MAX_DANCERS = 150;

// Medidas del cuerpo base (metros).
const THIGH = 0.42, SHIN = 0.34, SHOE = 0.07, HIP_Y = THIGH + SHIN + SHOE;
const TORSO = 0.54, SHOULDER_Y = HIP_Y + TORSO - 0.06, NECK_Y = HIP_Y + TORSO;
const UPPER = 0.3, FORE = 0.26;
/** Cuánto levanta la suela de las plataformas. */
const PLATFORM = 0.1;

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
  { h: 0.94, w: 0.95, d: 1, limb: 0.95, head: 1.55 },
  { h: 1.34, w: 1.1, d: 1.12, limb: 1.08, head: 0.9 },
];

// Índices de las opciones que cambian cómo se arma el cuerpo (ver shared/look.ts).
const MUSCULOSA = 1, BUZO = 2, TOP = 3, EN_CUERO = 4, ARNES = 5, CHALECO = 6;
const SHORT = 1, POLLERA = 2, ANCHO = 3, TUTU = 4;
const PLATAFORMAS = 1, BOTAS = 2, DESCALZO = 3;
const CAJA = 6, GUANTES = 5;

const hang = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d).translate(0, -h / 2, 0);
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
const merge = (...g: THREE.BufferGeometry[]) => mergeGeometries(g.map((x) => (x.index ? x.toNonIndexed() : x)))!;
const bx = (w: number, h: number, d: number, x: number, y: number, z: number) => at(new THREE.BoxGeometry(w, h, d), x, y, z);
/** La misma caja de los dos lados (x y -x). */
const pair = (w: number, h: number, d: number, x: number, y: number, z: number) => [bx(w, h, d, x, y, z), bx(w, h, d, -x, y, z)];
const cone = (r: number, h: number, x: number, y: number, z: number) => at(new THREE.ConeGeometry(r, h, 4).rotateY(Math.PI / 4), x, y, z);

/** Caja con la textura solo en la cara de adelante (+z); las otras caras muestrean un píxel liso. */
function faceBox(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) if (Math.floor(i / 4) !== 4) uv.setXY(i, 0.03, 0.97);
  return g;
}

// --- Cabeza -------------------------------------------------------------------------------
// Todo es relativo a la base del cuello. La cabeza es una caja que va de y=0.02 a y=0.30, con
// x y z entre -0.13 y 0.13; la cara mira a +z.
// Todo pelo sobresale 1 cm de la cabeza (nunca queda al ras: parpadea) y deja la cara libre.

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
/** Una malla por opción de LOOK.pelo, más las internas del final. */
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
  // RODETES: dos bollitos arriba.
  merge(helmet(), ...pair(0.11, 0.1, 0.11, 0.095, 0.385, -0.03)),
  // DOS COLITAS: una a cada lado.
  merge(helmet(), ...pair(0.07, 0.07, 0.07, 0.175, 0.25, -0.04), ...pair(0.07, 0.22, 0.07, 0.195, 0.11, -0.04)),
  // AFRO
  merge(bx(0.46, 0.27, 0.44, 0, 0.385, -0.03), ...pair(0.1, 0.2, 0.32, 0.18, 0.2, -0.05), bx(0.46, 0.3, 0.1, 0, 0.2, -0.2)),
  // RASTAS: mechones que cuelgan por la espalda y los hombros.
  merge(helmet(), ...[-0.11, -0.037, 0.037, 0.11].map((x) => bx(0.05, 0.32, 0.05, x, 0, -0.155)), ...pair(0.05, 0.26, 0.05, 0.158, 0.03, -0.06)),
  // PUAS
  merge(helmet(), ...[[0, 0], [-0.09, 0.07], [0.09, 0.07], [-0.09, -0.08], [0.09, -0.08]].map(([x, z]) => cone(0.05, 0.16, x, 0.41, z))),
  // (interno) costados de RULOS y AFRO con gorro puesto
  merge(...curlsSides()),
];
const CORTO = 0, CRESTA = 2, RULOS = 3, RODETES = 7, AFRO = 9, PUAS = 11, COSTADOS = 12;
/** Accesorios que tapan la parte de arriba de la cabeza. */
const HATS = new Set([1, 2, 7, 13, 14]);

/** Qué malla de pelo le toca (o -1 si no se ve): el gorro y la caja tapan lo de arriba. */
function hairIndex(l: Look): number {
  if (l.accesorio === CAJA) return -1;
  if (!HATS.has(l.accesorio)) return l.pelo;
  if (l.pelo === CRESTA) return -1;
  if (l.pelo === RULOS || l.pelo === AFRO) return COSTADOS;
  if (l.pelo === RODETES || l.pelo === PUAS) return CORTO;
  return l.pelo;
}

/** Una malla por opción de LOOK.accesorio. */
const ACC_GEOS: (THREE.BufferGeometry | null)[] = [
  null,
  // GORRA
  merge(bx(0.3, 0.12, 0.3, 0, 0.33, 0), bx(0.26, 0.03, 0.16, 0, 0.285, 0.21)),
  // PILUSO
  merge(bx(0.3, 0.13, 0.3, 0, 0.34, 0), bx(0.46, 0.03, 0.46, 0, 0.28, 0)),
  // LENTES (viejos: ahora van en ANTEOJOS)
  bx(0.28, 0.06, 0.04, 0, 0.2, 0.125),
  // CUERNOS
  merge(at(new THREE.ConeGeometry(0.04, 0.16, 4), 0.09, 0.38, 0), at(new THREE.ConeGeometry(0.04, 0.16, 4), -0.09, 0.38, 0)),
  // AUREOLA
  at(new THREE.TorusGeometry(0.12, 0.022, 4, 8).rotateX(Math.PI / 2), 0, 0.5, 0),
  // CAJA EN LA CABEZA
  at(faceBox(0.38, 0.36, 0.38), 0, 0.17, 0),
  // GORRO DE LANA: con el doblez y el pompón.
  merge(bx(0.3, 0.15, 0.3, 0, 0.345, 0), bx(0.315, 0.055, 0.315, 0, 0.275, 0), bx(0.09, 0.08, 0.09, 0, 0.455, 0)),
  // ANTENITAS
  merge(bx(0.275, 0.025, 0.05, 0, 0.35, 0), ...pair(0.02, 0.15, 0.02, 0.07, 0.42, 0), ...pair(0.065, 0.065, 0.065, 0.07, 0.51, 0)),
  // OREJITAS
  merge(cone(0.06, 0.12, 0.085, 0.395, 0), cone(0.06, 0.12, -0.085, 0.395, 0)),
  // AURICULARES
  merge(bx(0.33, 0.03, 0.05, 0, 0.36, 0), ...pair(0.03, 0.2, 0.05, 0.165, 0.27, 0), ...pair(0.05, 0.13, 0.13, 0.172, 0.17, 0)),
  // CORONA
  merge(bx(0.24, 0.05, 0.24, 0, 0.365, 0), ...pair(0.05, 0.06, 0.05, 0.095, 0.42, 0.095), ...pair(0.05, 0.06, 0.05, 0.095, 0.42, -0.095), bx(0.05, 0.09, 0.05, 0, 0.435, 0.095)),
  // VINCHA
  bx(0.3, 0.045, 0.3, 0, 0.245, 0),
  // CONO
  merge(cone(0.16, 0.4, 0, 0.5, 0), bx(0.36, 0.03, 0.36, 0, 0.3, 0)),
  // CASCO
  merge(bx(0.3, 0.12, 0.3, 0, 0.345, 0), bx(0.34, 0.025, 0.42, 0, 0.29, 0.03), bx(0.07, 0.03, 0.3, 0, 0.42, 0)),
];
/** Accesorios con color propio; el resto toma el COLOR DE LOS ACCESORIOS del personaje. */
const ACC_COLOR: Record<number, string> = { 3: '#0f1217', 5: '#ffe600', 6: '#b08a5a', 11: '#ffe600', 13: '#ff7a3c', 14: '#ffe600' };
/** Cuánto sobresale de la cabeza (para colgar el nombre arriba). */
const ACC_TOP: Record<number, number> = { 5: 0.26, 8: 0.26, 13: 0.42 };

const EYE_Y = 0.18, MOUTH_Y = 0.08;
/** Una malla por opción de LOOK.anteojos. */
const GLASSES_GEOS: (THREE.BufferGeometry | null)[] = [
  null,
  // OSCUROS
  bx(0.28, 0.07, 0.04, 0, EYE_Y, 0.125),
  // RAVE: envolventes.
  merge(bx(0.29, 0.055, 0.04, 0, EYE_Y, 0.13), ...pair(0.03, 0.04, 0.16, 0.14, EYE_Y, 0.05)),
  // 3D
  at(faceBox(0.29, 0.08, 0.03), 0, EYE_Y, 0.135),
  // CORAZONES (recortados de una textura)
  at(faceBox(0.32, 0.12, 0.012), 0, EYE_Y, 0.142),
  // ANTIPARRAS
  merge(...pair(0.115, 0.1, 0.07, 0.068, EYE_Y, 0.14), bx(0.275, 0.035, 0.275, 0, EYE_Y, 0)),
];
const GLASSES_COLOR: Record<number, string> = { 1: '#0f1217', 3: '#ffffff' };

/** Una malla por opción de LOOK.boca. */
const MOUTH_GEOS: (THREE.BufferGeometry | null)[] = [
  null,
  // CHUPETE
  merge(bx(0.11, 0.07, 0.02, 0, MOUTH_Y, 0.14), bx(0.045, 0.045, 0.045, 0, MOUTH_Y, 0.17)),
  // SILBATO
  merge(bx(0.06, 0.05, 0.1, 0, MOUTH_Y, 0.175), bx(0.03, 0.03, 0.03, 0, MOUTH_Y + 0.04, 0.2)),
  // BARBIJO
  merge(bx(0.275, 0.12, 0.03, 0, MOUTH_Y + 0.01, 0.125), bx(0.275, 0.02, 0.275, 0, MOUTH_Y + 0.04, 0)),
  // CHUPETIN
  merge(bx(0.02, 0.02, 0.1, 0.03, MOUTH_Y, 0.17), bx(0.08, 0.08, 0.03, 0.03, MOUTH_Y, 0.235)),
];

// --- Torso --------------------------------------------------------------------------------
// Relativo al piso, con el personaje parado. El torso es una caja de 0.40 × 0.54 × 0.22 que
// arranca en la cadera; estas mallas usan su misma matriz (se ensanchan con el cuerpo).

const strap = (z: number) => at(new THREE.BoxGeometry(0.035, 0.66, 0.02).rotateZ(0.62), 0, HIP_Y + 0.29, z);
const wing = (side: 1 | -1) => at(new THREE.BoxGeometry(0.38, 0.52, 0.015).translate(side * 0.19, 0, 0).rotateY(side * 0.5), side * 0.03, HIP_Y + 0.38, -0.125);
/** Una malla por opción de LOOK.encima. */
const OVER_GEOS: (THREE.BufferGeometry | null)[] = [
  null,
  // CADENA
  merge(...pair(0.03, 0.16, 0.02, 0.09, HIP_Y + 0.46, 0.118), bx(0.21, 0.03, 0.02, 0, HIP_Y + 0.37, 0.118), bx(0.08, 0.08, 0.03, 0, HIP_Y + 0.31, 0.122)),
  // RIÑONERA cruzada
  merge(strap(0.12), strap(-0.12), at(new THREE.BoxGeometry(0.22, 0.11, 0.07).rotateZ(0.62 - Math.PI / 2), 0, HIP_Y + 0.29, 0.155)),
  // MOCHILA
  merge(bx(0.3, 0.36, 0.13, 0, HIP_Y + 0.31, -0.18), ...pair(0.05, 0.36, 0.02, 0.13, HIP_Y + 0.37, 0.118), ...pair(0.05, 0.02, 0.24, 0.13, NECK_Y + 0.008, 0)),
  // ALAS
  merge(wing(1), wing(-1)),
  // CAPA
  merge(bx(0.44, 0.8, 0.02, 0, HIP_Y + 0.14, -0.135), bx(0.44, 0.04, 0.26, 0, NECK_Y - 0.02, 0)),
];
const OVER_COLOR: Record<number, string> = { 1: '#ffe600' };

/** Lo que va arriba del torso según LOOK.arriba (el resto de las prendas son solo colores). */
const TOP_GEOS: (THREE.BufferGeometry | null)[] = LOOK.arriba.map((_, i) =>
  i === TOP
    ? // La panza al aire.
      bx(0.42, 0.2, 0.24, 0, HIP_Y + 0.115, 0)
    : i === ARNES
      ? merge(bx(0.42, 0.045, 0.24, 0, HIP_Y + 0.35, 0), ...pair(0.045, 0.2, 0.24, 0.1, HIP_Y + 0.445, 0), bx(0.08, 0.08, 0.02, 0, HIP_Y + 0.35, 0.125))
      : i === CHALECO
        ? merge(...pair(0.15, 0.46, 0.02, 0.13, HIP_Y + 0.3, 0.12), bx(0.42, 0.46, 0.02, 0, HIP_Y + 0.3, -0.12), ...pair(0.15, 0.02, 0.26, 0.13, NECK_Y, 0), ...pair(0.02, 0.3, 0.24, 0.21, HIP_Y + 0.22, 0))
        : null,
);

/** Polleras según LOOK.abajo. */
const SKIRT_GEOS: (THREE.BufferGeometry | null)[] = LOOK.abajo.map((_, i) =>
  i === POLLERA ? bx(0.47, 0.25, 0.31, 0, HIP_Y - 0.07, 0) : i === TUTU ? merge(bx(0.46, 0.07, 0.3, 0, HIP_Y, 0), bx(0.68, 0.05, 0.52, 0, HIP_Y - 0.06, 0)) : null,
);

// --- Manos --------------------------------------------------------------------------------
// Relativo al codo: el antebrazo cuelga hacia -y y la mano está en la punta.
const HAND_Y = -FORE - 0.045;
/** Una malla por opción de LOOK.mano. */
const HAND_GEOS: (THREE.BufferGeometry | null)[] = [
  null,
  // PALITOS DE LUZ
  bx(0.03, 0.03, 0.36, 0, HAND_Y, 0.1),
  // ABANICO
  bx(0.34, 0.24, 0.02, 0, HAND_Y - 0.14, 0),
  // AGUA
  merge(bx(0.075, 0.2, 0.075, 0, HAND_Y + 0.02, 0.085), bx(0.04, 0.04, 0.04, 0, HAND_Y + 0.14, 0.085)),
  // PULSERAS
  merge(bx(0.11, 0.03, 0.11, 0, -FORE + 0.02, 0), bx(0.11, 0.03, 0.11, 0, -FORE + 0.075, 0)),
  // GUANTES (es solo el color de la mano)
  null,
];
/** Lo que va en las dos manos; el resto, solo en la derecha. */
const BOTH_HANDS = new Set([1, 4]);
const HAND_COLOR: Record<number, string> = { 3: '#9ad8ff' };

/** Un grupo de mallas instanciadas del que cada bailarín usa una (o ninguna). */
class Parts {
  private n: number[];
  constructor(readonly meshes: (THREE.InstancedMesh | null)[]) {
    this.n = meshes.map(() => 0);
  }
  reset() {
    this.n.fill(0);
  }
  color(i: number, c: THREE.Color) {
    const m = this.meshes[i];
    if (m) m.setColorAt(this.n[i]++, c);
  }
  matrix(i: number, mat: THREE.Matrix4) {
    const m = this.meshes[i];
    if (m) m.setMatrixAt(this.n[i]++, mat);
  }
  /** Fija cuántas instancias se dibujan de cada malla (después de pintar). */
  commit() {
    this.meshes.forEach((m, i) => m && (m.count = this.n[i]));
  }
}

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
  /** Hacia dónde mira el personaje cuando se lo muestra solo; null = gira despacio solo. */
  spin: number | null = null;
  private slots = makeSlots();
  private dancers: Dancer[] = [];
  private solo = false;
  private thighs: THREE.InstancedMesh;
  private shins: THREE.InstancedMesh;
  private upperArms: THREE.InstancedMesh;
  private foreArms: THREE.InstancedMesh;
  private hands: THREE.InstancedMesh;
  private shoes: Parts;
  private torsos: Parts;
  private heads: Parts;
  private hair: Parts;
  private acc: Parts;
  private glasses: Parts;
  private mouth: Parts;
  private over: Parts;
  private tops: Parts;
  private skirts: Parts;
  private held: Parts;
  private parts: Parts[];
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
    const parts = (geos: (THREE.BufferGeometry | null)[], mat: (i: number) => THREE.Material = () => plain, n = capacity) =>
      new Parts(geos.map((g, i) => (g ? mesh(g, n, mat(i)) : null)));

    this.thighs = mesh(hang(0.15, THIGH, 0.17), capacity * 2);
    this.shins = mesh(hang(0.125, SHIN, 0.14), capacity * 2);
    this.upperArms = mesh(hang(0.11, UPPER, 0.11), capacity * 2);
    this.foreArms = mesh(hang(0.09, FORE, 0.09), capacity * 2);
    // La mano y el calzado van pegados al antebrazo y a la canilla: usan su misma matriz.
    this.hands = mesh(bx(0.095, 0.095, 0.1, 0, HAND_Y, 0), capacity * 2);
    this.shoes = parts(
      [bx(0.14, SHOE, 0.25, 0, -SHIN - SHOE / 2, 0.045), bx(0.15, SHOE + PLATFORM, 0.26, 0, -SHIN - (SHOE + PLATFORM) / 2, 0.045)],
      undefined,
      capacity * 2,
    );

    const torsoGeo = () => at(faceBox(0.4, TORSO, 0.22), 0, HIP_Y + TORSO / 2, 0);
    this.torsos = parts(LOOK.estampa.map(torsoGeo), (i) => (i ? makePSXMaterial({ map: makePrintTexture(i - 1), decal: true }) : plain));
    const faces = LOOK.cara.map((_, i) => makePSXMaterial({ map: makeFaceTexture(i) }));
    this.heads = parts(LOOK.cara.map(() => at(faceBox(0.26, 0.28, 0.26), 0, 0.16, 0)), (i) => faces[i]);
    this.hair = parts(HAIR_GEOS);
    this.acc = parts(ACC_GEOS, (i) => (i === CAJA ? faces[3] : plain));
    this.glasses = parts(GLASSES_GEOS, (i) => (i === 3 ? makePSXMaterial({ map: make3DGlassesTexture() }) : i === 4 ? makePSXMaterial({ map: makeHeartGlassesTexture() }) : plain));
    this.mouth = parts(MOUTH_GEOS);
    this.over = parts(OVER_GEOS);
    this.tops = parts(TOP_GEOS);
    this.skirts = parts(SKIRT_GEOS);
    // Los palitos de luz no llevan sombra: brillan.
    const glow = makePSXMaterial({ lit: false });
    this.held = parts(HAND_GEOS, (i) => (i === 1 ? glow : plain), capacity * 2);
    this.parts = [this.shoes, this.torsos, this.heads, this.hair, this.acc, this.glasses, this.mouth, this.over, this.tops, this.skirts, this.held];
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

  /** Pone al bailarín `i` en un lugar exacto, de frente y sin variaciones (para exportarlo). */
  pin(i: number, x: number, z: number) {
    const d = this.dancers[i];
    if (d) Object.assign(d, { x, z, yaw: 0, phase: 0, vary: 1 });
  }

  /** Escala total del bailarín `i` (1 = cuerpo normal). */
  scaleOf(i: number) {
    const d = this.dancers[i];
    return d ? (BUILDS[d.look.cuerpo] ?? BUILDS[0]).h * d.vary : 1;
  }

  private shown() {
    return this.solo ? this.dancers.slice(0, 1) : this.dancers;
  }

  /** Colores y cantidades por malla (cuando cambia quién baila o cómo se ve). */
  private paint() {
    const list = this.shown();
    const n = list.length;
    const c = new THREE.Color();
    const both = (m: THREE.InstancedMesh, i: number, hex: string) => {
      c.set(hex);
      m.setColorAt(i * 2, c);
      m.setColorAt(i * 2 + 1, c);
    };
    for (const p of this.parts) p.reset();
    list.forEach((d, i) => {
      const l = d.look;
      const skin = LOOK.piel[l.piel], shirt = LOOK.remera[l.remera], pants = LOOK.pantalon[l.pantalon];
      const neon = LOOK.neon[l.neon];
      const bare = l.arriba === EN_CUERO || l.arriba === ARNES;
      const sleeveless = bare || l.arriba === MUSCULOSA || l.arriba === TOP;
      const legs = l.abajo === POLLERA || l.abajo === TUTU;
      const shoe = l.calzado === DESCALZO ? skin : LOOK.zapas[l.zapas];
      both(this.thighs, i, legs ? skin : pants);
      // Con short o pollera se ve la pierna; las botas la tapan.
      both(this.shins, i, l.calzado === BOTAS ? shoe : legs || l.abajo === SHORT ? skin : pants);
      c.set(shoe);
      const shoeMesh = l.calzado === PLATAFORMAS ? 1 : 0;
      this.shoes.color(shoeMesh, c);
      this.shoes.color(shoeMesh, c);
      both(this.upperArms, i, sleeveless ? skin : shirt);
      both(this.foreArms, i, l.arriba === BUZO ? shirt : skin);
      both(this.hands, i, l.mano === GUANTES ? '#f9f2e8' : skin);
      // En cuero, la estampa queda de tatuaje.
      this.torsos.color(l.estampa, c.set(bare ? skin : shirt));
      this.tops.color(l.arriba, c.set(l.arriba === TOP ? skin : neon));
      this.skirts.color(l.abajo, c.set(pants));
      this.over.color(l.encima, c.set(OVER_COLOR[l.encima] ?? neon));
      this.heads.color(l.cara, c.set(skin));
      const hair = hairIndex(l);
      if (hair >= 0) this.hair.color(hair, c.set(LOOK.peloColor[l.peloColor]));
      this.acc.color(l.accesorio, c.set(ACC_COLOR[l.accesorio] ?? neon));
      if (l.accesorio !== CAJA) {
        this.glasses.color(l.anteojos, c.set(GLASSES_COLOR[l.anteojos] ?? neon));
        this.mouth.color(l.boca, c.set(neon));
      }
      c.set(HAND_COLOR[l.mano] ?? neon);
      this.held.color(l.mano, c);
      if (BOTH_HANDS.has(l.mano)) this.held.color(l.mano, c);
    });
    for (const m of [this.thighs, this.shins, this.upperArms, this.foreArms, this.hands]) m.count = n * 2;
    for (const p of this.parts) p.commit();
    for (const m of this.all) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  // Temporales para no generar basura en cada frame.
  private pose = makePose();
  private root = new THREE.Matrix4();
  private joint = new THREE.Matrix4();
  private local = new THREE.Matrix4();
  private out = new THREE.Matrix4();
  private wide = new THREE.Matrix4();
  private euler = new THREE.Euler();
  /** Primero el giro y después la inclinación: se inclina para donde mira. */
  private rootEuler = new THREE.Euler(0, 0, 0, 'YXZ');
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

  /**
   * Brazo o pierna: parte de arriba, articulación del medio y parte de abajo.
   * Devuelve la matriz de la parte de abajo (la usan la mano, el calzado y lo que se lleva en la mano).
   */
  private limb(upper: THREE.InstancedMesh, lower: THREE.InstancedMesh, i: number, x: number, y: number, len: number, rx: number, rz: number, bendX: number, thick: number) {
    this.bend(this.root, x, y, 0, rx, 0, rz);
    upper.setMatrixAt(i, this.sized(thick, 1, thick));
    this.bend(this.out.copy(this.joint), 0, -len, 0, bendX, 0, 0);
    const m = this.sized(thick, 1, thick);
    lower.setMatrixAt(i, m);
    return m;
  }

  /**
   * @param beats tiempo de baile en beats (avanza solo mientras suena la música)
   * @param energy 0 = parados meciéndose, 1 = bailando a full
   * @param t tiempo en segundos (para el vaivén cuando no hay música)
   */
  update(beats: number, energy: number, t: number) {
    const e = energy;
    const p = this.pose;
    for (const part of this.parts) part.reset();
    this.shown().forEach((d, i) => {
      const l = d.look;
      const b = BUILDS[l.cuerpo] ?? BUILDS[0];
      dance(l.baile, beats + d.phase * 0.012, e, p);
      // En el creador gira despacio para verlo de todos lados (o mira para donde lo dejaron).
      const facing = this.solo ? (this.spin ?? Math.sin(t * 0.7) * 0.9) : d.yaw + Math.sin(t * 0.9 + d.phase) * 0.08 * (1 - e);
      const h = b.h * d.vary;
      // Al doblar las rodillas baja la cadera, así el pie que apoya no queda flotando.
      const footL = THIGH * Math.cos(p.tL) + (SHIN + SHOE) * Math.cos(p.tL + p.kL);
      const footR = THIGH * Math.cos(p.tR) + (SHIN + SHOE) * Math.cos(p.tR + p.kR);
      const lift = (l.calzado === PLATAFORMAS ? PLATFORM : 0) - (HIP_Y - Math.max(footL, footR));
      const y = p.hop + lift * h;
      this.root.compose(this.pos.set(d.x + p.sway * h, y, d.z), this.quat.setFromEuler(this.rootEuler.set(p.lean, facing + p.yaw, p.roll)), this.scale.set(h, h, h));

      const hip = 0.1 * b.w, shoulder = 0.2 * b.w + 0.055 * b.limb;
      const leg = b.limb * (l.abajo === ANCHO ? 1.5 : 1);
      const shoe = l.calzado === PLATAFORMAS ? 1 : 0;
      this.shoes.matrix(shoe, this.limb(this.thighs, this.shins, i * 2, hip, HIP_Y, THIGH, p.tL, p.tLz, p.kL, leg));
      this.shoes.matrix(shoe, this.limb(this.thighs, this.shins, i * 2 + 1, -hip, HIP_Y, THIGH, p.tR, p.tRz, p.kR, leg));
      const both = BOTH_HANDS.has(l.mano);
      let hand = this.limb(this.upperArms, this.foreArms, i * 2, shoulder, SHOULDER_Y, UPPER, p.aLx, p.aLz, p.eL, b.limb);
      this.hands.setMatrixAt(i * 2, hand);
      if (both) this.held.matrix(l.mano, hand);
      hand = this.limb(this.upperArms, this.foreArms, i * 2 + 1, -shoulder, SHOULDER_Y, UPPER, p.aRx, p.aRz, p.eR, b.limb);
      this.hands.setMatrixAt(i * 2 + 1, hand);
      this.held.matrix(l.mano, hand);

      const torso = this.wide.copy(this.root).scale(this.scale.set(b.w, 1, b.d));
      this.torsos.matrix(l.estampa, torso);
      this.tops.matrix(l.arriba, torso);
      this.skirts.matrix(l.abajo, torso);
      this.over.matrix(l.encima, torso);

      this.bend(this.root, 0, NECK_Y, 0, p.headRx, p.headRy, 0);
      const head = this.sized(b.head, b.head, b.head);
      this.heads.matrix(l.cara, head);
      const hair = hairIndex(l);
      if (hair >= 0) this.hair.matrix(hair, head);
      this.acc.matrix(l.accesorio, head);
      if (l.accesorio !== CAJA) {
        this.glasses.matrix(l.anteojos, head);
        this.mouth.matrix(l.boca, head);
      }
      d.headY = y + (NECK_Y + 0.3 * b.head) * h;
    });
    for (const m of this.all) if (m.count) m.instanceMatrix.needsUpdate = true;
  }

  /** Posición de arriba de la cabeza del bailarín `i` (para colgarle el nombre). */
  headTop(i: number, out: THREE.Vector3) {
    const d = this.dancers[i];
    if (!d) return null;
    const l = d.look;
    const extra = l.accesorio ? (ACC_TOP[l.accesorio] ?? 0.16) : l.pelo === AFRO || l.pelo === RODETES || l.pelo === PUAS ? 0.2 : 0.04;
    return out.set(d.x, d.headY + extra * (BUILDS[l.cuerpo] ?? BUILDS[0]).head, d.z);
  }

  nameOf(i: number) {
    return this.dancers[i]?.name ?? '';
  }
}
