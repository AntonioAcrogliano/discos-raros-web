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

/** ¿Es un celular o una tablet? (pantalla táctil sin mouse). */
export const isTouch = () => window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches;
