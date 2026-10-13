/**
 * La fuente pixelada dibuja mal las mayúsculas con tilde (la É parece un €): en los carteles
 * van sin tilde, como en los juegos de la época. La Ñ se queda.
 */
export const sinTildes = (s: string) => s.replace(/[ÁÉÍÓÚÜáéíóúü]/g, (c) => c.normalize('NFD')[0]);

/** Crear un elemento con clase y texto de cartel (o hijos). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  content: string | (Node | string)[] = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (typeof content === 'string') {
    if (content) e.textContent = sinTildes(content);
  } else e.append(...content);
  return e;
}

/**
 * Dibujito de píxeles para los botones: cada renglón es una fila y cada X un píxel. Toma el
 * color del texto del botón.
 */
export function pixIcon(rows: string[]): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'pix');
  svg.setAttribute('viewBox', `0 0 ${rows[0].length} ${rows.length}`);
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  let d = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] !== '.') d += `M${x} ${y}h1v1h-1z`;
  });
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

/** ¿Es un celular o una tablet? (pantalla táctil sin mouse). */
export const isTouch = () => window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches;
