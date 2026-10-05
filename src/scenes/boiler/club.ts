import * as THREE from 'three';
import {
  DR,
  DR_CYCLE,
  LOGO_ASPECT,
  type PSXMaterial,
  box,
  makeCanvas,
  makeLogoCanvas,
  makePSXMaterial,
  makeRecordTexture,
  makeSpeakerTexture,
  makeWallTexture,
  setPSXMap,
  toPSXTexture,
} from '../../style-kit';

/** Medidas del club (metros). La cámara mira hacia -z: cabina adelante, pista atrás, tele al fondo. */
export const CLUB = {
  halfW: 6.6,
  backZ: -5.3,
  frontZ: 4.2,
  ceilY: 5.6,
  boothZ: 2.5,
  boothH: 1.0,
  djZ: 1.62,
  tele: { x: 0, y: 4.15, z: -5.12, w: 4.8, h: 2.7 },
};

export interface Club {
  group: THREE.Group;
  /** Cabina y parlantes: se esconden mientras se crea un personaje, para verlo de cerca. */
  booth: THREE.Group;
  /** @param beats tiempo de baile en beats · @param energy 0–1 · @param t segundos */
  update(beats: number, energy: number, t: number): void;
}

const TAU = Math.PI * 2;

export function buildClub(): Club {
  const group = new THREE.Group();
  const booth = new THREE.Group();
  group.add(booth);
  const updaters: ((beats: number, energy: number, t: number) => void)[] = [];
  const { halfW, backZ, frontZ, ceilY } = CLUB;
  const depth = frontZ - backZ;

  // --- Pista: baldosas que cambian de color con el beat ------------------------------
  // Una sola textura con 4×4 píxeles por baldosa, que se redibuja en cada beat.
  const TX = 13, TZ = 10, PX = 4;
  const floorCv = makeCanvas(TX * PX, TZ * PX);
  const floorTex = toPSXTexture(floorCv.canvas);
  const floorGeo = new THREE.PlaneGeometry(halfW * 2, depth, TX, TZ);
  const floor = new THREE.Mesh(floorGeo, makePSXMaterial({ map: floorTex, lit: false }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, (frontZ + backZ) / 2);
  group.add(floor);
  let lastBeat = NaN;
  const tile = new THREE.Color();
  updaters.push((beats, energy) => {
    const beat = Math.floor(beats);
    if (beat === lastBeat) return;
    lastBeat = beat;
    const { ctx } = floorCv;
    ctx.fillStyle = '#08060c';
    ctx.fillRect(0, 0, TX * PX, TZ * PX);
    for (let z = 0; z < TZ; z++) {
      for (let x = 0; x < TX; x++) {
        const i = x * 7 + z * 3 + 40;
        const on = (i + beat) % 3 === 0;
        tile.set(DR_CYCLE[(i + beat) % DR_CYCLE.length]).multiplyScalar(on ? 0.35 + 0.5 * energy : 0.1);
        ctx.fillStyle = `#${tile.getHexString()}`;
        ctx.fillRect(x * PX, z * PX, PX - 1, PX - 1);
      }
    }
    floorTex.needsUpdate = true;
  });

  // --- Paredes y techo ---------------------------------------------------------------
  const wallTex = makeWallTexture();
  const wall = (w: number, h: number, repeatX: number, repeatY: number) => {
    const geo = new THREE.PlaneGeometry(w, h, Math.ceil(w / 2), Math.ceil(h / 2));
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repeatX, uv.getY(i) * repeatY);
    return new THREE.Mesh(geo, makePSXMaterial({ map: wallTex }));
  };
  const back = wall(halfW * 2, ceilY, 7, 3);
  back.position.set(0, ceilY / 2, backZ);
  const left = wall(depth, ceilY, 5, 3);
  left.rotation.y = Math.PI / 2;
  left.position.set(-halfW, ceilY / 2, (frontZ + backZ) / 2);
  const right = wall(depth, ceilY, 5, 3);
  right.rotation.y = -Math.PI / 2;
  right.position.set(halfW, ceilY / 2, (frontZ + backZ) / 2);
  group.add(back, left, right);

  // Tapas de discos colgadas en las paredes de los costados.
  const covers: [string, string][] = [[DR.crema, DR.rojo], [DR.amarillo, DR.verde], [DR.rosa, DR.rojo], [DR.verdeClaro, DR.amarillo], [DR.rojo, DR.crema]];
  covers.forEach(([bg, label], i) => {
    const mat = makePSXMaterial({ map: makeRecordTexture(bg, label), lit: false });
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), mat);
      p.position.set(side * (halfW - 0.02), 2.4 + ((i + (side > 0 ? 1 : 0)) % 2) * 1.1, backZ + 1 + i * 1.6);
      p.rotation.y = -side * (Math.PI / 2);
      group.add(p);
    }
  });

  // --- Tele del fondo: el marco y la pantalla "apagada" con el logo --------------------
  const { tele } = CLUB;
  const dark = makePSXMaterial({ color: '#0a0a0e' });
  group.add(box(tele.w + 0.4, tele.h + 0.4, 0.2, dark, tele.x, tele.y, tele.z - 0.08));
  group.add(box(0.3, ceilY - tele.y - tele.h / 2, 0.12, dark, tele.x, (ceilY + tele.y + tele.h / 2) / 2, tele.z - 0.08));
  const screenMat = makePSXMaterial({ color: '#141021', lit: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(tele.w, tele.h), screenMat);
  screen.position.set(tele.x, tele.y, tele.z + 0.03);
  group.add(screen);
  const teleLogo = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6 / LOGO_ASPECT), makePSXMaterial({ lit: false }));
  teleLogo.position.set(tele.x, tele.y, tele.z + 0.05);
  teleLogo.visible = false;
  group.add(teleLogo);

  // --- Luces: truss, haces que barren la pista y bola de espejos -----------------------
  const metal = makePSXMaterial({ color: '#3a3a44' });
  for (const z of [-2.2, 1.2]) group.add(box(halfW * 2, 0.12, 0.12, metal, 0, ceilY - 0.3, z));
  for (const x of [-4, 0, 4]) group.add(box(0.12, 0.12, 3.6, metal, x, ceilY - 0.3, -0.5));
  const beams: THREE.Mesh[] = [];
  const beamColors = [DR.rojo, DR.amarillo, DR.verdeClaro, DR.rosa, DR.amarillo, DR.rojo];
  beamColors.forEach((color, i) => {
    const geo = new THREE.CylinderGeometry(0.03, 0.55, 5.4, 6, 1, true);
    geo.translate(0, -2.7, 0);
    const beam = new THREE.Mesh(geo, makePSXMaterial({ color, lit: false, opacity: 0.2, side: THREE.DoubleSide }));
    beam.position.set(-5 + i * 2, ceilY - 0.35, i % 2 ? 1.2 : -2.2);
    beam.renderOrder = 2;
    group.add(beam, box(0.3, 0.3, 0.3, metal, beam.position.x, ceilY - 0.45, beam.position.z));
    beams.push(beam);
  });
  updaters.push((beats, energy) => {
    beams.forEach((b, i) => {
      b.rotation.z = 0.5 * Math.sin(TAU * beats * 0.0625 + i * 1.7);
      b.rotation.x = 0.4 * Math.sin(TAU * beats * 0.03125 + i);
      const pulse = 1 - (beats - Math.floor(beats));
      (b.material as PSXMaterial).uniforms.uOpacity.value = 0.05 + (0.1 + 0.16 * pulse) * energy;
    });
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), makePSXMaterial({ color: '#d8dce8' }));
  ball.position.set(0, ceilY - 0.95, 0.4);
  group.add(ball, box(0.03, 0.6, 0.03, metal, 0, ceilY - 0.35, 0.4));
  updaters.push((_b, _e, t) => (ball.rotation.y = t * 0.6));

  // --- Cabina -------------------------------------------------------------------------
  const { boothZ, boothH } = CLUB;
  const boothDark = makePSXMaterial({ color: '#15101c' });
  booth.add(box(3.6, boothH, 0.9, boothDark, 0, boothH / 2, boothZ));
  // Franjas rojas y amarillas arriba y abajo del frente, como en los reels.
  const stripe = makeCanvas(32, 2);
  for (let i = 0; i < 32; i++) {
    stripe.ctx.fillStyle = Math.floor(i / 2) % 2 ? DR.rojo : DR.amarillo;
    stripe.ctx.fillRect(i, 0, 1, 2);
  }
  const stripeMat = makePSXMaterial({ map: toPSXTexture(stripe.canvas), lit: false });
  for (const y of [0.07, boothH - 0.07]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.07), stripeMat);
    s.position.set(0, y, boothZ + 0.455);
    booth.add(s);
  }
  const boothLogo = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 1.32 / LOGO_ASPECT), makePSXMaterial({ lit: false }));
  boothLogo.position.set(0, boothH / 2, boothZ + 0.46);
  boothLogo.visible = false;
  booth.add(boothLogo);

  // Bandejas con discos girando, mixer con perillas y LEDs.
  const deck = makePSXMaterial({ color: '#2a2a32' });
  const vinyl = makePSXMaterial({ map: makeRecordTexture('#15101c', DR.rojo) });
  const discs: THREE.Mesh[] = [];
  for (const x of [-1.1, 1.1]) {
    booth.add(box(0.78, 0.07, 0.7, deck, x, boothH + 0.035, boothZ));
    const disc = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.02, 0.58), [deck, deck, vinyl, deck, deck, deck]);
    disc.position.set(x, boothH + 0.085, boothZ);
    booth.add(disc);
    discs.push(disc);
  }
  updaters.push((beats, energy) => discs.forEach((d, i) => (d.rotation.y = -beats * 1.1 * (i ? 1 : 0.97) * (0.2 + 0.8 * energy))));
  booth.add(box(0.62, 0.09, 0.66, deck, 0, boothH + 0.045, boothZ));
  const leds: PSXMaterial[] = [];
  for (let i = 0; i < 6; i++) {
    const m = makePSXMaterial({ color: '#202020', lit: false });
    leds.push(m);
    booth.add(box(0.05, 0.02, 0.05, m, -0.2 + (i % 2) * 0.4, boothH + 0.1, boothZ - 0.2 + Math.floor(i / 2) * 0.12));
  }
  for (const x of [-0.12, 0, 0.12]) booth.add(box(0.05, 0.05, 0.05, makePSXMaterial({ color: DR.crema }), x, boothH + 0.11, boothZ + 0.2));
  updaters.push((beats, energy) => {
    const level = (1 - (beats - Math.floor(beats))) * energy * 3.4;
    leds.forEach((m, i) => m.uniforms.uColor.value.set(Math.floor(i / 2) < level ? (i < 4 ? DR.verdeClaro : DR.rojo) : '#202020'));
  });

  // Parlantes a los costados: el de arriba late con el bombo.
  const speakerTex = makeSpeakerTexture();
  const cab = makePSXMaterial({ color: '#16161c' });
  const front = makePSXMaterial({ map: speakerTex });
  const pumping: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    for (const [y, pump] of [[0.65, false], [1.95, true]] as const) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.7), [cab, cab, cab, cab, front, cab]);
      s.position.set(side * 3.35, y, boothZ - 0.5);
      booth.add(s);
      if (pump) pumping.push(s);
    }
  }
  updaters.push((beats, energy) => {
    const kick = Math.max(0, 1 - (beats - Math.floor(beats)) * 3) * energy;
    pumping.forEach((s) => s.scale.setScalar(1 + kick * 0.05));
  });

  // El logo se carga aparte: cuando llega, se prende en la cabina y en la tele.
  void makeLogoCanvas(128).then((cv) => {
    const tex = toPSXTexture(cv);
    for (const m of [boothLogo, teleLogo]) {
      setPSXMap(m.material as PSXMaterial, tex);
      m.visible = true;
    }
  });

  return {
    group,
    booth,
    update(beats, energy, t) {
      for (const u of updaters) u(beats, energy, t);
    },
  };
}
