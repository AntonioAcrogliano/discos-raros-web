import * as THREE from 'three';

/** Cilindro con el borde superior en y = 0 que cuelga hacia -y. */
export function limb(rTop: number, rBottom: number, len: number, sides: number, mat: THREE.Material | THREE.Material[]) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, len, sides, 1, false);
  geo.translate(0, -len / 2, 0);
  return new THREE.Mesh(geo, mat);
}

/** Caja posicionada. */
export function box(w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  return mesh;
}
