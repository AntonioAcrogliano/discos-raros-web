import { type Rig, buildBoxRig, resetPose } from '../../characters/rig';
import { CLUB } from './club';

/**
 * Discos y Raros en la cabina. Por ahora son personajes de cajas con los colores de sus
 * outfits; cuando estén los modelos reales entran por acá, con el mismo esqueleto.
 */
export interface Djs {
  discos: Rig;
  raros: Rig;
  /** @param drop 0–1: el tema acaba de explotar (ver `Music.drop` en luces.ts) */
  update(beats: number, energy: number, drop?: number): void;
}

/** Colores de los outfits que tienen en la app de PCX (persona1 = Discos, persona2 = Raros). */
export const DISCOS_COLORS = { skin: '#9c7358', shirt: '#1f3e8c', pants: '#1f3e8c', hair: '#141210' };
export const RAROS_COLORS = { skin: '#c0a194', shirt: '#161618', pants: '#1e1f24', hair: '#3e342e' };

export function buildPlaceholderDjs(): { discos: Rig; raros: Rig } {
  return { discos: buildBoxRig(DISCOS_COLORS), raros: buildBoxRig(RAROS_COLORS) };
}

const TAU = Math.PI * 2;
const DJ_SCALE = 1.22;

export function makeDjs(discos: Rig, raros: Rig): Djs {
  discos.root.position.set(-0.85, 0, CLUB.djZ);
  raros.root.position.set(0.85, 0, CLUB.djZ);
  // Un poco más grandes que la gente: son los protagonistas y tienen que leerse de lejos.
  discos.root.scale.setScalar(DJ_SCALE);
  raros.root.scale.setScalar(DJ_SCALE);
  return {
    discos,
    raros,
    update(beats, energy, drop = 0) {
      const e = 0.25 + 0.75 * energy;
      const nod = Math.max(0, Math.sin(TAU * beats)) * e;
      // En el drop sueltan todo: saltan, bombean con las manos arriba y se miran.
      const wild = Math.min(1, drop * 1.5), pump = Math.max(0, 1 - (beats - Math.floor(beats)) * 2.2);
      const bounce = Math.abs(Math.sin(Math.PI * beats)) * (0.035 * e + 0.16 * wild);
      // Cada 8 beats, los dos últimos con las manos arriba.
      const phrase = ((beats % 8) + 8) % 8;
      const up = Math.max(wild, energy > 0.5 ? Math.min(1, Math.max(0, phrase - 6) * 4) * Math.min(1, (8 - phrase) * 4) : 0);
      const scratch = Math.sin(TAU * beats * 2) * 0.12 * e;
      const high = 2.75 - 0.4 * (1 - pump) * wild;

      for (const r of [discos, raros]) {
        resetPose(r);
        r.body.position.y = bounce;
        r.head.rotation.x = 0.28 * nod - 0.2 * wild;
        r.body.rotation.x = 0.06 + 0.03 * nod;
      }
      const lerp = (a: number, b: number) => a + (b - a) * up;

      // Discos: scratchea su bandeja con la derecha y tiene la izquierda en el mixer.
      discos.body.rotation.y = -0.1 + 0.4 * wild;
      discos.armR.rotation.set(lerp(-0.4 + scratch, 0), 0, lerp(-0.12, -high));
      discos.foreR.rotation.set(lerp(-0.62, -0.1), 0, 0);
      discos.armL.rotation.set(lerp(-0.42, 0), 0, lerp(0.42, high));
      discos.foreL.rotation.set(lerp(-0.6 - 0.12 * nod, -0.1), 0, 0);

      // Raros: se sostiene el auricular con la derecha y empuja su disco con la izquierda.
      raros.body.rotation.y = 0.1 - 0.4 * wild;
      raros.head.rotation.z = -0.12 * (1 - up);
      raros.armR.rotation.set(lerp(-0.45, 0), 0, lerp(-0.7, -high));
      raros.foreR.rotation.set(lerp(-2.25, -0.1), lerp(-0.45, 0), 0);
      raros.armL.rotation.set(lerp(-0.4 - scratch * 0.7, 0), 0, lerp(0.12, high));
      raros.foreL.rotation.set(lerp(-0.62, -0.1), 0, 0);
    },
  };
}
