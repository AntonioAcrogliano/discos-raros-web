import * as THREE from 'three';
import { box, makeFaceTexture, makePSXMaterial } from '../style-kit';

/**
 * Esqueleto de un personaje: grupos anidados (sin skinning), con los mismos nombres y
 * convenciones que la app de PCX. El personaje mira a +z, el brazo izquierdo está en +x y los
 * miembros cuelgan hacia -y. Lo usan los DJs de la cabina y los luchadores.
 */
export interface Rig {
  /** A la altura del piso; es lo que se posiciona en la escena. */
  root: THREE.Group;
  /** Lo que rebota y se inclina. */
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  /** Codos. */
  foreL: THREE.Group;
  foreR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  /** Rodillas. */
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  height: number;
}

export const RIG_JOINTS = ['body', 'head', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR', 'kneeL', 'kneeR'] as const;
export type RigJoint = (typeof RIG_JOINTS)[number];

export interface BoxRigColors {
  skin: string;
  shirt: string;
  pants: string;
  hair: string;
  shoes?: string;
  height?: number;
}

/** Personaje de cajas (placeholder), con las proporciones de los de PCX. */
export function buildBoxRig(c: BoxRigColors): Rig {
  const H = c.height ?? 1.75;
  const skin = makePSXMaterial({ color: c.skin });
  const shirt = makePSXMaterial({ color: c.shirt });
  const pants = makePSXMaterial({ color: c.pants });
  const hair = makePSXMaterial({ color: c.hair });
  const shoes = makePSXMaterial({ color: c.shoes ?? '#1e1e1e' });

  const legLen = H * 0.48, upperLeg = H * 0.235, shoeH = H * 0.035;
  const lowerLeg = legLen - upperLeg - shoeH;
  const torsoLen = H * 0.335, shoulderY = legLen + torsoLen;
  const headH = H * 0.13, shoulderHalf = H * 0.115, hipHalf = H * 0.085;
  const armUpper = H * 0.17, armLower = H * 0.15, hand = H * 0.05;

  const group = (name: string, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };

  const root = new THREE.Group();
  root.name = 'root';
  const body = group('body', root);
  body.add(box(shoulderHalf * 2, torsoLen, H * 0.12, shirt, 0, legLen + torsoLen / 2, 0));
  body.add(box(hipHalf * 2.1, H * 0.06, H * 0.115, pants, 0, legLen + H * 0.02, 0));

  const head = group('head', body, 0, shoulderY + H * 0.03);
  const face = makePSXMaterial({ color: c.skin, map: makeFaceTexture() });
  // Solo la cara de adelante (+z) lleva la textura; el resto es piel lisa.
  head.add(new THREE.Mesh(new THREE.BoxGeometry(headH * 0.8, headH, headH * 0.85), [skin, skin, skin, skin, face, skin]).translateY(headH / 2));
  head.add(box(headH * 0.86, headH * 0.4, headH * 0.9, hair, 0, headH * 0.9, -headH * 0.03));

  const arm = (side: 1 | -1, n: 'L' | 'R') => {
    const a = group(`arm${n}`, body, side * (shoulderHalf + H * 0.022), shoulderY - H * 0.02);
    a.add(box(H * 0.055, armUpper, H * 0.055, shirt, 0, -armUpper / 2, 0));
    const f = group(`fore${n}`, a, 0, -armUpper);
    f.rotation.order = 'YXZ';
    f.add(box(H * 0.048, armLower, H * 0.048, skin, 0, -armLower / 2, 0));
    f.add(box(H * 0.05, hand, H * 0.055, skin, 0, -armLower - hand / 2, 0));
    return [a, f] as const;
  };
  const [armL, foreL] = arm(1, 'L');
  const [armR, foreR] = arm(-1, 'R');

  const leg = (side: 1 | -1, n: 'L' | 'R') => {
    const l = group(`leg${n}`, body, side * hipHalf * 0.55, legLen);
    l.add(box(H * 0.085, upperLeg, H * 0.09, pants, 0, -upperLeg / 2, 0));
    const k = group(`knee${n}`, l, 0, -upperLeg);
    k.add(box(H * 0.07, lowerLeg, H * 0.075, pants, 0, -lowerLeg / 2, 0));
    k.add(box(H * 0.075, shoeH, H * 0.14, shoes, 0, -lowerLeg - shoeH / 2, H * 0.03));
    return [l, k] as const;
  };
  const [legL, kneeL] = leg(1, 'L');
  const [legR, kneeR] = leg(-1, 'R');

  return { root, body, head, armL, armR, foreL, foreR, legL, legR, kneeL, kneeR, height: H };
}

/** Vuelve todas las articulaciones a la pose de parado. */
export function resetPose(r: Rig) {
  for (const j of RIG_JOINTS) r[j].rotation.set(0, 0, 0);
  r.body.position.set(0, 0, 0);
}
