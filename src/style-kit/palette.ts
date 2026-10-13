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

/** Colores en orden para ciclos (arcoíris de NEW RECORD!, baldosas de la pista…). */
export const DR_CYCLE = [DR.rojo, DR.amarillo, DR.verdeClaro, DR.rosa, DR.crema] as const;
