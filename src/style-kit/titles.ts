import { FONT } from './font';
import { DR } from './palette';

/**
 * Textos de videojuego dibujados en el canvas de la capa de textos (a la resolución interna),
 * con la fuente pixelada. Todo es función del tiempo. Portado de gameTitles.ts de la app de PCX:
 * por ahora PRESS START y el logo; STAGE, FIGHT!, K.O., etc. se portan cuando hagan falta.
 */

/** Tamaño base de letra: 8 px a 240 de alto, y de ahí para arriba. */
export function titleUnit(w: number, h: number) {
  return Math.max(6, Math.round((Math.min(w, h) / 240) * 8));
}

/** Tamaño de letra para que `s` entre en el ancho (con margen). */
export function fitSize(s: string, size: number, w: number, min = 6) {
  return Math.max(min, Math.min(size, Math.floor((w * 0.9) / Math.max(1, s.length))));
}

/** Texto con borde negro (y opcionalmente sombra corrida de color). */
export function outlined(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  fill: string | CanvasGradient,
  shadow?: string,
) {
  ctx.font = `${size}px ${FONT}`;
  const o = Math.max(1, Math.round(size / 8));
  if (shadow) {
    ctx.fillStyle = shadow;
    ctx.fillText(s, x + o * 2, y + o * 2);
  }
  ctx.fillStyle = DR.negro;
  for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, o], [-o, o], [o, -o]]) ctx.fillText(s, x + dx, y + dy);
  ctx.fillStyle = fill;
  ctx.fillText(s, x, y);
}

let logoSprite: HTMLCanvasElement | null = null;
/** El logo de verdad (ver makeLogoCanvas). Hasta que se carga, drawLogo lo escribe con letras. */
export function setLogoSprite(canvas: HTMLCanvasElement) {
  logoSprite = canvas;
}

/** Logo de Discos Raros con un rebote suave: el sprite si ya cargó, o el texto en dos renglones. */
export function drawLogo(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, y = h * 0.34) {
  const unit = titleUnit(w, h);
  const bob = Math.round(Math.sin(t * 2) * unit * 0.25);
  if (logoSprite) {
    // Agrandado en múltiplos enteros para que los píxeles queden parejos.
    const k = Math.max(1, Math.floor(Math.min((w * 0.8) / logoSprite.width, (h * 0.42) / logoSprite.height)));
    const lw = logoSprite.width * k, lh = logoSprite.height * k;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(logoSprite, Math.round((w - lw) / 2), Math.round(y - lh / 2) + bob, lw, lh);
    return;
  }
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const size = fitSize('DISCOS', unit * 3, w);
  ['DISCOS', 'RAROS'].forEach((line, i) => {
    const ly = Math.round(y - size * 0.6 + i * size * 1.25) + bob;
    const g = ctx.createLinearGradient(0, ly - size / 2, 0, ly + size / 2);
    g.addColorStop(0, DR.crema);
    g.addColorStop(0.5, DR.amarillo);
    g.addColorStop(1, DR.rojo);
    outlined(ctx, line, w / 2, ly, size, g, DR.verde);
  });
  ctx.restore();
}

/** PRESS START titilando, con el "©" chiquito abajo. */
export function drawPressStart(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, text = 'PRESS START') {
  const unit = titleUnit(w, h);
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const size = fitSize(text, Math.round(unit * 1.5), w);
  if (Math.floor(t * 2.5) % 2 === 0) outlined(ctx, text, w / 2, Math.round(h * 0.72), size, DR.amarillo, DR.rojo);
  outlined(ctx, '© 1997 DISCOS RAROS', w / 2, Math.round(h * 0.9), fitSize('© 1997 DISCOS RAROS', unit, w), DR.rosa);
  ctx.restore();
}
