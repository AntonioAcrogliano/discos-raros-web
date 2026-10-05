import { type Rig, buildBoxRig, resetPose } from '../../characters/rig';
import { CLUB } from './club';

/**
 * Discos y Raros en la cabina. Por ahora son personajes de cajas con los colores de sus
 * outfits; cuando estén los modelos reales entran por acá, con el mismo esqueleto.
 */
export interface Djs {
  discos: Rig;
  raros: Rig;
  update(beats: number, energy: number): void;
}

/** Colores de los outfits que tienen en la app de PCX (persona1 = Discos, persona2 = Raros). */
export const DISCOS_COLORS = { skin: '#9c7358', shirt: '#0a7963', pants: '#2a3346', hair: '#141210' };
export const RAROS_COLORS = { skin: '#c0a194', shirt: '#b5a660', pants: '#2a3346', hair: '#3e342e' };

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
    update(beats, energy) {
      const e = 0.25 + 0.75 * energy;
      const nod = Math.max(0, Math.sin(TAU * beats)) * e;
      const bounce = Math.abs(Math.sin(Math.PI * beats)) * 0.035 * e;
      // Cada 8 beats, los dos últimos con las manos arriba.
      const phrase = ((beats % 8) + 8) % 8;
      const up = energy > 0.5 ? Math.min(1, Math.max(0, phrase - 6) * 4) * Math.min(1, (8 - phrase) * 4) : 0;
      const scratch = Math.sin(TAU * beats * 2) * 0.12 * e;

      for (const r of [discos, raros]) {
        resetPose(r);
        r.body.position.y = bounce;
        r.head.rotation.x = 0.28 * nod;
        r.body.rotation.x = 0.06 + 0.03 * nod;
      }
      const lerp = (a: number, b: number) => a + (b - a) * up;

      // Discos: scratchea su bandeja con la derecha y tiene la izquierda en el mixer.
      discos.body.rotation.y = -0.1;
      discos.armR.rotation.set(lerp(-0.4 + scratch, 0), 0, lerp(-0.12, -2.75));
      discos.foreR.rotation.set(lerp(-0.62, -0.1), 0, 0);
      discos.armL.rotation.set(lerp(-0.42, 0), 0, lerp(0.42, 2.75));
      discos.foreL.rotation.set(lerp(-0.6 - 0.12 * nod, -0.1), 0, 0);

      // Raros: se sostiene el auricular con la derecha y empuja su disco con la izquierda.
      raros.body.rotation.y = 0.1;
      raros.head.rotation.z = -0.12 * (1 - up);
      raros.armR.rotation.set(lerp(-0.45, 0), 0, lerp(-0.7, -2.75));
      raros.foreR.rotation.set(lerp(-2.25, -0.1), lerp(-0.45, 0), 0);
      raros.armL.rotation.set(lerp(-0.4 - scratch * 0.7, 0), 0, lerp(0.12, 2.75));
      raros.foreL.rotation.set(lerp(-0.62, -0.1), 0, 0);
    },
  };
}
