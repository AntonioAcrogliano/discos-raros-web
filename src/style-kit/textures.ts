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

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar ${url}`));
    img.src = url;
  });
}

/** Proporción del logo de Discos Raros (ancho / alto). */
export const LOGO_ASPECT = 1712 / 992;

let logoImage: Promise<HTMLImageElement> | null = null;

/**
 * El logo de DR achicado a `w` píxeles de ancho, con los bordes duros (cada píxel opaco o
 * transparente) para que se vea como un sprite de la Play.
 */
export async function makeLogoCanvas(w = 128): Promise<HTMLCanvasElement> {
  logoImage ??= loadImage(`${import.meta.env.BASE_URL}brand/logo-dr.png`);
  const img = await logoImage;
  const h = Math.round(w / LOGO_ASPECT);
  // Reducir de a mitades para que no quede serruchado.
  let src: CanvasImageSource = img;
  let sw = img.naturalWidth, sh = img.naturalHeight;
  while (sw / 2 >= w * 2) {
    const step = makeCanvas(Math.round(sw / 2), Math.round(sh / 2));
    step.ctx.imageSmoothingEnabled = true;
    step.ctx.imageSmoothingQuality = 'high';
    step.ctx.drawImage(src, 0, 0, sw, sh, 0, 0, step.canvas.width, step.canvas.height);
    src = step.canvas;
    sw = step.canvas.width;
    sh = step.canvas.height;
  }
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, sw, sh, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  for (let i = 3; i < data.data.length; i += 4) data.data[i] = data.data[i] >= 128 ? 255 : 0;
  ctx.putImageData(data, 0, 0);
  return canvas;
}

/** Pared de paneles oscuros (32×32, se repite). */
export function makeWallTexture(base = '#1b1426', line = '#0c0812'): THREE.CanvasTexture {
  const S = 32;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  let seed = 5;
  const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = r() > 0.5 ? shade(base, 1.25) : shade(base, 0.8);
    ctx.fillRect(Math.floor(r() * S), Math.floor(r() * S), 1, 1);
  }
  ctx.fillStyle = line;
  ctx.fillRect(0, 0, S, 1);
  ctx.fillRect(0, 16, S, 1);
  ctx.fillRect(0, 0, 1, 16);
  ctx.fillRect(16, 16, 1, 16);
  const tex = toPSXTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Parlante visto de frente: caja con dos conos. */
export function makeSpeakerTexture(): THREE.CanvasTexture {
  const W = 32, H = 48;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#16161c';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#2c2c36';
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  const cone = (cx: number, cy: number, r: number) => {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d > r) continue;
        ctx.fillStyle = d > r - 1.5 ? '#3a3a46' : d < r * 0.35 ? '#4a4a58' : '#0a0a0e';
        ctx.fillRect(cx + x, cy + y, 1, 1);
      }
    }
  };
  cone(16, 31, 12);
  cone(16, 10, 6);
  return toPSXTexture(canvas);
}

/**
 * Caras de 16×16 sobre blanco (el color de piel lo pone el material o la instancia).
 * El índice es el de LOOK.cara: contento, serio, enojado, sorprendido, dormido, bigote, barba.
 */
export function makeFaceTexture(kind = 1): THREE.CanvasTexture {
  const S = 16;
  const { canvas, ctx } = makeCanvas(S, S);
  const px = (color: string, ...rects: [number, number, number, number][]) => {
    ctx.fillStyle = color;
    for (const [x, y, w, h] of rects) ctx.fillRect(x, y, w, h);
  };
  const DARK = '#17131a', HAIR = '#3a2a22';
  px('#ffffff', [0, 0, S, S]);
  // Nariz.
  px('#c9b0b0', [7, 9, 2, 2]);
  // Ojos.
  if (kind === 4) px(DARK, [3, 8, 3, 1], [10, 8, 3, 1]);
  else if (kind === 3) {
    px(DARK, [2, 5, 4, 4], [10, 5, 4, 4]);
    px('#ffffff', [3, 6, 2, 2], [11, 6, 2, 2]);
    px(DARK, [4, 7, 1, 1], [12, 7, 1, 1]);
  } else {
    px(DARK, [3, 6, 3, 3], [10, 6, 3, 3]);
    px('#ffffff', [4, 6, 1, 1], [11, 6, 1, 1]);
  }
  // Cejas del enojado.
  if (kind === 2) px(DARK, [2, 3, 2, 1], [4, 4, 2, 1], [12, 3, 2, 1], [10, 4, 2, 1]);
  // Boca.
  if (kind === 0) px(DARK, [5, 13, 6, 1], [4, 12, 1, 1], [11, 12, 1, 1]);
  else if (kind === 2) px(DARK, [5, 12, 6, 1], [4, 13, 1, 1], [11, 13, 1, 1]);
  else if (kind === 3) px(DARK, [7, 12, 2, 3]);
  else if (kind === 4) px(DARK, [7, 12, 3, 1]);
  else if (kind === 5) {
    px(HAIR, [4, 11, 8, 2], [3, 12, 1, 2], [12, 12, 1, 2]);
    px(DARK, [6, 14, 4, 1]);
  } else if (kind === 6) {
    px(HAIR, [0, 10, S, 6], [0, 7, 2, 3], [14, 7, 2, 3]);
    px('#ffffff', [6, 9, 4, 2]);
    px('#c9b0b0', [7, 9, 2, 2]);
    px(DARK, [6, 12, 4, 1]);
  } else px(DARK, [5, 12, 6, 1]);
  // El píxel de arriba a la izquierda queda liso: lo usan las otras caras de la cabeza.
  px(kind === 6 ? '#ffffff' : '#ffffff', [0, 0, 1, 1]);
  return toPSXTexture(canvas);
}

/**
 * Estampas de remera de 16×16 con fondo transparente (se usan con `decal`).
 * El índice es el de LOOK.estampa menos uno: rayas, carita, disco, calavera.
 */
export function makePrintTexture(kind: number): THREE.CanvasTexture {
  const S = 16;
  const { canvas, ctx } = makeCanvas(S, S);
  const px = (color: string, ...rects: [number, number, number, number][]) => {
    ctx.fillStyle = color;
    for (const [x, y, w, h] of rects) ctx.fillRect(x, y, w, h);
  };
  const disc = (cx: number, cy: number, r: number, color: string) => {
    ctx.fillStyle = color;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) ctx.fillRect(x, y, 1, 1);
  };
  if (kind === 0) px(DR.crema, [0, 3, S, 2], [0, 7, S, 2], [0, 11, S, 2]);
  else if (kind === 1) {
    disc(8, 7, 5.2, DR.negro);
    disc(8, 7, 4.3, DR.amarillo);
    px(DR.negro, [6, 5, 1, 2], [9, 5, 1, 2], [5, 8, 1, 1], [10, 8, 1, 1], [6, 9, 4, 1]);
  } else if (kind === 2) {
    disc(8, 7, 5.2, DR.crema);
    disc(8, 7, 4.5, DR.negro);
    disc(8, 7, 1.9, DR.rojo);
    px(DR.amarillo, [7, 6, 2, 2]);
  } else {
    px(DR.crema, [5, 3, 6, 6], [4, 4, 8, 4], [6, 9, 4, 2]);
    px(DR.negro, [5, 5, 2, 2], [9, 5, 2, 2], [7, 8, 2, 1], [7, 10, 1, 1], [9, 10, 1, 1]);
  }
  return toPSXTexture(canvas);
}
