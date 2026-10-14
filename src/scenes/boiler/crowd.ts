import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LOOK, type Look, type Raro } from '../../../shared/look';
import { DETAIL, type DetailCell, detailUv, make3DGlassesTexture, makeDetailTexture, makeFaceTexture, makeHeartGlassesTexture, makePSXMaterial, makePrintTexture } from '../../style-kit';
import { ARM, CLUB, PALCO, PISO2, floorAt } from './club';
import { ACTION_SECONDS, AGUA, EN_LA_FILA, PUCHO as FUMAR, SALTO, SALUDO, action, dance, hype, makePose, sipReach, sipTip, stride } from './dances';

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

export const MAX_DANCERS = 260;

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
const MUSCULOSA = 1, BUZO = 2, TOP = 3, EN_CUERO = 4, ARNES = 5, CHALECO = 6, VESTIDO = 7;
const SHORT = 1, POLLERA = 2, ANCHO = 3, TUTU = 4;
const PLATAFORMAS = 1, BOTAS = 2, DESCALZO = 3;
const CAJA = 6, OREJAS_ELFA = 15, GUANTES = 5;

// --- Piezas -------------------------------------------------------------------------------
// El cuerpo (cabeza, torso, brazos y piernas) son piezas de 8 lados que se afinan; la ropa y
// los accesorios se arman con cajas alrededor. Cada pieza apunta a un casillero de la paleta de detalle
// (DETAIL): un tono del color de la pieza (T0 el más claro… T3) o un color fijo (W blanco,
// K negro, G gris, Y amarillo, R rojo, C celeste, P rosa, B azul). Así un peinado tiene mechones
// más oscuros y una zapatilla tiene suela blanca sin sumar mallas ni draw calls.
const { T0, T1, T2, T3, W, K, G, Y, R, C, P, B } = DETAIL;

/** Pinta toda la geometría con un casillero de la paleta. */
function tint<T extends THREE.BufferGeometry>(g: T, cell: DetailCell): T {
  const [u, v] = detailUv(cell);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v);
  return g;
}
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
const merge = (...g: THREE.BufferGeometry[]) => mergeGeometries(g.map((x) => (x.index ? x.toNonIndexed() : x)))!;
const bx = (w: number, h: number, d: number, x: number, y: number, z: number, cell: DetailCell = T0) => tint(at(new THREE.BoxGeometry(w, h, d), x, y, z), cell);
/** La misma caja de los dos lados (x y -x). */
const pair = (w: number, h: number, d: number, x: number, y: number, z: number, cell: DetailCell = T0) => [bx(w, h, d, x, y, z, cell), bx(w, h, d, -x, y, z, cell)];
/** Caras planas (cada triángulo con su propia normal): se ven las facetas, como en la Play. */
const faceted = (g: THREE.BufferGeometry) => {
  const out = g.index ? g.toNonIndexed() : g;
  out.computeVertexNormals();
  return out;
};
/** Brazo o pierna: un prisma de 8 lados que cuelga del origen y se afina hacia abajo (`taper` = cuánto queda del grosor). */
const hang = (w: number, h: number, d: number, taper = 1) => {
  const r = 0.5 / Math.cos(Math.PI / 8);
  return tint(faceted(new THREE.CylinderGeometry(r, r * taper, h, 8, 1).rotateY(Math.PI / 8).scale(w, 1, d).translate(0, -h / 2, 0)), T0);
};

/** Un corte del cuerpo a cierta altura: medio ancho, hasta dónde llega adelante y atrás, y el chanfle de las esquinas. */
type Ring = [y: number, halfW: number, front: number, back: number, chamfer: number];
/**
 * Cuerpo "torneado": une cortes de 8 lados, uno arriba del otro, y lo tapa arriba y abajo.
 * En las caras que miran adelante la textura va proyectada de frente sobre el rectángulo
 * `face` (x, y, ancho, alto); las demás toman un píxel liso, como en faceBox.
 */
function loft(rings: Ring[], face: [number, number, number, number]) {
  const cut = ([y, hw, zf, zb, c]: Ring) =>
    [[-hw + c, zf], [hw - c, zf], [hw, zf - c], [hw, zb + c], [hw - c, zb], [-hw + c, zb], [-hw, zb + c], [-hw, zf - c]].map(([x, z]) => new THREE.Vector3(x, y, z));
  const cuts = rings.map(cut);
  const tris: THREE.Vector3[][] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], b = cuts[i + 1];
    for (let k = 0; k < 8; k++) {
      const n = (k + 1) % 8;
      tris.push([a[k], a[n], b[n]], [a[k], b[n], b[k]]);
    }
  }
  for (const cap of [cuts[0], cuts[cuts.length - 1]]) for (let k = 1; k < 7; k++) tris.push([cap[0], cap[k], cap[k + 1]]);
  const mid = new THREE.Vector3(0, (rings[0][0] + rings[rings.length - 1][0]) / 2, 0);
  const pos: number[] = [], uv: number[] = [];
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Vector3();
  for (const t of tris) {
    n.crossVectors(e1.subVectors(t[1], t[0]), e2.subVectors(t[2], t[0])).normalize();
    // Que todas las caras miren para afuera.
    c.copy(t[0]).add(t[1]).add(t[2]).divideScalar(3).sub(mid);
    if (n.dot(c) < 0) {
      [t[1], t[2]] = [t[2], t[1]];
      n.negate();
    }
    for (const p of t) {
      pos.push(p.x, p.y, p.z);
      if (n.z > 0.6) uv.push((p.x - face[0]) / face[2], (p.y - face[1]) / face[3]);
      else uv.push(0.03, 0.97);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
/** Tronco de pirámide de base cuadrada (radios de arriba y de abajo); con `top` = 0 es una punta. */
const taper = (top: number, bottom: number, h: number, x: number, y: number, z: number, cell: DetailCell = T0) =>
  tint(at(new THREE.CylinderGeometry(top, bottom, h, 4, 1).rotateY(Math.PI / 4), x, y, z), cell);
const cone = (r: number, h: number, x: number, y: number, z: number, cell: DetailCell = T0) => taper(0, r, h, x, y, z, cell);
/** Una pieza girada (primero se gira sobre su centro y después se ubica). */
const turned = (g: THREE.BufferGeometry, rx: number, ry: number, rz: number, x: number, y: number, z: number, cell: DetailCell = T0) =>
  tint(at(g.rotateX(rx).rotateY(ry).rotateZ(rz), x, y, z), cell);

/** Caja con la textura solo en la cara de adelante (+z); las otras caras muestrean un píxel liso. */
function faceBox(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) if (Math.floor(i / 4) !== 4) uv.setXY(i, 0.03, 0.97);
  return g;
}
/** Caja que toma un solo píxel de la textura de la cara (u, v). */
function texel(w: number, h: number, d: number, x: number, y: number, z: number, u: number, v: number) {
  const g = at(new THREE.BoxGeometry(w, h, d), x, y, z);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v);
  return g;
}

// --- Cabeza -------------------------------------------------------------------------------
// Todo es relativo a la base del cuello. La cabeza va de y=0.02 a y=0.30 y entra justo en una
// caja con x y z entre -0.13 y 0.13 (por eso el pelo y los gorros, que son cajas, le calzan):
// esquinas chanfleadas, la pera más angosta y la coronilla redondeada. La cara mira a +z.
// Todo pelo sobresale 1 cm de la cabeza (nunca queda al ras: parpadea) y deja la cara libre.

/** Cabeza con cuello, orejas y nariz en relieve (la nariz toma su color del dibujo de la cara). */
const headGeo = () =>
  merge(
    loft(
      [
        [0.02, 0.085, 0.112, -0.09, 0.03],
        [0.085, 0.125, 0.13, -0.122, 0.04],
        [0.24, 0.13, 0.13, -0.13, 0.04],
        [0.3, 0.1, 0.105, -0.1, 0.035],
      ],
      [-0.13, 0.02, 0.26, 0.28],
    ),
    texel(0.11, 0.07, 0.11, 0, 0, 0, 0.03, 0.97),
    texel(0.03, 0.075, 0.055, 0.142, 0.155, -0.005, 0.03, 0.97),
    texel(0.03, 0.075, 0.055, -0.142, 0.155, -0.005, 0.03, 0.97),
    texel(0.045, 0.055, 0.03, 0, 0.132, 0.142, 0.5, 0.41),
  );

/** Casco de pelo: tapa de arriba, nuca y patillas. `back` es hasta dónde baja atrás. */
const helmet = (back = 0.1, sides = 0.15) => [
  bx(0.28, 0.07, 0.28, 0, 0.305, 0),
  bx(0.28, 0.3 - back, 0.03, 0, (0.3 + back) / 2, -0.133),
  bx(0.03, 0.29 - sides, 0.2, 0.132, (0.29 + sides) / 2, -0.03),
  bx(0.03, 0.29 - sides, 0.2, -0.132, (0.29 + sides) / 2, -0.03),
  // La nuca, un tono más oscura.
  bx(0.24, 0.05, 0.035, 0, back + 0.035, -0.134, T1),
];
/** Rulos sin la parte de arriba (lo que asoma por debajo de un gorro). */
const curlsSides = () => [
  ...pair(0.09, 0.12, 0.16, 0.17, 0.24, -0.01, T1),
  ...pair(0.08, 0.12, 0.15, 0.165, 0.13, -0.06),
  bx(0.3, 0.14, 0.09, 0, 0.23, -0.17, T1),
  bx(0.26, 0.12, 0.08, 0, 0.11, -0.165),
];
const DREADS: [number, number, DetailCell][] = [[-0.11, 0.3, Y], [-0.055, 0.38, R], [0, 0.33, C], [0.055, 0.4, Y], [0.11, 0.28, R]];
const SPIKES: [number, number, number][] = [[0, 0.02, 0.2], [-0.09, 0.08, 0.15], [0.09, 0.08, 0.15], [-0.09, -0.07, 0.16], [0.09, -0.07, 0.16], [0, -0.1, 0.18], [0, 0.115, 0.12]];
/** Una malla por opción de LOOK.pelo, más las internas del final. */
const HAIR_GEOS: (THREE.BufferGeometry | null)[] = [
  // CORTO: con dos mechones sobre la frente.
  merge(...helmet(), bx(0.1, 0.035, 0.03, -0.07, 0.275, 0.137, T1), bx(0.08, 0.03, 0.03, 0.06, 0.28, 0.137, T1)),
  // LARGO: la nuca y los costados bajan hasta los hombros, con dos mechones adelante.
  merge(...helmet(0, 0.05), ...pair(0.05, 0.2, 0.03, 0.11, -0.05, 0.127, T1), bx(0.26, 0.14, 0.03, 0, -0.05, -0.14, T1)),
  // CRESTA: los costados rapados y la cresta en escalones.
  merge(bx(0.268, 0.02, 0.268, 0, 0.305, 0, T3), bx(0.06, 0.1, 0.1, 0, 0.35, 0.1), bx(0.06, 0.18, 0.12, 0, 0.39, 0, T1), bx(0.06, 0.12, 0.1, 0, 0.36, -0.1), bx(0.06, 0.1, 0.05, 0, 0.25, -0.15, T1)),
  // RULOS: bochas de distinto tamaño (dejan la frente y los ojos a la vista).
  merge(bx(0.2, 0.14, 0.2, -0.08, 0.36, 0.03), bx(0.2, 0.16, 0.2, 0.09, 0.37, -0.02, T1), bx(0.24, 0.14, 0.18, 0, 0.35, -0.12), bx(0.14, 0.08, 0.06, 0.03, 0.33, 0.13, T1), ...curlsSides()),
  // PELADO
  null,
  // FLEQUILLO: en tres mechones, de costado.
  merge(...helmet(), bx(0.1, 0.09, 0.03, -0.09, 0.245, 0.145), bx(0.1, 0.07, 0.03, 0, 0.255, 0.147, T1), bx(0.09, 0.05, 0.03, 0.09, 0.265, 0.145)),
  // COLITA: gomita roja y cola que se afina.
  merge(...helmet(), bx(0.075, 0.05, 0.06, 0, 0.27, -0.175, R), bx(0.09, 0.12, 0.08, 0, 0.22, -0.215), bx(0.075, 0.12, 0.07, 0, 0.11, -0.225, T1), bx(0.05, 0.08, 0.05, 0, 0.02, -0.22)),
  // RODETES: dos bollitos arriba.
  merge(...helmet(), ...pair(0.07, 0.03, 0.07, 0.095, 0.345, -0.03, T2), ...pair(0.12, 0.1, 0.12, 0.095, 0.4, -0.03), ...pair(0.08, 0.03, 0.08, 0.095, 0.46, -0.03, T1)),
  // DOS COLITAS: una a cada lado, con gomita.
  merge(...helmet(), ...pair(0.05, 0.05, 0.06, 0.16, 0.25, -0.04, R), ...pair(0.08, 0.12, 0.08, 0.2, 0.2, -0.04), ...pair(0.07, 0.12, 0.07, 0.205, 0.09, -0.04, T1), ...pair(0.045, 0.07, 0.045, 0.205, 0, -0.04)),
  // AFRO: en escalones, para que quede redondo.
  merge(bx(0.34, 0.1, 0.34, 0, 0.51, -0.03, T1), bx(0.46, 0.2, 0.44, 0, 0.37, -0.03), bx(0.54, 0.1, 0.36, 0, 0.36, -0.05, T1), ...pair(0.1, 0.2, 0.3, 0.185, 0.18, -0.06), bx(0.4, 0.26, 0.1, 0, 0.16, -0.2, T1), bx(0.3, 0.1, 0.08, 0, 0.05, -0.19)),
  // RASTAS: mechones de distinto largo con una cuenta de color en la punta.
  merge(
    ...helmet(),
    ...DREADS.flatMap(([x, len, bead], i) => [bx(0.045, len, 0.045, x, 0.1 - len / 2, -0.155, i % 2 ? T1 : T0), bx(0.055, 0.035, 0.055, x, 0.1 - len, -0.155, bead)]),
    ...pair(0.045, 0.3, 0.045, 0.158, 0.03, -0.04, T1),
    ...pair(0.045, 0.22, 0.045, 0.158, 0.07, 0.02),
  ),
  // PUAS
  merge(...helmet(), ...SPIKES.map(([x, z, h], i) => cone(0.055, h, x, 0.33 + h / 2, z, i % 2 ? T1 : T0))),
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

/** Oreja en punta, hacia afuera y hacia arriba. */
const elfEar = (side: 1 | -1) => turned(new THREE.ConeGeometry(0.04, 0.22, 4), 0, 0, -side * 1.05, side * 0.2, 0.21, -0.02);
const horn = (side: 1 | -1) => [taper(0.03, 0.05, 0.09, side * 0.09, 0.34, 0), turned(new THREE.ConeGeometry(0.032, 0.13, 4), 0, 0, -side * 0.55, side * 0.118, 0.43, 0, T1)];
/** Una malla por opción de LOOK.accesorio. */
const ACC_GEOS: (THREE.BufferGeometry | null)[] = [
  null,
  // GORRA: de camionero, con el frente blanco.
  merge(bx(0.3, 0.08, 0.3, 0, 0.31, 0), bx(0.26, 0.05, 0.27, 0, 0.375, -0.005), bx(0.2, 0.09, 0.02, 0, 0.335, 0.152, W), bx(0.26, 0.025, 0.17, 0, 0.285, 0.225, T1), bx(0.04, 0.02, 0.04, 0, 0.41, 0, T2)),
  // PILUSO: copa en dos escalones, cinta y ala caída.
  merge(bx(0.29, 0.07, 0.29, 0, 0.325, 0), bx(0.25, 0.05, 0.25, 0, 0.385, 0), bx(0.3, 0.025, 0.3, 0, 0.3, 0, T2), taper(0.21, 0.33, 0.06, 0, 0.26, 0, T1)),
  // LENTES (viejos: ahora van en ANTEOJOS)
  bx(0.28, 0.06, 0.04, 0, 0.2, 0.125),
  // CUERNOS: con la punta torcida hacia afuera.
  merge(...horn(1), ...horn(-1)),
  // AUREOLA
  tint(at(new THREE.TorusGeometry(0.12, 0.022, 4, 8).rotateX(Math.PI / 2), 0, 0.5, 0), T0),
  // CAJA EN LA CABEZA
  at(faceBox(0.38, 0.36, 0.38), 0, 0.17, 0),
  // GORRO DE LANA: doblez, raya y pompón blanco.
  merge(bx(0.315, 0.06, 0.315, 0, 0.275, 0, T1), bx(0.3, 0.05, 0.3, 0, 0.33, 0), bx(0.3, 0.04, 0.3, 0, 0.375, 0, T2), bx(0.26, 0.05, 0.26, 0, 0.42, 0), bx(0.1, 0.09, 0.1, 0, 0.49, 0, W)),
  // ANTENITAS: vincha negra, resortes y bolitas.
  merge(bx(0.275, 0.025, 0.05, 0, 0.35, 0, K), ...pair(0.02, 0.07, 0.02, 0.07, 0.39, 0, G), ...pair(0.02, 0.07, 0.02, 0.085, 0.45, 0, G), ...pair(0.075, 0.075, 0.075, 0.085, 0.52, 0)),
  // OREJITAS: de gato, rosas por dentro.
  merge(cone(0.065, 0.13, 0.085, 0.4, 0), cone(0.065, 0.13, -0.085, 0.4, 0), ...pair(0.04, 0.05, 0.02, 0.085, 0.385, 0.04, P)),
  // AURICULARES
  merge(bx(0.33, 0.03, 0.05, 0, 0.36, 0, K), ...pair(0.03, 0.2, 0.05, 0.165, 0.27, 0, K), ...pair(0.05, 0.14, 0.14, 0.175, 0.17, 0), ...pair(0.02, 0.1, 0.1, 0.205, 0.17, 0, T2)),
  // CORONA: con puntas y piedras.
  merge(
    bx(0.25, 0.05, 0.25, 0, 0.33, 0),
    ...[1, -1].flatMap((sx) => [1, -1].map((sz) => cone(0.035, 0.09, sx * 0.1, 0.4, sz * 0.1))),
    cone(0.04, 0.12, 0, 0.415, 0.105),
    bx(0.04, 0.04, 0.02, 0, 0.33, 0.13, R),
    ...pair(0.02, 0.04, 0.04, 0.13, 0.33, 0, C),
  ),
  // VINCHA: con una raya blanca.
  merge(bx(0.3, 0.05, 0.3, 0, 0.245, 0), bx(0.305, 0.016, 0.305, 0, 0.245, 0, W)),
  // CONO: de tránsito, con la banda blanca.
  merge(bx(0.38, 0.03, 0.38, 0, 0.3, 0, T1), taper(0.115, 0.16, 0.12, 0, 0.375, 0), taper(0.075, 0.115, 0.1, 0, 0.485, 0, W), taper(0.02, 0.075, 0.14, 0, 0.605, 0)),
  // CASCO: de obra.
  merge(bx(0.3, 0.08, 0.3, 0, 0.325, 0), bx(0.26, 0.05, 0.26, 0, 0.39, 0), bx(0.06, 0.03, 0.3, 0, 0.425, 0, T1), bx(0.34, 0.025, 0.4, 0, 0.285, 0.03, T1), bx(0.08, 0.05, 0.02, 0, 0.34, 0.152, W)),
  // OREJAS DE ELFA (del color de la piel)
  merge(elfEar(1), elfEar(-1)),
];
/** Accesorios con color propio; el resto toma el COLOR DE LOS ACCESORIOS del personaje. */
const ACC_COLOR: Record<number, string> = { 3: '#0f1217', 5: '#ffe600', 6: '#b08a5a', 11: '#ffe600', 13: '#ff7a3c', 14: '#ffe600' };
/** Cuánto sobresale de la cabeza (para colgar el nombre arriba). */
const ACC_TOP: Record<number, number> = { 5: 0.26, 8: 0.3, 13: 0.42, 15: 0.04 };

const EYE_Y = 0.18, MOUTH_Y = 0.08;
/** Una malla por opción de LOOK.anteojos. */
const GLASSES_GEOS: (THREE.BufferGeometry | null)[] = [
  null,
  // OSCUROS: dos vidrios, puente, patillas y un brillito.
  merge(...pair(0.11, 0.07, 0.03, 0.068, EYE_Y, 0.137), bx(0.04, 0.02, 0.03, 0, EYE_Y + 0.015, 0.137), ...pair(0.015, 0.02, 0.15, 0.138, EYE_Y + 0.015, 0.06), ...pair(0.03, 0.015, 0.01, 0.085, EYE_Y + 0.015, 0.15, W)),
  // RAVE: envolventes, con marco negro.
  merge(bx(0.29, 0.055, 0.035, 0, EYE_Y, 0.137), bx(0.29, 0.015, 0.04, 0, EYE_Y + 0.035, 0.137, K), ...pair(0.02, 0.035, 0.16, 0.142, EYE_Y + 0.01, 0.055, K), bx(0.06, 0.012, 0.01, -0.07, EYE_Y + 0.012, 0.156, W)),
  // 3D
  at(faceBox(0.29, 0.08, 0.03), 0, EYE_Y, 0.14),
  // CORAZONES (recortados de una textura)
  at(faceBox(0.32, 0.12, 0.012), 0, EYE_Y, 0.162),
  // ANTIPARRAS: marco de color, vidrio celeste y correa negra.
  merge(...pair(0.115, 0.1, 0.06, 0.068, EYE_Y, 0.145), ...pair(0.08, 0.065, 0.02, 0.068, EYE_Y, 0.18, C), bx(0.28, 0.04, 0.28, 0, EYE_Y, 0, K)),
];
const GLASSES_COLOR: Record<number, string> = { 1: '#0f1217', 3: '#ffffff' };

/** Una malla por opción de LOOK.boca. */
const MOUTH_GEOS: (THREE.BufferGeometry | null)[] = [
  null,
  // CHUPETE: con la manija blanca.
  merge(bx(0.12, 0.07, 0.02, 0, MOUTH_Y, 0.142), bx(0.05, 0.05, 0.03, 0, MOUTH_Y, 0.165, W), ...pair(0.012, 0.05, 0.012, 0.03, MOUTH_Y, 0.19, W), bx(0.07, 0.012, 0.012, 0, MOUTH_Y - 0.025, 0.19, W)),
  // SILBATO
  merge(bx(0.05, 0.04, 0.07, 0, MOUTH_Y, 0.165), bx(0.065, 0.065, 0.05, 0, MOUTH_Y + 0.005, 0.215), bx(0.025, 0.02, 0.025, 0, MOUTH_Y + 0.04, 0.215, K)),
  // BARBIJO: con pliegues y elásticos.
  merge(bx(0.275, 0.12, 0.04, 0, MOUTH_Y + 0.01, 0.145), bx(0.28, 0.012, 0.045, 0, MOUTH_Y + 0.035, 0.145, T1), bx(0.28, 0.012, 0.045, 0, MOUTH_Y - 0.01, 0.145, T1), ...pair(0.012, 0.02, 0.16, 0.14, MOUTH_Y + 0.04, 0.05, W)),
  // CHUPETIN: palito blanco y caramelo con el centro blanco.
  merge(bx(0.016, 0.016, 0.1, 0.03, MOUTH_Y, 0.17, W), bx(0.09, 0.09, 0.03, 0.03, MOUTH_Y, 0.235), bx(0.05, 0.05, 0.036, 0.03, MOUTH_Y, 0.235, W)),
];

// --- Torso --------------------------------------------------------------------------------
// Relativo al piso, con el personaje parado. El torso arranca en la cadera y entra en una caja
// de 0.40 × 0.54 × 0.22 (la ropa, que son cajas, se arma alrededor de esa medida): cintura un
// poco más angosta, esquinas chanfleadas y hombros caídos. El frente es plano: ahí va la estampa.
// Estas mallas usan su misma matriz (se ensanchan con el cuerpo).

const STRAP = 0.62;
const strap = (z: number) => turned(new THREE.BoxGeometry(0.035, 0.66, 0.02), 0, 0, STRAP, 0, HIP_Y + 0.29, z, T2);
/** Ala de hada: dos lóbulos y una punta. */
const fairyWing = (side: 1 | -1) =>
  [
    tint(new THREE.BoxGeometry(0.34, 0.32, 0.015).translate(side * 0.19, 0.14, 0), T0),
    tint(new THREE.BoxGeometry(0.14, 0.2, 0.015).translate(side * 0.42, 0.22, 0), T1),
    tint(new THREE.BoxGeometry(0.24, 0.24, 0.015).translate(side * 0.14, -0.15, 0), T1),
    tint(new THREE.BoxGeometry(0.1, 0.12, 0.015).translate(side * 0.3, -0.23, 0), T0),
  ].map((g) => at(g.rotateY(side * 0.5), side * 0.03, HIP_Y + 0.36, -0.125));
/** Ala de ángel: un hueso arriba y plumas de distinto largo colgando, en dos capas. */
const FEATHERS = [0.3, 0.44, 0.54, 0.46, 0.34, 0.2];
const angelWing = (side: 1 | -1) =>
  [
    tint(new THREE.BoxGeometry(0.62, 0.1, 0.04).translate(side * 0.31, 0.3, 0), T0),
    ...FEATHERS.map((len, k) => tint(new THREE.BoxGeometry(0.1, len, 0.025).translate(side * (0.06 + k * 0.1), 0.26 - len / 2, 0), k % 2 ? T1 : T0)),
    ...FEATHERS.slice(0, 5).map((len, k) => tint(new THREE.BoxGeometry(0.1, len * 0.5, 0.03).translate(side * (0.11 + k * 0.1), 0.26 - len * 0.25, 0.012), T2)),
  ].map((g) => at(g.rotateZ(side * 0.3).rotateY(side * 0.45), side * 0.04, HIP_Y + 0.3, -0.13));
/** Una malla por opción de LOOK.encima. */
const OVER_GEOS: (THREE.BufferGeometry | null)[] = [
  null,
  // CADENA: con medallón.
  merge(...pair(0.03, 0.16, 0.02, 0.09, HIP_Y + 0.46, 0.118), bx(0.21, 0.03, 0.02, 0, HIP_Y + 0.37, 0.118, T1), bx(0.09, 0.09, 0.03, 0, HIP_Y + 0.3, 0.125), bx(0.04, 0.04, 0.035, 0, HIP_Y + 0.3, 0.127, R)),
  // RIÑONERA cruzada: correa oscura, cierre y hebilla.
  merge(
    strap(0.12),
    strap(-0.12),
    turned(new THREE.BoxGeometry(0.22, 0.11, 0.07), 0, 0, STRAP - Math.PI / 2, 0, HIP_Y + 0.29, 0.155),
    turned(new THREE.BoxGeometry(0.19, 0.014, 0.075), 0, 0, STRAP - Math.PI / 2, 0, HIP_Y + 0.29, 0.156, K),
    turned(new THREE.BoxGeometry(0.04, 0.05, 0.03), 0, 0, STRAP, -0.13, HIP_Y + 0.47, 0.125, G),
  ),
  // MOCHILA: con bolsillo, cierre y correas oscuras.
  merge(
    bx(0.3, 0.36, 0.13, 0, HIP_Y + 0.31, -0.18),
    bx(0.22, 0.14, 0.04, 0, HIP_Y + 0.22, -0.26, T1),
    bx(0.305, 0.02, 0.135, 0, HIP_Y + 0.42, -0.18, K),
    ...pair(0.05, 0.36, 0.02, 0.13, HIP_Y + 0.37, 0.118, T2),
    ...pair(0.05, 0.02, 0.24, 0.13, NECK_Y + 0.008, 0, T2),
  ),
  // ALAS (de hada)
  merge(...fairyWing(1), ...fairyWing(-1)),
  // CAPA: con cuello levantado, ruedo más oscuro y broche.
  merge(bx(0.44, 0.8, 0.02, 0, HIP_Y + 0.14, -0.135), bx(0.46, 0.06, 0.025, 0, HIP_Y - 0.23, -0.137, T1), bx(0.44, 0.04, 0.26, 0, NECK_Y - 0.02, 0), bx(0.3, 0.1, 0.03, 0, NECK_Y + 0.04, -0.13, T1), bx(0.05, 0.05, 0.02, 0, NECK_Y - 0.03, 0.135, Y)),
  // ALAS DE ANGEL (del color de LOOK.alas)
  merge(...angelWing(1), ...angelWing(-1)),
];
const OVER_COLOR: Record<number, string> = { 1: '#ffe600' };
const ALAS_ANGEL = 6;

/** Lo que va arriba del torso según LOOK.arriba (el resto de las prendas son solo colores). */
const TOP_GEOS: (THREE.BufferGeometry | null)[] = LOOK.arriba.map((_, i) =>
  i === TOP
    ? // La panza al aire: sigue la forma de la cintura (apenas más grande que el torso, para
      // taparlo). Una caja recta alrededor de la cintura angosta quedaba de panza.
      tint(at(loft([[0.015, 0.2, 0.116, -0.11, 0.042], [0.215, 0.189, 0.116, -0.106, 0.042]], [0, 0, 1, 1]), 0, HIP_Y, 0), T0)
    : i === ARNES
      ? merge(bx(0.42, 0.045, 0.24, 0, HIP_Y + 0.35, 0), ...pair(0.045, 0.2, 0.24, 0.1, HIP_Y + 0.445, 0), bx(0.09, 0.09, 0.02, 0, HIP_Y + 0.35, 0.127, G), bx(0.045, 0.045, 0.022, 0, HIP_Y + 0.35, 0.128, K))
      : i === CHALECO
        ? // Con las bandas reflectivas grises.
          merge(
            ...pair(0.15, 0.46, 0.02, 0.13, HIP_Y + 0.3, 0.12),
            bx(0.42, 0.46, 0.02, 0, HIP_Y + 0.3, -0.12),
            ...pair(0.15, 0.02, 0.26, 0.13, NECK_Y, 0),
            ...pair(0.02, 0.3, 0.24, 0.21, HIP_Y + 0.22, 0),
            ...pair(0.152, 0.04, 0.022, 0.13, HIP_Y + 0.2, 0.121, G),
            bx(0.425, 0.04, 0.022, 0, HIP_Y + 0.2, -0.121, G),
            ...pair(0.04, 0.3, 0.022, 0.13, HIP_Y + 0.37, 0.121, G),
          )
        : i === VESTIDO
          ? // La pollera del vestido, en dos tramos que se abren (va del color de la prenda).
            merge(bx(0.44, 0.2, 0.27, 0, HIP_Y - 0.05, 0), bx(0.5, 0.2, 0.33, 0, HIP_Y - 0.23, 0, T1), bx(0.53, 0.04, 0.36, 0, HIP_Y - 0.35, 0, T2))
          : null,
);

/** Polleras según LOOK.abajo. */
const SKIRT_GEOS: (THREE.BufferGeometry | null)[] = LOOK.abajo.map((_, i) =>
  i === POLLERA
    ? merge(bx(0.44, 0.06, 0.27, 0, HIP_Y + 0.02, 0, T2), bx(0.46, 0.1, 0.3, 0, HIP_Y - 0.05, 0), bx(0.5, 0.12, 0.34, 0, HIP_Y - 0.15, 0, T1))
    : i === TUTU
      ? merge(bx(0.44, 0.05, 0.28, 0, HIP_Y + 0.02, 0, T2), bx(0.6, 0.04, 0.44, 0, HIP_Y - 0.02, 0), bx(0.72, 0.04, 0.56, 0, HIP_Y - 0.06, 0, T1), bx(0.6, 0.04, 0.44, 0, HIP_Y - 0.1, 0))
      : null,
);

// --- Manos y pies -------------------------------------------------------------------------
// Relativo al codo o a la rodilla: la parte de abajo cuelga hacia -y, con la mano o el pie en la punta.
const HAND_Y = -FORE - 0.045;
/** Una malla por opción de LOOK.mano. */
const HAND_GEOS: (THREE.BufferGeometry | null)[] = [
  null,
  // PALITOS DE LUZ
  bx(0.03, 0.03, 0.36, 0, HAND_Y, 0.1),
  // ABANICO: cinco varillas abiertas.
  merge(...[-2, -1, 0, 1, 2].map((k) => tint(at(new THREE.BoxGeometry(0.075, 0.3, 0.015).translate(0, -0.15, 0).rotateZ(k * 0.3), 0, HAND_Y - 0.02, k * 0.004), k % 2 ? T1 : T0))),
  // AGUA: botellita con etiqueta y tapa azul.
  merge(bx(0.075, 0.2, 0.075, 0, HAND_Y + 0.02, 0.085), bx(0.08, 0.06, 0.08, 0, HAND_Y + 0.02, 0.085, W), bx(0.04, 0.04, 0.04, 0, HAND_Y + 0.14, 0.085, B)),
  // PULSERAS: de colores, una arriba de la otra.
  merge(bx(0.11, 0.025, 0.11, 0, -FORE + 0.02, 0), bx(0.11, 0.025, 0.11, 0, -FORE + 0.05, 0, Y), bx(0.11, 0.025, 0.11, 0, -FORE + 0.08, 0, C), bx(0.11, 0.025, 0.11, 0, -FORE + 0.11, 0, P)),
  // GUANTES (es solo el color de la mano)
  null,
];
/**
 * El celu de la gente de la fila: no es una opción del creador (va después de todas las de
 * LOOK.mano). La pantalla queda del lado de la cara cuando el brazo está doblado hacia arriba.
 */
export const CELU = HAND_GEOS.length;
HAND_GEOS.push(merge(bx(0.075, 0.15, 0.016, 0, HAND_Y - 0.035, 0.06, K), bx(0.06, 0.125, 0.006, 0, HAND_Y - 0.035, 0.07, W)));
/** El pucho del que fuma en la fila: blanco, con la brasa en la punta. */
export const PUCHO = HAND_GEOS.length;
/** Cuántos pueden estar fumando o tomando a la vez (los que sobran lo hacen igual, pero sin nada en la mano). */
const PROPS = 40;
HAND_GEOS.push(merge(bx(0.016, 0.016, 0.075, 0.03, HAND_Y - 0.02, 0.085, W), bx(0.018, 0.018, 0.018, 0.03, HAND_Y - 0.02, 0.13, R)));
/** Lo que va en las dos manos; el resto, solo en la derecha. */
const BOTH_HANDS = new Set([1, 4]);
const HAND_COLOR: Record<number, string> = { 3: '#9ad8ff' };

/** Mano con el pulgar aparte. */
const HAND_GEO = () => merge(bx(0.095, 0.095, 0.1, 0, HAND_Y, 0), bx(0.035, 0.05, 0.04, 0, HAND_Y + 0.015, 0.065, T1));
/** Calzado: zapatilla (suela y puntera blancas), plataforma (suela negra con raya) y pie descalzo. */
const SHOE_GEOS = [
  merge(bx(0.14, 0.05, 0.25, 0, -SHIN - 0.025, 0.045), bx(0.15, 0.025, 0.26, 0, -SHIN - SHOE + 0.0125, 0.045, W), bx(0.142, 0.03, 0.06, 0, -SHIN - 0.03, 0.142, W)),
  merge(bx(0.14, 0.06, 0.25, 0, -SHIN - 0.03, 0.045), bx(0.155, SHOE + PLATFORM - 0.06, 0.27, 0, -SHIN - 0.06 - (SHOE + PLATFORM - 0.06) / 2, 0.045, K), bx(0.158, 0.02, 0.273, 0, -SHIN - 0.1, 0.045, W)),
  merge(bx(0.13, SHOE, 0.2, 0, -SHIN - SHOE / 2, 0.03), bx(0.13, 0.04, 0.06, 0, -SHIN - SHOE + 0.02, 0.155, T1)),
];

/** Qué malla de SHOE_GEOS usa cada opción de LOOK.calzado. */
const SHOE_MESH = [0, 1, 0, 2];

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
  /** Lo que dice cuando lo tocan ('' = nada). */
  phrase: string;
  /** Altura de la cabeza en el último frame (para los cartelitos). */
  headY: number;
  id: string;
  /** Paseo por la pista (ver `Crowd.roam`): adónde va y cuánto falta para que elija otro lado. */
  tx: number;
  tz: number;
  wait: number;
  /** Con quién fue a bailar (su lugar en la lista; -1 = solo): parado al lado, lo mira. */
  buddy: number;
  /** Cada uno a su manera: para dónde tuerce el cuerpo cuando mira a la cabina y qué tan inquieto es. */
  bias: number;
  pace: number;
  /** Caminar: cuánto del cuerpo va caminando en vez de bailando (0–1) y por dónde va el ciclo de pasos. */
  walk: number;
  stride: number;
  /** Por dónde tiene que pasar para llegar adonde va (la escalera, la esquina del palco...). */
  path: Spot[];
  /** Cuánto hace que quiere caminar y no avanza (para que no se quede empujando una pared). */
  stall: number;
  /** Lo que está haciendo además de bailar (ver `action` en dances.ts; 0 = nada) y hace cuánto. */
  act: number;
  actT: number;
  /** Cuánto falta para que le pinte hacer algo por su cuenta. */
  mood: number;
}

type Spot = { x: number; z: number };

/** A qué velocidad camina el raro que maneja el visitante (m/s): bastante más rápido que los que pasean. */
const MY_SPEED = 2.3;
/** Largo de un paso (metros): el del visitante camina de verdad, los que pasean van arrastrando los pies. */
const MY_STEP = 0.66, STEP = 0.42;

/** Diferencia entre dos ángulos por el lado más corto. */
const turnTo = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/**
 * Por dónde se puede andar: todo el boliche menos la cabina (con sus parlantes). Abajo queda la
 * pista de atrás, los dos pasillos de los costados y el frente de la cabina; arriba, los palcos
 * y, más arriba, el segundo piso.
 * `end` es hasta dónde llegan solos hacia la entrada, y `far` hasta dónde se puede ir (ahí
 * arrancan las escaleras).
 */
const FLOOR = { halfW: CLUB.halfW - 0.55, back: CLUB.backZ + 0.45, front: -0.45, aisle: 4.4, boothFront: 3.2, end: 4.9, far: 6.7 };
/** Hasta dónde se puede arrimar uno a la cabina desde la pista: justo atrás de los DJs, con lugar para que bailen. */
const BOOTH_BACK = CLUB.djZ - 0.75;
/** Bordes de los palcos: de `SIDE` para afuera y de `REAR` para atrás, el piso está arriba. */
const SIDE = CLUB.halfW - ARM, REAR = CLUB.backZ + PALCO.deep;
/** El segundo piso: de `UP` para afuera (hasta `PISO2.frontZ`), más alto todavía. Y hasta dónde llega a lo ancho el palco del fondo. */
const UP = CLUB.halfW - PISO2.deep, REAR_HALF = UP - 0.5;
/** La pista de abajo, entre los palcos. */
const PIT = { halfW: SIDE - 0.5, back: REAR + 0.5 };
/** El escalón más alto que se sube caminando: del piso al palco solo se pasa por la escalera. */
const STEP_UP = 0.3;
/** Aire que se dejan entre ellos, además del ancho de cada uno: no se pisan ni con los brazos. */
const GAP = 0.2;
/** Saca un punto de adentro de la cabina (al borde que tenga más cerca) y de afuera del boliche. */
function offBooth(p: Spot) {
  p.x = Math.max(-FLOOR.halfW, Math.min(FLOOR.halfW, p.x));
  p.z = Math.max(FLOOR.back, Math.min(FLOOR.far, p.z));
  if (p.z <= BOOTH_BACK || p.z >= FLOOR.boothFront || Math.abs(p.x) >= FLOOR.aisle) return;
  const toBack = p.z - BOOTH_BACK, toFront = FLOOR.boothFront - p.z, toSide = FLOOR.aisle - Math.abs(p.x);
  if (toSide <= toBack && toSide <= toFront) p.x = Math.sign(p.x || 1) * FLOOR.aisle;
  else p.z = toBack < toFront ? BOOTH_BACK : FLOOR.boothFront;
}

// --- Caminos: cómo se llega de un lugar a otro cuando hay que subir o bajar ---------------
/** ¿Está arriba, en un palco? (En la escalera cuenta desde la mitad para arriba.) */
const high = (p: Spot) => floorAt(p.x, p.z) > PALCO.h / 2;
/** En qué parte del palco: -1 o 1 = el brazo de ese lado, 0 = el fondo. */
const arm = (p: Spot) => (p.z <= REAR ? 0 : Math.sign(p.x));
const stairTop = (s: number): Spot => ({ x: s * (SIDE + PALCO.deep / 2), z: PALCO.frontZ - 0.5 });
const stairFoot = (s: number): Spot => ({ x: s * (SIDE + PALCO.deep / 2), z: PALCO.frontZ + PALCO.stairs + 0.5 });
const corner = (s: number): Spot => ({ x: s * (SIDE + PALCO.deep / 2), z: REAR - PALCO.deep / 2 });
/** El pasillo de al lado de la cabina: frente al pie de la escalera (se la encara de frente, no por el costado) y a la altura de la pista. */
const aisleFront = (s: number): Spot => ({ x: s * (SIDE - 1.4), z: PALCO.frontZ + PALCO.stairs + 0.2 });
const aisleBack = (s: number): Spot => ({ x: s * 6.6, z: -0.3 });

/** ¿Está en el segundo piso? (En su escalera cuenta desde la mitad para arriba.) */
const upper = (p: Spot) => floorAt(p.x, p.z) > (PALCO.h + PISO2.h) / 2;
/** La escalera del segundo piso: arriba, abajo (en el descanso) y el palco de al lado del descanso. */
const stair2Top = (s: number): Spot => ({ x: s * (UP + PISO2.deep / 2), z: PISO2.frontZ - 0.4 });
const stair2Foot = (s: number): Spot => ({ x: s * (UP + PISO2.deep / 2), z: PISO2.frontZ + PISO2.stairs + 0.6 });
/** Hasta dónde se queda parada la gente en los palcos de los costados: de ahí a la escalera es lugar de paso. */
const ARM_STAY = PISO2.frontZ + PISO2.stairs - 0.6;
const onStair2 = (p: Spot) => Math.abs(p.x) >= UP && p.z > PISO2.frontZ && p.z < PISO2.frontZ + PISO2.stairs;
const landing = (s: number): Spot => ({ x: s * (SIDE + PALCO.deep / 2), z: PISO2.frontZ + PISO2.stairs + 0.6 });

/**
 * ¿Está `p` al lado de la cabina o adelante, del lado contrario a `s`? De un costado al otro se
 * cruza por atrás de la cabina, no por adelante: ahí está la cámara y le pasarían por la cara.
 */
const across = (s: number, p: Spot) => p.z >= FLOOR.front && p.x * s < -1;

/** Los puntos por los que hay que pasar para ir de `from` a `to` (el último es `to`). */
function route(from: Spot, to: Spot): Spot[] {
  // Al segundo piso se llega por el palco de ese lado: se arma el camino hasta ahí (o desde ahí) y se le suma la escalera.
  const fs = Math.sign(from.x), ts = Math.sign(to.x);
  // El que quedó en la escalera (lo frenaron, cambió de idea) sale por la punta que le sirve, no por el costado.
  if (onStair2(from)) return upper(to) && !onStair2(to) && ts === fs ? [stair2Top(fs), to] : [stair2Foot(fs), landing(fs), ...route(landing(fs), to)];
  if (upper(from)) {
    if (upper(to) && ts === fs) return [to];
    return [stair2Top(fs), stair2Foot(fs), landing(fs), ...route(landing(fs), to)];
  }
  if (upper(to) || onStair2(to)) return [...route(from, landing(ts)), stair2Foot(ts), ...(onStair2(to) ? [] : [stair2Top(ts)]), to];
  const up = high(from), goesUp = high(to);
  const out: Spot[] = [];
  if (up && goesUp) {
    // Por arriba: de un brazo al fondo o al otro brazo se dobla en las esquinas.
    const a = arm(from), b = arm(to);
    if (a !== b) {
      if (a) out.push(corner(a));
      if (b) out.push(corner(b));
    }
  } else if (up) {
    // Bajar: por la escalera del lado que quede más a mano.
    const s = arm(from) || Math.sign(to.x || from.x || 1);
    if (!arm(from)) out.push(corner(s));
    out.push(stairTop(s), stairFoot(s), aisleFront(s));
    if (to.z < FLOOR.front) out.push(aisleBack(s));
    else if (across(s, to)) out.push(aisleBack(s), aisleBack(-s));
  } else if (goesUp) {
    const s = arm(to) || Math.sign(from.x || to.x || 1);
    if (across(s, from)) out.push(aisleBack(-s), aisleBack(s));
    else if (from.z < FLOOR.front) out.push(aisleBack(s));
    out.push(aisleFront(s), stairFoot(s), stairTop(s));
    if (!arm(to)) out.push(corner(s));
  } else if (from.z >= FLOOR.front && across(Math.sign(from.x), to)) {
    out.push(aisleBack(Math.sign(from.x)), aisleBack(Math.sign(to.x)));
  }
  out.push(to);
  return out;
}

/** Separación entre lugares: a lo ancho y entre filas (van intercaladas). */
const SLOT_X = 0.88, SLOT_Z = 0.72;

/** Lugares del boliche, del más visible (centro de la pista, adelante) al menos. */
function makeSlots(): Spot[] {
  let seed = 11;
  const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const slots: { x: number; z: number; score: number }[] = [];
  const rows = Math.floor((-0.55 - PIT.back) / SLOT_Z) + 1, wide = Math.floor(PIT.halfW / SLOT_X);
  for (let row = 0; row < rows; row++) {
    const z = -0.55 - row * SLOT_Z;
    const n = row % 2 ? wide - 0.5 : wide;
    for (let i = -n; i <= n; i++) {
      const x = i * SLOT_X;
      const first = row === 0 && i === 0;
      slots.push({ x: first ? 0 : x + (r() - 0.5) * 0.12, z: first ? z : z + (r() - 0.5) * 0.1, score: Math.abs(x) * 0.55 + row * 0.62 });
    }
  }
  // A los costados de la cabina.
  for (const z of [0.35, 1.2, 2.05, 2.9]) {
    for (let i = 0; i < 6; i++) {
      for (const side of [1, -1]) slots.push({ x: side * (4.55 + i * SLOT_X + (r() - 0.5) * 0.1), z: z + (r() - 0.5) * 0.1, score: 3 + i * 0.6 + z * 0.3 });
    }
  }
  // Arriba: el fondo y los dos brazos.
  for (let row = 0; row < 3; row++) {
    for (let x = -REAR_HALF; x <= REAR_HALF; x += 0.92) slots.push({ x: x + (r() - 0.5) * 0.1, z: FLOOR.back + 0.2 + row * 0.8, score: 9 + row * 0.3 + Math.abs(x) * 0.1 });
  }
  for (let col = 0; col < 3; col++) {
    for (let z = REAR + 0.5; z <= ARM_STAY; z += 0.85) {
      for (const side of [1, -1]) slots.push({ x: side * (SIDE + 0.6 + col * 0.85), z: z + (r() - 0.5) * 0.1, score: 11 + col * 0.3 + z * 0.1 });
    }
  }
  // Y el segundo piso, contra las paredes.
  for (let col = 0; col < 2; col++) {
    for (let z = FLOOR.back + 0.3; z <= PISO2.frontZ - 0.6; z += 0.85) {
      for (const side of [1, -1]) slots.push({ x: side * (UP + 0.7 + col * 0.95), z: z + (r() - 0.5) * 0.1, score: 13 + col * 0.3 + (z - FLOOR.back) * 0.1 });
    }
  }
  return slots.sort((a, b) => a.score - b.score);
}

/** Pasos que se bailan con los brazos abiertos: necesitan más lugar. */
const WIDE_DANCES = new Set([9, 11]);

/** Medio ancho que ocupa un raro en la pista (hombros y brazos, según el cuerpo y el paso). */
function reach(l: Look) {
  const b = BUILDS[l.cuerpo] ?? BUILDS[0];
  return (0.2 * b.w + 0.11 * b.limb + 0.04 + (WIDE_DANCES.has(l.baile) ? 0.2 : 0)) * b.h;
}

/**
 * Separa a los que quedaron encimados (los anchos, los de brazos abiertos): se empujan de a
 * pares, sin alejarse mucho de su lugar. El primero no se mueve: es el del visitante.
 */
function spread(dancers: Dancer[], slots: { x: number; z: number }[]) {
  const MAX = 0.26;
  const radius = dancers.map((d) => reach(d.look));
  for (let pass = 0; pass < 10; pass++) {
    for (let i = 0; i < dancers.length; i++) {
      for (let j = i + 1; j < dancers.length; j++) {
        const a = dancers[i], b = dancers[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const min = radius[i] + radius[j];
        const dist = Math.hypot(dx, dz);
        if (dist >= min || dist === 0) continue;
        // Los cuerpos son chatos: adelante y atrás alcanza con menos lugar que a los costados.
        const push = (min - dist) / dist, ka = i === 0 ? 0 : 0.5, kb = i === 0 ? 1 : 0.5;
        a.x -= dx * push * ka;
        a.z -= dz * push * ka * 0.5;
        b.x += dx * push * kb;
        b.z += dz * push * kb * 0.5;
      }
    }
    dancers.forEach((d, i) => {
      d.x = Math.max(slots[i].x - MAX, Math.min(slots[i].x + MAX, d.x));
      d.z = Math.max(slots[i].z - MAX, Math.min(slots[i].z + MAX, d.z));
    });
  }
}

export class Crowd {
  readonly group = new THREE.Group();
  /** Hacia dónde mira el personaje cuando se lo muestra solo; null = gira despacio solo. */
  spin: number | null = null;
  /** Los bailarines pasean por la pista (solo el boliche: la fila de afuera y el exportador, no). */
  roam = false;
  /** El primero de la lista es el raro del visitante y lo maneja él (ver `walkTo`). */
  mine = false;
  /** El raro del visitante está caminando en este momento. */
  walking = false;
  private hadMine = false;
  /** Velocidad del raro del visitante: arranca y frena de a poco, no de golpe. */
  private vel = { x: 0, z: 0 };
  private radius: number[] = [];
  private slots = makeSlots();
  private dancers: Dancer[] = [];
  private solo = false;
  /** El drop (0–1): la pista levanta las manos y salta. Lo pone el boiler cuando el set está analizado. */
  hype = 0;
  private cigs: THREE.InstancedMesh;
  private bottles: THREE.InstancedMesh;
  private puffs: THREE.InstancedMesh;
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
    // Casi todo usa un solo material con la paleta de detalle (tonos del color + colores fijos).
    const detail = makeDetailTexture();
    const plain = makePSXMaterial({ map: detail, detail: true });
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

    this.thighs = mesh(hang(0.155, THIGH, 0.175, 0.84), capacity * 2);
    this.shins = mesh(hang(0.13, SHIN, 0.15, 0.78), capacity * 2);
    this.upperArms = mesh(hang(0.115, UPPER, 0.115, 0.86), capacity * 2);
    this.foreArms = mesh(hang(0.1, FORE, 0.1, 0.8), capacity * 2);
    // La mano y el calzado van pegados al antebrazo y a la canilla: usan su misma matriz.
    this.hands = mesh(HAND_GEO(), capacity * 2);
    this.shoes = parts(SHOE_GEOS, undefined, capacity * 2);

    const torsoGeo = () =>
      at(
        loft(
          [
            [0, 0.195, 0.11, -0.105, 0.04],
            [0.2, 0.183, 0.11, -0.1, 0.04],
            [0.4, 0.2, 0.11, -0.11, 0.045],
            [TORSO - 0.045, 0.2, 0.11, -0.11, 0.045],
            [TORSO, 0.165, 0.095, -0.095, 0.04],
          ],
          [-0.2, 0, 0.4, TORSO],
        ),
        0,
        HIP_Y,
        0,
      );
    this.torsos = parts(LOOK.estampa.map(torsoGeo), (i) => makePSXMaterial(i ? { map: makePrintTexture(i - 1), decal: true } : {}));
    const faces = LOOK.cara.map((_, i) => makePSXMaterial({ map: makeFaceTexture(i) }));
    this.heads = parts(LOOK.cara.map(headGeo), (i) => faces[i]);
    this.hair = parts(HAIR_GEOS);
    this.acc = parts(ACC_GEOS, (i) => (i === CAJA ? faces[3] : plain));
    this.glasses = parts(GLASSES_GEOS, (i) => (i === 3 ? makePSXMaterial({ map: make3DGlassesTexture() }) : i === 4 ? makePSXMaterial({ map: makeHeartGlassesTexture() }) : plain));
    this.mouth = parts(MOUTH_GEOS);
    this.over = parts(OVER_GEOS);
    this.tops = parts(TOP_GEOS);
    this.skirts = parts(SKIRT_GEOS);
    // Los palitos de luz no llevan sombra: brillan.
    const glow = makePSXMaterial({ map: detail, detail: true, lit: false });
    this.held = parts(HAND_GEOS, (i) => (i === 1 || i === CELU || i === PUCHO ? glow : plain), capacity * 2);
    this.parts = [this.shoes, this.torsos, this.heads, this.hair, this.acc, this.glasses, this.mouth, this.over, this.tops, this.skirts, this.held];
    // Lo de las acciones: el pucho y la botella (para cualquiera, tenga lo que tenga en la mano) y el humo.
    // El pucho de fumar no es el que se lleva de adorno: va suelto, a lo largo de +z, con la brasa
    // atrás y el filtro adelante, y en cada frame se lo apunta de la mano a la boca (ver `update`).
    this.cigs = mesh(merge(bx(0.017, 0.017, 0.1, 0, 0, 0.045, W), bx(0.018, 0.018, 0.03, 0, 0, 0.11, Y), bx(0.021, 0.021, 0.022, 0, 0, -0.016, R)), PROPS, glow);
    // La botella también va suelta: el pico en el origen y el cuerpo hacia -z, y en cada frame se la
    // lleva de la mano a la boca y se la empina (ver `update`).
    this.bottles = mesh(merge(bx(0.06, 0.06, 0.17, 0, 0, -0.12, C), bx(0.064, 0.064, 0.05, 0, 0, -0.13, W), bx(0.03, 0.03, 0.036, 0, 0, -0.018, W)), PROPS);
    this.puffs = mesh(new THREE.BoxGeometry(1, 1, 1), PROPS * 3, makePSXMaterial({ color: '#d9d2e6', lit: false, opacity: 0.5 }));
  }

  get count() {
    return this.dancers.length;
  }

  /** Quiénes bailan. El primero de la lista va al mejor lugar (ahí va el del visitante). */
  setDancers(list: Raro[]) {
    let seed = 99;
    const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const before = new Map(this.dancers.map((d) => [d.id, d]));
    const first = this.dancers[0];
    this.dancers = list.slice(0, Math.min(this.capacity, this.slots.length)).map((raro, i) => {
      const bias = (r() - 0.5) * 0.5;
      return {
        x: this.slots[i].x,
        z: this.slots[i].z,
        yaw: bias,
        bias,
        pace: 0.7 + r() * 0.7,
        buddy: -1,
        walk: 0,
        stride: r() * 6,
        phase: r() * 10,
        look: raro.look,
        vary: 0.96 + r() * 0.08,
        name: raro.name,
        phrase: raro.phrase ?? '',
        headY: 1.7,
        id: raro.id,
        tx: this.slots[i].x,
        tz: this.slots[i].z,
        wait: r() * 8,
        path: [],
        stall: 0,
        act: 0,
        actT: 0,
        mood: 6 + r() * 80,
      };
    });
    spread(this.dancers, this.slots);
    this.radius = this.dancers.map((d) => reach(d.look));
    if (this.roam) {
      this.dancers.forEach((d, i) => {
        if (i === 0) {
          // El del visitante sigue parado donde lo dejó (aunque le hayan cambiado la ropa).
          if (first && this.mine && this.hadMine) Object.assign(d, { x: first.x, z: first.z, tx: first.x, tz: first.z, yaw: first.yaw });
          return;
        }
        const was = before.get(d.id);
        // Los que ya andaban paseando siguen donde estaban (si no, pegarían un salto a su lugar).
        if (was) return void Object.assign(d, { x: was.x, z: was.z, tx: was.tx, tz: was.tz, wait: was.wait, yaw: was.yaw, path: was.path });
        // Los demás arrancan repartidos por todo el boliche, no formados en filas, y cada uno
        // sale a pasear a su tiempo.
        const at = this.pick(d, i, false);
        d.x = d.tx = at.x;
        d.z = d.tz = at.z;
        d.path = [];
        d.yaw = this.facing(d);
        d.wait = Math.random() * 14;
      });
      for (let pass = 0; pass < 12; pass++) this.separate(null, 0);
    }
    this.hadMine = this.mine;
    this.paint();
  }

  /** Manda a un bailarín a un punto, pasando por donde haga falta (la escalera, la esquina del palco). */
  private send(d: Dancer, to: Spot) {
    d.path = route(d, to);
    const next = d.path.shift()!;
    d.tx = next.x;
    d.tz = next.z;
  }

  /** Manda al raro del visitante a caminar hasta un punto del boliche (lo más cerca que se pueda): sube y baja solo. */
  walkTo(x: number, z: number) {
    const d = this.dancers[0];
    if (!d || !this.mine) return;
    const p = { x, z };
    offBooth(p);
    this.send(d, p);
  }

  /**
   * Lo lleva en una dirección (teclado o palanca): hay que llamarlo en cada frame mientras se aprieta.
   * @param power cuánto se lleva la palanca (0–1): a fondo camina a su paso; con menos, más despacio.
   */
  steer(dx: number, dz: number, power = 1) {
    const d = this.dancers[0], len = Math.hypot(dx, dz);
    if (!d || !len || !this.mine) return;
    // El destino va siempre un par de pasos adelante: así camina a velocidad pareja, también en
    // diagonal. Con las teclas va derecho: la escalera hay que encararla. Con la palanca a medias
    // el destino queda más cerca, y como al llegar afloja, va más lento.
    const ahead = power > 0.95 ? 1.6 : 0.55 * Math.max(0.35, power);
    const p = { x: d.x + (dx / len) * ahead, z: d.z + (dz / len) * ahead };
    offBooth(p);
    d.path = [];
    d.tx = p.x;
    d.tz = p.z;
  }

  /** Se soltaron las teclas: frena ahí nomás (un pasito más, por el envión). */
  halt() {
    const d = this.dancers[0];
    if (!d) return;
    d.path = [];
    d.tx = d.x + this.vel.x * 0.12;
    d.tz = d.z + this.vel.z * 0.12;
  }

  /**
   * El bailarín `i` hace algo (fuma, toma agua, saluda, salta). Si el que saluda es el del
   * visitante, el que tenga más cerca se da vuelta y le devuelve el saludo.
   */
  act(i: number, kind: number) {
    const d = this.dancers[i];
    if (!d || !ACTION_SECONDS[kind]) return;
    d.act = kind;
    d.actT = 0;
    if (i !== 0 || !this.mine || kind !== SALUDO) return;
    let near = -1, best = 3.4;
    for (let j = 1; j < this.dancers.length; j++) {
      const o = this.dancers[j];
      const far = Math.hypot(o.x - d.x, o.z - d.z);
      if (far < best && Math.abs(floorAt(o.x, o.z) - floorAt(d.x, d.z)) < 0.7 && !o.act) {
        best = far;
        near = j;
      }
    }
    if (near < 0) return;
    const o = this.dancers[near];
    // Tarda un cachito en reaccionar; mientras tanto lo mira y se queda donde está.
    Object.assign(o, { act: SALUDO, actT: -0.7, buddy: 0, path: [], tx: o.x, tz: o.z, wait: Math.max(o.wait, 5) });
  }

  /** Dónde está parado el bailarín `i` (`y` = altura del piso ahí: 0 en la pista, más arriba en un palco). */
  spot(i = 0) {
    const d = this.dancers[i];
    return d ? { x: d.x, z: d.z, y: this.roam ? floorAt(d.x, d.z) : 0 } : null;
  }

  /**
   * Elige adónde va a ir y lo manda: a la pista, a un palco, a un costado, al frente de la cabina
   * o a bailar con alguien. Devuelve el lugar elegido.
   */
  private pick(d: Dancer, i: number, social = true): Spot {
    const ds = this.dancers;
    // Con poca gente no se desparraman por todo el boliche (quedaría desierto): se quedan en
    // la pista, cerca de la cabina, y recién cuando se va llenando ocupan el fondo y los palcos.
    const fill = Math.min(1, ds.length / 120), upstairs = 0.45 * fill * fill;
    const where = Math.random();
    const to = { x: 0, z: 0 };
    d.buddy = -1;
    if (social && where < 0.2 && ds.length > 2) {
      // Se le para al lado a otro (puede ser el del visitante) y bailan enfrentados.
      let j = Math.floor(Math.random() * ds.length);
      if (j === i) j = (j + 1) % ds.length;
      const a = Math.random() * Math.PI * 2;
      d.buddy = j;
      to.x = ds[j].x + Math.cos(a) * 0.9;
      to.z = ds[j].z + Math.sin(a) * 0.9;
    } else if (where < 0.88 - upstairs) {
      to.x = (Math.random() * 2 - 1) * PIT.halfW * (0.38 + 0.62 * fill);
      to.z = FLOOR.front - Math.random() * (FLOOR.front - PIT.back) * (0.5 + 0.5 * fill);
    } else if (where < 0.88 - upstairs * 0.6) {
      // Arriba, al fondo: la tribuna de abajo de la tele.
      to.x = (Math.random() * 2 - 1) * REAR_HALF;
      to.z = FLOOR.back + Math.random() * (PALCO.deep - 1.1);
    } else if (where < 0.88 - upstairs * 0.3) {
      // En el segundo piso, mirando todo desde arriba.
      to.x = Math.sign(Math.random() - 0.5) * (UP + 0.6 + Math.random() * (PISO2.deep - 1.2));
      to.z = FLOOR.back + Math.random() * (PISO2.frontZ - 0.6 - FLOOR.back);
    } else if (where < 0.88) {
      // Arriba, en uno de los brazos.
      to.x = Math.sign(Math.random() - 0.5) * (SIDE + 0.55 + Math.random() * (PALCO.deep - 1.2));
      to.z = REAR + Math.random() * (ARM_STAY - REAR);
    } else if (where < 0.95) {
      to.x = Math.sign(Math.random() - 0.5) * (FLOOR.aisle + 0.2 + Math.random() * (PIT.halfW - FLOOR.aisle - 0.2));
      to.z = FLOOR.front + Math.random() * (FLOOR.boothFront - FLOOR.front);
    } else {
      // Al frente, pero no en el medio: ahí taparían la cabina, que es lo que se mira al entrar.
      to.x = Math.sign(Math.random() - 0.5) * (4.6 + Math.random() * (PIT.halfW - 4.6));
      to.z = FLOOR.boothFront + 0.2 + Math.random() * (FLOOR.end - FLOOR.boothFront - 0.2);
    }
    this.send(d, to);
    return to;
  }

  /** Para dónde mira parado: a su compañero de baile si lo tiene al lado; si no, a la cabina, cada uno un poco a su manera. */
  private facing(d: Dancer) {
    const b = d.buddy >= 0 ? this.dancers[d.buddy] : null;
    // (El que está devolviendo un saludo mira al que lo saludó aunque no lo tenga pegado.)
    if (b && Math.hypot(b.x - d.x, b.z - d.z) < (d.act === SALUDO ? 4 : 1.9)) return Math.atan2(b.x - d.x, b.z - d.z);
    return Math.atan2(-d.x * 0.5, CLUB.djZ - d.z) + d.bias;
  }

  private heights: number[] = [];
  /**
   * Nadie se mete adentro de nadie: los que se tocan se separan del todo (varias pasadas, porque
   * al correr a uno se lo puede arrimar a otro o a la cabina). Si alguno venía caminando, además
   * se rodean, siempre para el mismo lado: así dos que van de frente no quedan trabados.
   * Los de arriba y los de abajo no se molestan entre ellos.
   */
  private separate(moving: boolean[] | null, slide: number) {
    const ds = this.dancers, hs = this.heights;
    for (let i = 0; i < ds.length; i++) hs[i] = floorAt(ds[i].x, ds[i].z);
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < ds.length; i++) {
        for (let j = i + 1; j < ds.length; j++) {
          const a = ds[i], b = ds[j];
          const dx = b.x - a.x, dz = b.z - a.z;
          if (Math.abs(dx) > 1.6 || Math.abs(dz) > 1.6 || Math.abs(hs[i] - hs[j]) > 0.7) continue;
          const min = this.radius[i] + this.radius[j] + GAP, dist = Math.hypot(dx, dz) || 0.001;
          if (dist >= min) continue;
          const ux = dx / dist, uz = dz / dist, push = min - dist, ka = i === 0 ? 0 : 0.5, kb = 1 - ka;
          const around = pass === 0 && moving && (moving[i] || moving[j]) ? slide : 0;
          a.x -= (ux * push + -uz * around) * ka;
          a.z -= (uz * push + ux * around) * ka;
          b.x += (ux * push + -uz * around) * kb;
          b.z += (uz * push + ux * around) * kb;
        }
      }
      for (let i = 1; i < ds.length; i++) offBooth(ds[i]);
    }
  }

  /** Dónde estaba cada uno al empezar el frame (x, z) y cuánto quería caminar. */
  private prev: number[] = [];
  private wanted: number[] = [];
  /**
   * Nadie sube ni baja de un salto: si lo que se movió en este frame (caminando o empujado) lo
   * deja a otra altura, se queda con la parte del movimiento que no cambia de nivel. Así el
   * borde del palco y el costado de la escalera funcionan como paredes.
   */
  private keepLevel(dt: number) {
    const ds = this.dancers, prev = this.prev;
    ds.forEach((d, i) => {
      const x0 = prev[i * 2], z0 = prev[i * 2 + 1], h0 = floorAt(x0, z0);
      if (Math.abs(floorAt(d.x, d.z) - h0) > STEP_UP) {
        if (Math.abs(floorAt(d.x, z0) - h0) <= STEP_UP) d.z = z0;
        else if (Math.abs(floorAt(x0, d.z) - h0) <= STEP_UP) d.x = x0;
        else {
          d.x = x0;
          d.z = z0;
        }
      }
      // El que pasea y no avanza (quedó contra un borde o trabado con otro) prueba con otro lado.
      if (i === 0 && this.mine) return;
      const want = this.wanted[i] ?? 0;
      d.stall = want > 0 && Math.hypot(d.x - x0, d.z - z0) < want * 0.3 ? d.stall + dt : 0;
      // (El que va de viaje, con escaleras por delante, aguanta más antes de cambiar de idea.)
      if (d.stall > (d.path.length ? 6 : 2.5)) {
        d.stall = 0;
        // Trabado cerca de un punto de paso (hay gente parada justo ahí): lo da por pasado y sigue viaje.
        // (En una escalera no: ahí el punto que sigue puede quedar del otro lado de un escalón.)
        const next = Math.hypot(d.tx - d.x, d.tz - d.z) < 1.5 && Math.abs(floorAt(d.tx, d.tz) - floorAt(d.x, d.z)) < 0.4 ? d.path.shift() : undefined;
        if (next) return void Object.assign(d, { tx: next.x, tz: next.z });
        d.path = [];
        d.tx = d.x;
        d.tz = d.z;
        d.wait = 0;
      }
    });
  }

  /**
   * Un paso del paseo: cada uno va bailando hasta algún lugar del boliche (mirando para donde
   * camina, subiendo o bajando por la escalera si hace falta), se queda un rato de cara a la
   * cabina o a quien fue a buscar, y elige otro. Los hay inquietos y los hay plantados. Se
   * esquivan entre ellos y no pisan la cabina. El primero, si es el del visitante, no pasea: va
   * adonde lo mandan, y los demás le abren paso.
   */
  wander(dt: number, energy: number) {
    if (!this.roam || this.solo) return;
    const ds = this.dancers;
    const speed = 0.6 * (0.25 + 0.75 * Math.min(1, energy));
    const moving: boolean[] = [false];
    ds.forEach((d, i) => {
      this.prev[i * 2] = d.x;
      this.prev[i * 2 + 1] = d.z;
    });
    // Las acciones corren su tiempo; a los que pasean cada tanto les pinta hacer una, parados.
    ds.forEach((d, i) => {
      if (d.act) {
        d.actT += dt;
        if (d.actT >= ACTION_SECONDS[d.act]) d.act = 0;
      } else if (!(i === 0 && this.mine) && d.walk < 0.1 && (d.mood -= dt) <= 0) {
        const pick = Math.random();
        d.act = pick < 0.34 ? FUMAR : pick < 0.68 ? AGUA : pick < 0.8 ? SALUDO : SALTO;
        d.actT = 0;
        d.mood = 30 + Math.random() * 80;
      }
    });
    const me = ds[0];
    this.walking = false;
    if (this.mine && me) {
      const v = this.vel;
      let dx = me.tx - me.x, dz = me.tz - me.z, far = Math.hypot(dx, dz);
      // Llegó a un punto de paso: sigue al próximo sin frenar.
      if (far < 0.35 && me.path.length) {
        const next = me.path.shift()!;
        me.tx = next.x;
        me.tz = next.z;
        dx = me.tx - me.x;
        dz = me.tz - me.z;
        far = Math.hypot(dx, dz);
      }
      // Va hacia el destino acelerando de a poco, y al llegar afloja en vez de clavarse.
      const want = far > 0.04 ? MY_SPEED * (me.path.length ? 1 : Math.min(1, far / 0.55)) : 0;
      const k = Math.min(1, dt * 9);
      v.x += ((far ? dx / far : 0) * want - v.x) * k;
      v.z += ((far ? dz / far : 0) * want - v.z) * k;
      const speed = Math.hypot(v.x, v.z);
      if (speed > 0.05) {
        const step = speed * dt, x0 = me.x, z0 = me.z;
        me.x += v.x * dt;
        me.z += v.z * dt;
        offBooth(me);
        // Trabado contra la cabina: la rodea por el costado que tiene más cerca.
        if (far > 0.3 && Math.hypot(me.x - x0, me.z - z0) < step * 0.3) me.x += Math.sign(me.x || me.tx || 1) * step;
        // Mira para donde va (cuando ya casi frenó, se queda como estaba).
        if (speed > 0.35) me.yaw += turnTo(me.yaw, Math.atan2(v.x, v.z)) * Math.min(1, dt * 11);
        me.stride += (step * Math.PI) / MY_STEP;
        this.walking = moving[0] = speed > 0.25;
      } else v.x = v.z = 0;
      me.walk += (Math.min(1, speed / 1.2) - me.walk) * Math.min(1, dt * 10);
    }
    for (let i = 1; i < ds.length; i++) {
      const d = ds[i];
      let dx = d.tx - d.x, dz = d.tz - d.z, far = Math.hypot(dx, dz);
      // (Los puntos de paso no hace falta pisarlos justo: con pasar cerca alcanza.)
      if (far < 0.6 && d.path.length) {
        const next = d.path.shift()!;
        d.tx = next.x;
        d.tz = next.z;
        dx = d.tx - d.x;
        dz = d.tz - d.z;
        far = Math.hypot(dx, dz);
      }
      // El rato que se queda bailando en un lugar corre recién cuando llega (subir a un palco lleva lo suyo).
      if (far <= 0.15 && !d.path.length) d.wait -= dt;
      if (d.wait <= 0) {
        // El que sube se queda un buen rato arriba: el viaje es largo, y si no los palcos quedan vacíos.
        const up = high(this.pick(d, i));
        d.wait = ((7 + Math.random() * 14) / d.pace) * (up ? 2.5 : 1);
        this.wanted[i] = 0;
        continue;
      }
      const go = far > 0.15 ? Math.min(speed * d.pace * dt, far) / far : 0;
      moving[i] = go > 0;
      this.wanted[i] = far * go;
      d.x += dx * go;
      d.z += dz * go;
      d.stride += (far * go * Math.PI) / STEP;
      d.walk += ((go ? 0.85 : 0) - d.walk) * Math.min(1, dt * 5);
      // Caminando mira para donde va; al llegar se acomoda de a poco.
      d.yaw += turnTo(d.yaw, go ? Math.atan2(dx, dz) : this.facing(d)) * Math.min(1, dt * (go ? 4 : 2));
    }
    this.separate(moving, speed * dt * 0.8);
    this.keepLevel(dt);
  }

  /** Cambia el look de un bailarín sin rearmar la pista (vista previa del creador). */
  setLook(i: number, look: Look, name?: string) {
    const d = this.dancers[i];
    if (!d) return;
    d.look = look;
    if (name !== undefined) d.name = name;
    this.radius[i] = reach(look);
    this.paint();
  }

  /** Mostrar solo al primero (mientras se arma el personaje, para verlo sin gente alrededor). */
  setSolo(solo: boolean) {
    this.solo = solo;
    this.paint();
  }

  /** Pone al bailarín `i` en un lugar exacto, mirando para donde se le diga (la fila de afuera). */
  place(i: number, x: number, z: number, yaw: number) {
    const d = this.dancers[i];
    if (d) Object.assign(d, { x, z, yaw });
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
      const sleeveless = bare || l.arriba === MUSCULOSA || l.arriba === TOP || l.arriba === VESTIDO;
      const legs = l.abajo === POLLERA || l.abajo === TUTU;
      const shoe = l.calzado === DESCALZO ? skin : LOOK.zapas[l.zapas];
      both(this.thighs, i, legs ? skin : pants);
      // Con short o pollera se ve la pierna; las botas la tapan.
      both(this.shins, i, l.calzado === BOTAS ? shoe : legs || l.abajo === SHORT ? skin : pants);
      c.set(shoe);
      const shoeMesh = SHOE_MESH[l.calzado] ?? 0;
      this.shoes.color(shoeMesh, c);
      this.shoes.color(shoeMesh, c);
      both(this.upperArms, i, sleeveless ? skin : shirt);
      both(this.foreArms, i, l.arriba === BUZO ? shirt : skin);
      both(this.hands, i, l.mano === GUANTES ? '#f9f2e8' : skin);
      // En cuero, la estampa queda de tatuaje.
      this.torsos.color(l.estampa, c.set(bare ? skin : shirt));
      this.tops.color(l.arriba, c.set(l.arriba === TOP ? skin : l.arriba === VESTIDO ? shirt : neon));
      this.skirts.color(l.abajo, c.set(pants));
      this.over.color(l.encima, c.set(l.encima === ALAS_ANGEL ? LOOK.alas[l.alas] : (OVER_COLOR[l.encima] ?? neon)));
      this.heads.color(l.cara, c.set(skin));
      const hair = hairIndex(l);
      if (hair >= 0) this.hair.color(hair, c.set(LOOK.peloColor[l.peloColor]));
      this.acc.color(l.accesorio, c.set(l.accesorio === OREJAS_ELFA ? skin : (ACC_COLOR[l.accesorio] ?? neon)));
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
  /** Matriz que no dibuja nada (para esconder una pieza sin correr de lugar a las demás). */
  private hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  /** Para apuntar el pucho: dónde lo agarra la mano, dónde está la boca, y para dónde es arriba. */
  private grip = new THREE.Vector3();
  private lips = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  /** Para la botella: los ejes de la cabeza y para dónde va el fondo. */
  private ax = new THREE.Vector3();
  private ay = new THREE.Vector3();
  private az = new THREE.Vector3();
  private dir = new THREE.Vector3();
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
    this.cigs.count = this.bottles.count = this.puffs.count = 0;
    this.shown().forEach((d, i) => {
      const l = d.look;
      const b = BUILDS[l.cuerpo] ?? BUILDS[0];
      // Los que bailan van casi a la par; los de la fila, cada uno a su tiempo.
      dance(l.baile, beats + d.phase * (l.baile >= EN_LA_FILA ? 1.7 : 0.012), e, p);
      // El que va caminando da pasos de verdad (el del visitante, más largos).
      // En el drop, manos arriba (el que va caminando o está en otra, no).
      if (this.hype > 0.01 && l.baile < EN_LA_FILA && !this.solo) hype(p, beats, this.hype * (1 - Math.min(1, d.walk)), d.phase);
      if (d.walk > 0.01 && !this.solo) stride(p, d.stride, d.walk, i === 0 && this.mine ? 0.62 : 0.36);
      const doing = this.solo || d.actT <= 0 ? 0 : d.act;
      if (doing) action(p, doing, d.actT);
      // En el creador gira despacio para verlo de todos lados (o mira para donde lo dejaron).
      const facing = this.solo ? (this.spin ?? Math.sin(t * 0.7) * 0.9) : d.yaw + Math.sin(t * 0.9 + d.phase) * 0.08 * (1 - e);
      const h = b.h * d.vary;
      // Al doblar las rodillas baja la cadera, así el pie que apoya no queda flotando.
      const footL = THIGH * Math.cos(p.tL) + (SHIN + SHOE) * Math.cos(p.tL + p.kL);
      const footR = THIGH * Math.cos(p.tR) + (SHIN + SHOE) * Math.cos(p.tR + p.kR);
      const lift = (l.calzado === PLATAFORMAS ? PLATFORM : 0) - (HIP_Y - Math.max(footL, footR));
      // En un palco (o subiendo la escalera) todo el raro va más arriba.
      const y = p.hop * h + lift * h + (this.roam ? floorAt(d.x, d.z) : 0);
      this.root.compose(this.pos.set(d.x + p.sway * h, y, d.z), this.quat.setFromEuler(this.rootEuler.set(p.lean, facing + p.yaw, p.roll)), this.scale.set(h, h, h));

      const hip = 0.1 * b.w, shoulder = 0.2 * b.w + 0.055 * b.limb;
      const leg = b.limb * (l.abajo === ANCHO ? 1.5 : 1);
      const shoe = SHOE_MESH[l.calzado] ?? 0;
      this.shoes.matrix(shoe, this.limb(this.thighs, this.shins, i * 2, hip, HIP_Y, THIGH, p.tL, p.tLz, p.kL, leg));
      this.shoes.matrix(shoe, this.limb(this.thighs, this.shins, i * 2 + 1, -hip, HIP_Y, THIGH, p.tR, p.tRz, p.kR, leg));
      const both = BOTH_HANDS.has(l.mano);
      let hand = this.limb(this.upperArms, this.foreArms, i * 2, shoulder, SHOULDER_Y, UPPER, p.aLx, p.aLz, p.eL, b.limb);
      this.hands.setMatrixAt(i * 2, hand);
      if (both) this.held.matrix(l.mano, hand);
      hand = this.limb(this.upperArms, this.foreArms, i * 2 + 1, -shoulder, SHOULDER_Y, UPPER, p.aRx, p.aRz, p.eR, b.limb);
      this.hands.setMatrixAt(i * 2 + 1, hand);
      // Fumando o tomando, en esa mano va el pucho o la botella (lo que llevaba se guarda un rato).
      const busy = doing === FUMAR || doing === AGUA;
      // De dónde sale el pucho: entre los dedos (se anota ahora, que la matriz de la mano se pisa enseguida).
      if (doing === FUMAR) this.grip.set(0, HAND_Y - 0.04, 0.02).applyMatrix4(hand);
      if (doing === AGUA) this.grip.set(0, HAND_Y, 0.04).applyMatrix4(hand);
      this.held.matrix(l.mano, busy ? this.hidden : hand);

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
      // La boca, donde esté la cabeza de verdad: el baile lo puede tener girado, inclinado o corrido.
      if (doing === FUMAR || doing === AGUA) this.lips.set(0, 0.1, 0.16).applyMatrix4(head);
      if (doing === AGUA && this.bottles.count < PROPS) {
        // La botella sale parada en la mano, el pico va a la boca y el fondo se levanta a medida
        // que toma. Se arma con los ejes de la cabeza: así emboca aunque el baile la tenga torcida.
        const reach = sipReach(d.actT), k = reach * reach * (3 - 2 * reach), a = -0.15 + 0.5 * sipTip(d.actT);
        this.ax.setFromMatrixColumn(head, 0).normalize();
        this.ay.setFromMatrixColumn(head, 1).normalize();
        this.az.setFromMatrixColumn(head, 2).normalize();
        this.az.multiplyScalar(Math.cos(a)).addScaledVector(this.ay, Math.sin(a));
        this.dir.set(0, -1, 0).lerp(this.az, k).normalize();
        // El pico: a media botella de la mano, y de ahí a los labios.
        this.pos.copy(this.grip).addScaledVector(this.dir, -0.1 * h).lerp(this.lips, k);
        this.az.copy(this.dir).negate();
        this.ay.crossVectors(this.az, this.ax).normalize();
        this.ax.crossVectors(this.ay, this.az);
        // Aparece y se guarda de a poco, no de golpe.
        const s = h * Math.min(1, d.actT / 0.2, (ACTION_SECONDS[AGUA] - d.actT) / 0.2);
        this.out.makeBasis(this.ax, this.ay, this.az).scale(this.scale.set(s, s, s)).setPosition(this.pos);
        this.bottles.setMatrixAt(this.bottles.count++, this.out);
      }
      const mouthYaw = facing + p.yaw + p.headRy;
      if (doing === FUMAR && this.cigs.count < PROPS) {
        // El pucho apunta siempre de la mano a la boca: el filtro del lado de la cara y la brasa
        // del otro, esté el brazo como esté.
        this.out.lookAt(this.lips, this.grip, this.up).scale(this.scale.set(h, h, h)).setPosition(this.grip);
        this.cigs.setMatrixAt(this.cigs.count++, this.out);
      }
      // El humo: después de cada pitada salen tres bocanadas que suben y se agrandan.
      if (doing === FUMAR) {
        const u = ((d.actT % 2.6) / 2.6 - 0.5) / 0.45;
        for (let k = 0; k < 3 && u > 0 && u < 1 && this.puffs.count < PROPS * 3; k++) {
          const age = Math.min(1, u + k * 0.18), size = (0.05 + 0.13 * age) * (1 - 0.6 * Math.max(0, age - 0.7) / 0.3);
          const out = 0.04 + age * 0.35 + k * 0.05;
          this.out.makeScale(size, size, size).setPosition(this.lips.x + Math.sin(mouthYaw) * out, this.lips.y + 0.08 * h + age * 0.45 + k * 0.06, this.lips.z + Math.cos(mouthYaw) * out);
          this.puffs.setMatrixAt(this.puffs.count++, this.out);
        }
      }
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

  phraseOf(i: number) {
    return this.dancers[i]?.phrase ?? '';
  }
}
