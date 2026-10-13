/**
 * Paleta de Discos Raros (la misma de la app de PCX). Cambiando acá cambia en todo el sitio.
 * Los mismos colores están como variables CSS en kit.css.
 */
export const DR = {
  rojo: '#ff004a',
  amarillo: '#ffe600',
  verde: '#016239',
  rosa: '#fee0ea',
  crema: '#f9f2e8',
  negro: '#0f1217',
  /** Tonos derivados (sombras y degradés). */
  rojoOscuro: '#7a0024',
  verdeClaro: '#028a50',
  verdeOscuro: '#01361f',
} as const;

/** Lo que no es de la marca pero hace al boliche: hormigón, fierros y luces de antro. */
export const ANTRO = {
  hormigon: '#44444c',
  piso: '#35353c',
  acero: '#34363e',
  fierro: '#17181d',
  /** Luz fría (tubos, blinders, la escena "blanca"). */
  frio: '#cfe0ff',
  laser: '#3dff8a',
  /** Niebla del boliche: casi negra. */
  humo: '#08080c',
} as const;

/** Colores en orden para ciclos (arcoíris de NEW RECORD!, baldosas de la pista…). */
export const DR_CYCLE = [DR.rojo, DR.amarillo, DR.verdeClaro, DR.rosa, DR.crema] as const;
