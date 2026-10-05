import * as THREE from 'three';
import { DR } from './palette';

/** Textura con filtro Nearest y sin mipmaps, como en PS1. */
export function toPSXTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

/** Oscurece (f < 1) o aclara (f > 1) un color. */
export function shade(color: THREE.ColorRepresentation, f: number): string {
  const c = new THREE.Color(color);
  c.setRGB(Math.min(1, c.r * f), Math.min(1, c.g * f), Math.min(1, c.b * f));
  return `#${c.getHexString()}`;
}

/** Damero de `cells`×`cells` (pisos, pistas). Se repite con RepeatWrapping. */
export function makeCheckerTexture(a: string, b: string, cells = 2, size = 16): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size, size);
  const s = size / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      ctx.fillStyle = (x + y) % 2 ? b : a;
      ctx.fillRect(x * s, y * s, s, s);
    }
  }
  const tex = toPSXTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Tapa de disco de 32×32: un vinilo sobre fondo de color, con borde. */
export function makeRecordTexture(bg: string = DR.crema, label: string = DR.rojo): THREE.CanvasTexture {
  const S = 32;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = shade(bg, 0.8);
  for (let i = 0; i < S; i += 4) ctx.fillRect(i, 0, 1, S);
  const disc = (r: number, color: string) => {
    ctx.fillStyle = color;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = x + 0.5 - S / 2, dy = y + 0.5 - S / 2;
        if (dx * dx + dy * dy <= r * r) ctx.fillRect(x, y, 1, 1);
      }
    }
  };
  disc(13, DR.negro);
  disc(10.5, '#22262e');
  disc(9, DR.negro);
  disc(5, label);
  disc(1.2, DR.amarillo);
  ctx.fillStyle = DR.negro;
  ctx.fillRect(0, 0, S, 1);
  ctx.fillRect(0, S - 1, S, 1);
  ctx.fillRect(0, 0, 1, S);
  ctx.fillRect(S - 1, 0, 1, S);
  return toPSXTexture(canvas);
}
