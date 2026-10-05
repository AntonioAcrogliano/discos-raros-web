import * as THREE from 'three';
import { DR, type PSXStage, box, makeCheckerTexture, makePSXMaterial, makeRecordTexture, psxUniforms } from '../style-kit';

/**
 * Escena de prueba del style-kit: un cubo con una tapa de disco girando sobre un piso a cuadros.
 * Sirve para ver de un vistazo jitter, affine, dithering y niebla.
 */
export function buildTestCube(stage: PSXStage) {
  const scene = new THREE.Scene();
  const fog = new THREE.Color('#1a0f2e');
  stage.post.clearColor.copy(fog);
  psxUniforms.uFog.value = 1;
  psxUniforms.uFogColor.value.copy(fog);
  psxUniforms.uFogNear.value = 4;
  psxUniforms.uFogFar.value = 14;

  const cube = box(1.4, 1.4, 1.4, makePSXMaterial({ map: makeRecordTexture() }), 0, 1.25, 0);
  scene.add(cube);

  // Piso con pocas subdivisiones: así la textura se deforma (affine) como en la Play.
  // El material PSX no usa texture.repeat: la repetición va en las UV.
  const floorTex = makeCheckerTexture(DR.verde, DR.verdeOscuro);
  const floorGeo = new THREE.PlaneGeometry(28, 28, 10, 10);
  const uv = floorGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 14, uv.getY(i) * 14);
  const floor = new THREE.Mesh(floorGeo, makePSXMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // Unas columnas para que la niebla tenga con qué lucirse.
  const colors = [DR.rojo, DR.amarillo, DR.rosa, DR.verdeClaro];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = 5 + (i % 3) * 2.2;
    scene.add(box(0.6, 3 + (i % 4), 0.6, makePSXMaterial({ color: colors[i % colors.length] }), Math.cos(a) * r, 1.5 + (i % 4) / 2, Math.sin(a) * r));
  }

  stage.scene = scene;
  stage.camera.fov = 50;
  stage.camera.updateProjectionMatrix();
  stage.onUpdate = (t) => {
    cube.rotation.y = t * 0.8;
    cube.rotation.x = Math.sin(t * 0.5) * 0.35;
    cube.position.y = 1.25 + Math.sin(t * 1.6) * 0.12;
    // La cámara da vueltas despacio, como la demo de un juego en la vidriera.
    // En vertical (celular) se aleja para que el cubo no tape toda la pantalla.
    const a = t * 0.2;
    const dist = 4.4 * Math.max(1, 1 / stage.camera.aspect);
    stage.camera.position.set(Math.sin(a) * dist, 1.9, Math.cos(a) * dist);
    stage.camera.lookAt(0, 1.15, 0);
  };
}
