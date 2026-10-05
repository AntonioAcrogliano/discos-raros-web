import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { makePSXMaterial } from '../style-kit';
import { RIG_JOINTS, type Rig } from './rig';

/**
 * Carga un personaje exportado de la app de PCX (public/models/*.glb) y lo deja listo para
 * animar: mismas articulaciones que el de cajas, con el material PSX del style-kit.
 * Los GLB no traen skinning: son grupos anidados con nombre (body, head, armL…).
 */
export async function loadGlbRig(url: string, height = 1.75): Promise<Rig> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const scene = gltf.scene;
  const joints = {} as Record<(typeof RIG_JOINTS)[number], THREE.Group>;
  for (const j of RIG_JOINTS) {
    const o = scene.getObjectByName(j);
    if (!o) throw new Error(`${url}: falta la articulación ${j}`);
    joints[j] = o as THREE.Group;
  }

  const cache = new Map<THREE.Material, THREE.Material>();
  const convert = (m: THREE.Material) => {
    let out = cache.get(m);
    if (!out) {
      const src = m as THREE.MeshBasicMaterial;
      const map = src.map ?? null;
      if (map) {
        // Los colores van crudos, como en la Play: nada de conversión sRGB ni filtros suaves.
        map.colorSpace = THREE.NoColorSpace;
        map.magFilter = map.minFilter = THREE.NearestFilter;
        map.generateMipmaps = false;
        map.needsUpdate = true;
      }
      out = makePSXMaterial({ color: src.color, map, side: src.side, lit: !m.name.startsWith('unlit') });
      cache.set(m, out);
    }
    return out;
  };
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    // Lo transparente del visor (sombras falsas, humo) no viene a la web.
    if (mats.some((m) => m.name.includes('transp'))) return void (mesh.visible = false);
    mesh.material = Array.isArray(mesh.material) ? mats.map(convert) : convert(mats[0]);
  });

  const root = new THREE.Group();
  root.add(scene);
  return { root, ...joints, height };
}
