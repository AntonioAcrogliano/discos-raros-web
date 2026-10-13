import * as THREE from 'three';
import { DR, DR_CYCLE, LOGO_ASPECT, type PSXMaterial, box, makeCanvas, makeCheckerTexture, makeLogoCanvas, makePSXMaterial, makeWallTexture, setPSXMap, street, toPSXTexture } from '../../style-kit';
import { type Look, randomLook } from '../../../shared/look';
import { CLUB } from './club';
import { CELU, Crowd, PUCHO } from './crowd';
import { CHARLANDO, EN_LA_FILA, ESPERANDO, FUMANDO } from './dances';

/**
 * Lo que hay alrededor del club: la vereda con la fachada y las puertas (la entrada del sitio)
 * y el patio de juegos, pegado a la pared derecha. Cada uno se muestra solo cuando la cámara
 * está ahí: la fachada taparía la cámara de los juegos, que se para más atrás que la puerta.
 */

const TAU = Math.PI * 2;

/** Medidas de la puerta (dos hojas) y de la vereda. */
export const PUERTA = { halfW: 1.15, h: 2.7, z: CLUB.frontZ };

/**
 * Pared de ladrillo. La textura se mide en metros desde (u0, v0), así varios paños pegados
 * (la fachada alrededor de la puerta) siguen las mismas hiladas. Va cortada en cuadros chicos:
 * con polígonos grandes la textura sin corrección de perspectiva se tuerce demasiado.
 */
function brick(w: number, h: number, mat: THREE.Material, u0 = 0, v0 = 0) {
  const geo = new THREE.PlaneGeometry(w, h, Math.max(1, Math.ceil(w / 0.8)), Math.max(1, Math.ceil(h / 0.8)));
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (u0 + uv.getX(i) * w) / 1.6, (v0 + uv.getY(i) * h) / 1.6);
  return new THREE.Mesh(geo, mat);
}

export interface Afuera {
  group: THREE.Group;
  /** Cuánto están abiertas las puertas (0 cerradas, 1 de par en par). */
  setDoors(open: number): void;
  /** ¿Siguen pasando autos? Se corta mientras el visitante cruza la calle para entrar. */
  traffic: boolean;
  /**
   * Lo que hace el patova cuando alguien llega (cada valor de 0 a 1): mirarlo, revisar la
   * lista y estirarse a abrir la puerta. `camX`/`camZ` es dónde está parado el que llega.
   */
  bouncer(look: number, list: number, reach: number, camX: number, camZ: number): void;
  /** El raro del que llega, parado frente al patova (null = nadie: entra sin anotarse). */
  guest(look: Look | null): void;
  /** Cuánto caminó ese raro hacia adentro (0 = en la puerta, 1 = ya entró). */
  guestWalk(k: number): void;
  /**
   * Armándolo (el creador abierto en la puerta): baila su paso y gira para verlo de todos
   * lados, o mira hacia `spin` si lo están arrastrando.
   */
  guestDress(on: boolean, spin: number | null): void;
  /** Dónde está parado y cuánto mide (para acercarle la cámara mientras se lo arma). */
  guestSpot(): { x: number; z: number; size: number };
  update(beats: number, energy: number, t: number): void;
}

export function buildAfuera(): Afuera {
  const group = new THREE.Group();
  const { halfW, h, z } = PUERTA;
  const W = 13, H = 7.2;
  const updaters: ((beats: number, energy: number, t: number) => void)[] = [];

  // --- Fachada: pared de ladrillo con el hueco de la puerta ---------------------------------
  const wall = makePSXMaterial({ map: makeWallTexture('#2b1d33', '#120b18') });
  const side = W - halfW;
  for (const s of [-1, 1]) {
    const p = brick(side, H, wall, s < 0 ? -W : halfW);
    p.position.set(s * (halfW + side / 2), H / 2, z);
    group.add(p);
  }
  const top = brick(halfW * 2, H - h, wall, -halfW, h);
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
  for (const x of [-2.2, -4.4, -6.6, -8.8]) {
    group.add(box(0.1, 1, 0.1, gold, x, 0.5, z + 1.7));
    group.add(box(0.2, 0.06, 0.2, gold, x, 0.03, z + 1.7));
    group.add(box(0.15, 0.1, 0.15, gold, x, 1.03, z + 1.7));
  }
  for (const x of [-3.3, -5.5, -7.7]) group.add(box(2.2, 0.07, 0.06, rope, x, 0.86, z + 1.7));

  // La fila: raros esperando para entrar. Son personajes como los de la pista, con looks al
  // azar (siempre los mismos: la semilla es fija). Unos miran el celu, otros charlan de a dos
  // dándose vuelta, otros fuman o esperan aburridos.
  // [qué hace, cuánto se sale de la fila hacia la calle, para dónde mira (0 = hacia la puerta)]
  const QUEUE: [number, number, number][] = [
    [EN_LA_FILA, 0, 0],
    [CHARLANDO, 0.1, 0.25],
    [CHARLANDO, 0.2, Math.PI - 0.35],
    [FUMANDO, 0.45, -0.9],
    [EN_LA_FILA, 0, 0.1],
    [ESPERANDO, 0.05, 0],
    [CHARLANDO, 0.15, 0.3],
    [CHARLANDO, 0.3, Math.PI - 0.5],
    [FUMANDO, 0.4, -0.6],
    [EN_LA_FILA, 0, -0.1],
  ];
  const fila = new Crowd(QUEUE.length);
  let fseed = 77;
  const fr = () => ((fseed = (fseed * 16807) % 2147483647) - 1) / 2147483646;
  fila.setDancers(
    QUEUE.map(([doing], i) => {
      const look = randomLook(fr);
      // Sin alas ni mochilas (se pisarían en la fila) y con la mano libre para el celu o el pucho.
      return { id: `fila${i}`, name: '', look: { ...look, encima: 0, boca: 0, mano: doing === EN_LA_FILA ? CELU : doing === FUMANDO ? PUCHO : 0, baile: doing } };
    }),
  );
  const smokers: { x: number; y: number; z: number; yaw: number }[] = [];
  QUEUE.forEach(([doing, out, turn], i) => {
    // Los que charlan se arriman a su compañero.
    const x = -2.5 - i * 0.8 + (doing === CHARLANDO ? (turn > 1 ? 0.12 : -0.12) : 0) + (fr() - 0.5) * 0.1;
    const zz = z + 0.85 + out + (fr() - 0.5) * 0.12;
    const yaw = Math.PI / 2 + turn + (fr() - 0.5) * 0.2;
    fila.place(i, x, zz, yaw);
    if (doing === FUMANDO) smokers.push({ x, y: 1.5 * fila.scaleOf(i), z: zz, yaw });
  });
  group.add(fila.group);
  updaters.push((_b, _e, t) => fila.update(t * 1.3, 1, t));
  // El humo de los que fuman: tres volutas por cabeza que suben, se abren y se deshacen.
  for (const sm of smokers) {
    for (let k = 0; k < 3; k++) {
      const mat = makePSXMaterial({ color: '#b8b4c4', lit: false, opacity: 0.3 });
      const puff = box(0.09, 0.09, 0.09, mat);
      puff.renderOrder = 2;
      group.add(puff);
      updaters.push((_b, _e, t) => {
        const life = (((t * 0.33 + k / 3 + sm.x) % 1) + 1) % 1;
        puff.position.set(sm.x + Math.sin(sm.yaw) * 0.28 + Math.sin(t * 0.9 + k * 2) * 0.08 * life, sm.y + 0.1 + life * 0.85, sm.z + Math.cos(sm.yaw) * 0.28 + life * 0.12);
        puff.scale.setScalar(0.7 + life * 1.8);
        puff.rotation.z = t * 0.6 + k;
        mat.uniforms.uOpacity.value = 0.34 * Math.sin(life * Math.PI);
      });
    }
  }

  // --- Autos que pasan por la calle, entre la vereda y el que mira ----------------------------
  const dark = makePSXMaterial({ color: '#0a0a0e' });
  const lightOn = makePSXMaterial({ color: DR.crema, lit: false });
  const tail = makePSXMaterial({ color: DR.rojo, lit: false });
  const glass = makePSXMaterial({ color: '#2a3a52' });
  /** Un auto mirando hacia +x: carrocería, cabina, ruedas y luces. Con `sign`, cartel de taxi. */
  const makeCar = (body: string, roof: string, long: number, tall: number, sign = false) => {
    const g = new THREE.Group();
    const b = makePSXMaterial({ color: body }), r = makePSXMaterial({ color: roof });
    g.add(box(long, 0.52, 1.7, b, 0, 0.56, 0));
    g.add(box(long * 0.5, tall, 1.56, r, -long * 0.06, 0.82 + tall / 2, 0));
    g.add(box(long * 0.46, tall * 0.62, 1.6, glass, -long * 0.06, 0.84 + tall / 2, 0));
    g.add(box(long * 0.5, 0.05, 1.5, r, -long * 0.06, 0.82 + tall, 0));
    for (const wx of [-long * 0.31, long * 0.31]) {
      for (const wz of [-0.82, 0.82]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 8), dark);
        w.rotation.x = Math.PI / 2;
        w.position.set(wx, 0.33, wz);
        g.add(w);
      }
    }
    for (const lz of [-0.6, 0.6]) {
      g.add(box(0.06, 0.16, 0.3, lightOn, long / 2, 0.62, lz));
      g.add(box(0.06, 0.14, 0.3, tail, -long / 2, 0.62, lz));
    }
    g.add(box(0.1, 0.16, 1.74, dark, long / 2 - 0.02, 0.36, 0), box(0.1, 0.16, 1.74, dark, -long / 2 + 0.02, 0.36, 0));
    if (sign) g.add(box(0.5, 0.16, 0.24, makePSXMaterial({ color: DR.amarillo, lit: false }), -long * 0.06, 0.94 + tall, 0));
    g.visible = false;
    group.add(g);
    return g;
  };
  // El taxi porteño (negro y amarillo), un par de autos y una camioneta.
  const cars = [makeCar('#111318', DR.amarillo, 4.1, 0.52, true), makeCar(DR.rojo, DR.rojoOscuro, 3.9, 0.5), makeCar('#d8dce8', '#b8bcc8', 4, 0.5), makeCar(DR.verde, DR.verdeOscuro, 4.6, 0.72), makeCar('#111318', DR.amarillo, 4.1, 0.52, true)];
  const LANE = z + 7.1, FAR = 20;
  let driving: { car: THREE.Group; dir: number; speed: number } | null = null;
  let nextCar = 2.5;
  let traffic = true;
  updaters.push((_b, _e, t) => {
    if (driving) {
      const c = driving;
      c.car.position.x += c.dir * c.speed * dt(t);
      if (Math.abs(c.car.position.x) > FAR) {
        c.car.visible = false;
        driving = null;
        nextCar = t + 4 + fr() * 7;
      }
    } else if (traffic && t > nextCar) {
      const car = cars[Math.floor(fr() * cars.length)];
      const dir = fr() < 0.82 ? 1 : -1;
      const speed = 9 + fr() * 5;
      car.visible = true;
      car.rotation.y = dir > 0 ? 0 : Math.PI;
      // Los que vienen de contramano van por el otro carril, más lejos del que mira.
      car.position.set(-dir * FAR, 0, dir > 0 ? LANE : LANE - 0.2);
      driving = { car, dir, speed };
      street.car(dir, (FAR * 2) / speed);
    }
    dt(t);
  });
  /** Segundos desde el frame anterior (los updaters reciben el tiempo, no el paso). */
  let lastT = -1, step = 0;
  function dt(t: number) {
    if (t !== lastT) {
      step = lastT < 0 ? 0 : Math.max(0, Math.min(0.1, t - lastT));
      lastT = t;
    }
    return step;
  }

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

  // El patovica: grandote, de negro, con los brazos cruzados. Cabecea con el bombo, y cuando
  // llega alguien lo mira, revisa la lista y le abre la puerta.
  const pato = buildPatova();
  const PATO = { x: 2.2, z: z + 0.8, yaw: -0.22 };
  pato.root.position.set(PATO.x, 0.1, PATO.z);
  group.add(pato.root);
  const act = { look: 0, list: 0, reach: 0, camX: 0, camZ: z + 9 };
  updaters.push((beats, energy, t) => {
    const { look, list, reach } = act;
    const busy = Math.max(list, reach) > 0.01;
    // Parado mira para los costados; cuando llega alguien, a él; con la lista, a la lista.
    const yaw = PATO.yaw - 0.5 * reach;
    pato.root.rotation.y = yaw;
    const toCam = Math.atan2(act.camX - PATO.x, act.camZ - PATO.z) - yaw;
    const idleY = 0.4 * Math.sin(t * 0.35);
    const nod = 0.13 * Math.max(0, Math.sin(TAU * beats)) * energy * (1 - Math.max(look, list));
    pato.head.rotation.y = (idleY + (toCam - idleY) * look) * (1 - list) + 0.3 * list;
    pato.head.rotation.x = 0.04 + nod + 0.5 * list + 0.03 * list * Math.sin(t * 9);
    // Respira: el pecho y los brazos suben apenas.
    pato.chest.position.y = Math.sin(t * 1.6) * 0.012;
    // Brazos: cruzados mientras espera; sueltos para la lista (izquierdo) y la puerta (derecho).
    pato.crossed.visible = !busy;
    pato.armL.shoulder.visible = pato.armR.shoulder.visible = busy;
    // La lista va adelante del pecho, no al costado: el brazo se cierra hacia adentro.
    pato.armL.shoulder.rotation.set(-0.7 * list, 0, 0.06 - 0.5 * list);
    pato.armL.elbow.rotation.set(-0.1 - 1.35 * list, 0, 0.25 * list);
    pato.armR.shoulder.rotation.set(-0.35 * reach, 0, -0.06 - 1.2 * reach);
    pato.armR.elbow.rotation.set(-0.15 - 0.25 * reach, 0, 0);
  });

  // El raro del que llega: espera frente al patova y, cuando le abren, entra caminando.
  const yo = new Crowd(1);
  yo.group.visible = false;
  group.add(yo.group);
  const SPOT = { x: 0.85, z: z + 2.3 };
  let yoLook: Look | null = null;
  let yoWalk = 0;
  let dressing = false;
  // Mientras se lo arma baila el paso elegido; esperando, espera; al entrar, camina.
  const dressYo = () => yoLook && yo.setDancers([{ id: 'yo', name: '', look: dressing ? yoLook : { ...yoLook, baile: yoWalk > 0.02 ? 5 : ESPERANDO } }]);
  updaters.push((beats, _e, t) => {
    if (!yo.group.visible) return;
    const k = yoWalk;
    // De su lugar frente al patova al medio de la puerta, y de ahí para adentro.
    const x = SPOT.x * (1 - Math.min(1, k * 2)), zz = SPOT.z + (z - 2.4 - SPOT.z) * k;
    yo.place(0, x, zz, k > 0.02 ? Math.PI : Math.atan2(PATO.x - SPOT.x, PATO.z - SPOT.z));
    if (dressing) yo.update(beats, 0.8, t);
    else yo.update(t * (k > 0.02 ? 2.6 : 1.3), 1, t);
  });

  return {
    group,
    guest(look) {
      yoLook = look;
      yoWalk = 0;
      yo.group.visible = Boolean(look);
      dressYo();
    },
    guestDress(on, spin) {
      yo.spin = spin;
      if (on === dressing) return;
      dressing = on;
      // "Solo" es el modo del creador: gira despacio para verlo entero.
      yo.setSolo(on);
      dressYo();
    },
    guestSpot: () => ({ x: SPOT.x, z: SPOT.z, size: yoLook ? yo.scaleOf(0) : 1 }),
    guestWalk(k) {
      if (!yoLook) return;
      // Al arrancar a caminar cambia de pose (una sola vez: repintar es caro).
      const starts = yoWalk <= 0.02 && k > 0.02;
      yoWalk = k;
      if (starts) dressYo();
      if (k >= 1) yo.group.visible = false;
    },
    get traffic() {
      return traffic;
    },
    set traffic(on: boolean) {
      traffic = on;
    },
    bouncer(look, list, reach, camX, camZ) {
      Object.assign(act, { look, list, reach, camX, camZ });
    },
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
  // Los brazos cruzados van aparte: se esconden cuando los descruza para atender a alguien.
  const crossed = new THREE.Group();
  chest.add(crossed);
  // Del hombro bajan hacia adelante hasta el codo…
  for (const s of [-1, 1]) part(crossed, 0.23, 0.48, 0.25, black, s * 0.53, 1.47, 0.1, -0.5, 0, s * 0.1);
  // …y los antebrazos se cruzan por delante del pecho, uno arriba del otro.
  part(crossed, 0.66, 0.19, 0.2, skin, 0.1, 1.39, 0.33, 0, 0, 0.2);
  part(crossed, 0.66, 0.19, 0.2, skin, -0.1, 1.31, 0.4, 0, 0, -0.16);
  // Las manos: una asoma sobre el brazo de enfrente y la otra queda abrazándolo por abajo.
  part(crossed, 0.15, 0.17, 0.16, skinDark, 0.4, 1.47, 0.36, 0, 0, 0.2);
  part(crossed, 0.15, 0.17, 0.16, skinDark, -0.42, 1.26, 0.42, 0, 0, -0.16);
  // Los brazos sueltos, con hombro y codo: el izquierdo sostiene la lista, el derecho abre la puerta.
  const limb = (s: 1 | -1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.54, 1.74, 0);
    shoulder.visible = false;
    chest.add(shoulder);
    part(shoulder, 0.23, 0.46, 0.25, black, 0, -0.2, 0);
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.42, 0);
    shoulder.add(elbow);
    part(elbow, 0.19, 0.4, 0.2, skin, 0, -0.2, 0);
    part(elbow, 0.16, 0.16, 0.17, skinDark, 0, -0.46, 0);
    return { shoulder, elbow };
  };
  const armL = limb(1), armR = limb(-1);
  // La lista: una tabla con la hoja y los renglones, del lado de la cara cuando levanta el brazo.
  part(armL.elbow, 0.27, 0.36, 0.025, makePSXMaterial({ color: '#8a5a2a' }), 0, -0.52, 0.1);
  part(armL.elbow, 0.23, 0.3, 0.01, white, 0, -0.53, 0.118);
  part(armL.elbow, 0.1, 0.035, 0.03, makePSXMaterial({ color: '#8f97a8' }), 0, -0.36, 0.115);
  for (let i = 0; i < 5; i++) part(armL.elbow, 0.17, 0.014, 0.004, dark, -0.01, -0.44 - i * 0.045, 0.125);
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
  return { root, chest, head, crossed, armL, armR };
}

// --- Patio ---------------------------------------------------------------------------------

/**
 * El patio, pegado a la pared derecha del club. Es largo hacia adelante: acá se juegan los
 * juegos, y la cámara de costado se para bien atrás. `gameZ` es la línea de la cancha y del
 * ring; de ahí hacia la cámara no puede haber muebles.
 */
export const PATIO = { x: CLUB.halfW + 6.2, back: -5, front: 13, halfW: 5.8, gameZ: -0.4, wallH: 4.6 };

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
