import * as THREE from 'three';
import { DR, makePSXMaterial, makeRecordTexture } from '../../style-kit';
import { floorAt } from './club';
import { anywhere } from './crowd';

/**
 * Discos para juntar: mientras el set suena, cada tanto aparece un disco girando en algún lugar
 * del boliche (la pista, los costados de la cabina, los palcos) y el visitante lo va a buscar con
 * su raro. Cuando cae un drop aparece uno de oro, que vale más y dura poco. Con el set en pausa
 * no aparece ninguno: es la excusa para quedarse escuchando.
 */

/** Cuánto vale el de oro. */
export const ORO = 5;
/** Segundos hasta el primero, entre uno y otro, y lo que espera uno común antes de mudarse de lugar. */
const FIRST = 15, EVERY: [number, number] = [40, 70], MOVES = 80;
/** El de oro: cuánto dura y cada cuánto puede caer como mucho. */
const ORO_SECONDS = 30, ORO_EVERY = 60;
/** A qué distancia se lo agarra, y lo más cerca del raro que puede aparecer. */
const GRAB = 0.75, AWAY = 4;

export interface Disco {
  x: number;
  y: number;
  z: number;
  gold: boolean;
}

interface Slot extends Disco {
  mesh: THREE.Group;
  mark: THREE.Mesh;
  on: boolean;
  /** Segundos desde que apareció. */
  age: number;
}

export interface Discos {
  group: THREE.Group;
  /**
   * @param me dónde está el raro del visitante (null = no tiene: no aparece nada)
   * @param playing el set está sonando: solo ahí corre el tiempo para que aparezca otro
   * @param drop el drop del momento (0–1)
   * Devuelve lo que pasó en este frame: cuánto valía lo que agarró (0 = nada) y si apareció
   * uno (1 = común, 2 = de oro). El objeto es siempre el mismo.
   */
  update(dt: number, t: number, me: { x: number; z: number; y: number } | null, playing: boolean, drop: number): { got: number; at: Disco | null; spawned: number };
  /** Los que están a la vista (para los carteles). */
  list(): Disco[];
}

export function makeDiscos(): Discos {
  const group = new THREE.Group();
  const geo = new THREE.CylinderGeometry(0.28, 0.28, 0.03, 10).rotateX(Math.PI / 2);
  const markGeo = new THREE.PlaneGeometry(0.7, 0.7).rotateX(-Math.PI / 2);
  const slot = (gold: boolean): Slot => {
    const edge = gold ? DR.amarillo : DR.crema;
    const face = makePSXMaterial({ map: makeRecordTexture(edge, gold ? DR.amarillo : DR.rojo), lit: false });
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(geo, [makePSXMaterial({ color: edge, lit: false }), face, face]));
    // La marca en el piso, para ubicarlo entre la gente.
    const mark = new THREE.Mesh(markGeo, makePSXMaterial({ color: edge, lit: false, opacity: 0.45 }));
    mesh.visible = mark.visible = false;
    group.add(mesh, mark);
    return { x: 0, y: 0, z: 0, gold, mesh, mark, on: false, age: 0 };
  };
  const common = slot(false), gold = slot(true);
  const slots = [common, gold];
  let wait = FIRST, goldWait = 0, wasDrop = 0;
  const out: { got: number; at: Disco | null; spawned: number } = { got: 0, at: null, spawned: 0 };

  const drop_ = (s: Slot, me: { x: number; z: number }) => {
    let p = anywhere();
    for (let tries = 0; tries < 12 && Math.hypot(p.x - me.x, p.z - me.z) < AWAY; tries++) p = anywhere();
    Object.assign(s, { x: p.x, z: p.z, y: floorAt(p.x, p.z), on: true, age: 0 });
  };

  return {
    group,
    update(dt, t, me, playing, drop) {
      out.got = out.spawned = 0;
      out.at = null;
      if (me && playing) {
        goldWait -= dt;
        if (!common.on && (wait -= dt) <= 0) {
          drop_(common, me);
          out.spawned = 1;
        }
        // Cayó el drop: uno de oro.
        if (drop > 0.6 && wasDrop <= 0.6 && !gold.on && goldWait <= 0) {
          drop_(gold, me);
          goldWait = ORO_EVERY;
          out.spawned = 2;
        }
      }
      wasDrop = drop;
      for (const s of slots) {
        if (s.on) {
          s.age += dt;
          if (me && Math.hypot(s.x - me.x, s.z - me.z) < GRAB && Math.abs(s.y - me.y) < 0.6) {
            s.on = false;
            out.got += s.gold ? ORO : 1;
            out.at = s;
            if (!s.gold) wait = EVERY[0] + Math.random() * (EVERY[1] - EVERY[0]);
          } else if (s.gold && s.age > ORO_SECONDS) s.on = false;
          // Nadie lo fue a buscar: prueba en otro lado.
          else if (!s.gold && s.age > MOVES && me) drop_(s, me);
        }
        // El de oro titila cuando se está por ir.
        const left = ORO_SECONDS - s.age;
        s.mesh.visible = s.on && !(s.gold && left < 6 && Math.floor(t * 8) % 2 === 0);
        s.mark.visible = s.on;
        if (!s.on) continue;
        // Cae de arriba, y después flota girando.
        const fall = Math.max(0, 1 - s.age / 0.5);
        s.mesh.position.set(s.x, s.y + 0.95 + Math.sin(t * 2.4) * 0.08 + fall * fall * 3, s.z);
        s.mesh.rotation.y = t * (s.gold ? 5 : 3);
        const pulse = 0.8 + 0.25 * Math.sin(t * 5);
        s.mark.position.set(s.x, s.y + 0.03, s.z);
        s.mark.rotation.y = t * 0.8;
        s.mark.scale.setScalar(pulse);
      }
      return out;
    },
    list: () => slots.filter((s) => s.on),
  };
}
