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

/** Dibujo de píxeles a partir de renglones de letras; cada letra es un color de `pal` ('.' = nada). */
function art(ctx: CanvasRenderingContext2D, rows: string[], pal: Record<string, string>, ox = 0, oy = 0) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = pal[row[x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  });
}

/**
 * Caras de 16×16 sobre blanco (el color de piel lo pone el material o la instancia).
 * El índice es el de LOOK.cara: contento, serio, enojado, sorprendido, dormido, bigote, barba,
 * lengua, guiño, hipnotizado, payaso, chicle, vampiro.
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
  if (kind === 10) px(DR.rojo, [6, 8, 4, 3], [7, 7, 2, 5]);
  else px('#c9b0b0', [7, 9, 2, 2]);
  // Ojos.
  if (kind === 4) px(DARK, [3, 8, 3, 1], [10, 8, 3, 1]);
  else if (kind === 3) {
    px(DARK, [2, 5, 4, 4], [10, 5, 4, 4]);
    px('#ffffff', [3, 6, 2, 2], [11, 6, 2, 2]);
    px(DARK, [4, 7, 1, 1], [12, 7, 1, 1]);
  } else if (kind === 9) {
    px(DARK, [1, 4, 5, 5], [10, 4, 5, 5]);
    px('#ffffff', [2, 5, 3, 3], [11, 5, 3, 3]);
    px(DARK, [3, 6, 1, 1], [12, 6, 1, 1]);
  } else if (kind === 8) {
    px(DARK, [3, 6, 3, 3], [10, 8, 3, 1], [9, 7, 1, 1], [13, 7, 1, 1]);
    px('#ffffff', [4, 6, 1, 1]);
  } else {
    px(DARK, [3, 6, 3, 3], [10, 6, 3, 3]);
    px('#ffffff', [4, 6, 1, 1], [11, 6, 1, 1]);
  }
  // Rombos del payaso arriba y abajo de los ojos.
  if (kind === 10) px('#3f49ad', [4, 3, 1, 3], [11, 3, 1, 3], [4, 9, 1, 2], [11, 9, 1, 2]);
  // Cejas del enojado (y del vampiro).
  if (kind === 2 || kind === 12) px(DARK, [2, 3, 2, 1], [4, 4, 2, 1], [12, 3, 2, 1], [10, 4, 2, 1]);
  // Boca.
  if (kind === 0 || kind === 8) px(DARK, [5, 13, 6, 1], [4, 12, 1, 1], [11, 12, 1, 1]);
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
  } else if (kind === 7) {
    px(DARK, [4, 12, 8, 1]);
    px('#ff5a7a', [6, 13, 4, 2], [7, 15, 2, 1]);
  } else if (kind === 9) px(DARK, [4, 13, 2, 1], [6, 12, 2, 1], [8, 13, 2, 1], [10, 12, 2, 1]);
  else if (kind === 10) {
    px(DR.rojo, [3, 12, 10, 2], [2, 11, 2, 1], [12, 11, 2, 1], [5, 14, 6, 1]);
    px(DARK, [5, 13, 6, 1]);
  } else if (kind === 11) {
    px('#ff8ad8', [5, 10, 6, 6], [4, 11, 8, 4]);
    px('#ffd8f0', [6, 11, 2, 1], [5, 12, 1, 1]);
  } else if (kind === 12) {
    px(DARK, [4, 12, 8, 2]);
    px('#ffffff', [5, 13, 1, 2], [10, 13, 1, 2]);
  } else px(DARK, [5, 12, 6, 1]);
  // El píxel de arriba a la izquierda queda liso: lo usan las otras caras de la cabeza.
  px('#ffffff', [0, 0, 1, 1]);
  return toPSXTexture(canvas);
}

/**
 * Estampas de remera de 16×16 con fondo transparente (se usan con `decal`).
 * El índice es el de LOOK.estampa menos uno: rayas, carita, disco, calavera, bastones, damero,
 * tie dye, alien, hongo, corazón, rayo, ojo, llamas, DR.
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
  const PAL = { K: DR.negro, W: DR.crema, R: DR.rojo, Y: DR.amarillo, G: '#7dff6a', B: '#2f6bb0' };
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
  } else if (kind === 3) {
    px(DR.crema, [5, 3, 6, 6], [4, 4, 8, 4], [6, 9, 4, 2]);
    px(DR.negro, [5, 5, 2, 2], [9, 5, 2, 2], [7, 8, 2, 1], [7, 10, 1, 1], [9, 10, 1, 1]);
  } else if (kind === 4) {
    for (let x = 1; x < S; x += 4) px(DR.crema, [x, 0, 2, S]);
  } else if (kind === 5) {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2) px(DR.crema, [x * 4, y * 4, 4, 4]);
  } else if (kind === 6) {
    const ring = [DR.rojo, DR.amarillo, '#00e5ff', '#ff5ad0', '#b6ff00'];
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = x - 7.5, dy = y - 7.5;
        const i = Math.floor(Math.hypot(dx, dy) * 0.62 + (Math.atan2(dy, dx) / (Math.PI * 2)) * 5 + 10);
        px(ring[i % 5], [x, y, 1, 1]);
      }
    }
  } else if (kind === 7) {
    art(ctx, ['..GGGGGG..', '.GGGGGGGG.', 'GGGGGGGGGG', 'GKKGGGGKKG', 'GKKKGGKKKG', 'GGKKGGKKGG', '.GGGGGGGG.', '..GGGGGG..', '...GKKG...', '....GG....'], PAL, 3, 2);
  } else if (kind === 8) {
    art(ctx, ['...RRRR...', '.RRWRRRRR.', 'RRRRRRWWRR', 'RWWRRRWWRR', 'RRRRRRRRRR', '..WWWWWW..', '...WWWW...', '...WWWW...', '..WWWWWW..'], PAL, 3, 3);
  } else if (kind === 9) {
    art(ctx, ['.RR...RR.', 'RRRR.RRRR', 'RRRRRRRRR', 'RRRRRRRRR', '.RRRRRRR.', '..RRRRR..', '...RRR...', '....R....'], { R: '#ff5ad0' }, 4, 3);
  } else if (kind === 10) {
    art(ctx, ['....YYYY', '...YYYY.', '..YYYY..', '.YYYYYY.', '...YYY..', '..YYY...', '.YYY....', '.YY.....', 'Y.......'], PAL, 4, 3);
  } else if (kind === 11) {
    art(ctx, ['...KKKKKK...', '.KKWWWWWWKK.', 'KWWWBBBBWWWK', 'KWWBBKKBBWWK', 'KWWWBBBBWWWK', '.KKWWWWWWKK.', '...KKKKKK...'], PAL, 2, 4);
  } else if (kind === 12) {
    const tall = [3, 5, 4, 7, 5, 9, 6, 4, 6, 10, 7, 5, 8, 4, 6, 3];
    tall.forEach((h, x) => {
      px(DR.rojo, [x, S - h, 1, h]);
      if (h > 2) px('#ff8a00', [x, S - h + 2, 1, h - 2]);
      if (h > 5) px(DR.amarillo, [x, S - h + 5, 1, h - 5]);
    });
  } else {
    const dr = ['DDDD..RRRR.', 'D...D.R...R', 'D...D.R...R', 'D...D.RRRR.', 'D...D.R.R..', 'D...D.R..R.', 'DDDD..R...R'];
    art(ctx, dr, { D: DR.negro, R: DR.negro }, 3, 5);
    art(ctx, dr, { D: DR.amarillo, R: DR.amarillo }, 2, 4);
  }
  return toPSXTexture(canvas);
}

/** Anteojos 3D de cartón: marco crema, un vidrio rojo y otro celeste. */
export function make3DGlassesTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(8, 4);
  ctx.fillStyle = DR.crema;
  ctx.fillRect(0, 0, 8, 4);
  ctx.fillStyle = DR.rojo;
  ctx.fillRect(1, 1, 2, 2);
  ctx.fillStyle = '#00e5ff';
  ctx.fillRect(5, 1, 2, 2);
  return toPSXTexture(canvas);
}

/** Anteojos de corazones, recortados (blanco: el color lo pone la instancia). */
export function makeHeartGlassesTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(16, 6);
  art(ctx, ['.WW.WW....WW.WW.', 'WWWWWWW..WWWWWWW', 'WWKKWWWWWWWKKWWW', '.WWKWW....WWKWW.', '..WWW......WWW..', '...W........W...'], { W: '#ffffff', K: '#8a8a9a' });
  return toPSXTexture(canvas);
}

/**
 * Casilleros de la paleta de detalle: [columna, fila]. Cada caja de un modelo apunta a uno.
 * Fila 0: tonos del color de la pieza (del más claro al más oscuro). Fila 1: colores fijos.
 */
export const DETAIL = {
  T0: [0, 0], T1: [1, 0], T2: [2, 0], T3: [3, 0],
  W: [0, 1], K: [1, 1], G: [2, 1], Y: [3, 1], R: [4, 1], C: [5, 1], P: [6, 1], B: [7, 1],
} as const;
export type DetailCell = readonly [number, number];
/** Punto de la textura (centro del casillero) para poner en los UV de una caja. */
export const detailUv = (c: DetailCell): [number, number] => [(c[0] + 0.5) / 8, (c[1] + 0.5) / 2];

/**
 * Paleta de 8×2 para los materiales con `detail`: con una sola malla y un solo color por
 * instancia, un modelo puede tener partes más oscuras y partes de color fijo.
 */
export function makeDetailTexture(): THREE.DataTexture {
  const shades = [255, 205, 160, 115, 255, 255, 255, 255];
  const fixed = [DR.crema, DR.negro, '#8a8a9a', DR.amarillo, DR.rojo, '#00e5ff', '#ff8ad8', '#2f6bb0'];
  const data = new Uint8Array(8 * 2 * 4);
  const c = new THREE.Color();
  for (let i = 0; i < 8; i++) {
    data.set([shades[i], shades[i], shades[i], 0], i * 4);
    c.set(fixed[i]);
    data.set([Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), 255], (8 + i) * 4);
  }
  const tex = new THREE.DataTexture(data, 8, 2, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
