import '@fontsource/press-start-2p';

/** Fuente pixelada del sitio (canvas y CSS). */
export const FONT = '"Press Start 2P", monospace';

/** Esperar esto antes de dibujar texto en canvas: si no, sale con la fuente de reemplazo. */
export function fontsReady(): Promise<unknown> {
  return document.fonts.load(`8px ${FONT}`).catch(() => undefined);
}
