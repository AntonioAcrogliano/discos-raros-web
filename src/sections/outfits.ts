import { LOOK, type Look, type LookKey } from '../../shared/look';

/**
 * Conjuntos armados para el creador: cambian la ropa y los accesorios de un saque y dejan lo
 * demás (cuerpo, baile) como estaba. Se escriben con el nombre de cada opción, no con el índice.
 */
const OUTFITS: Record<string, Partial<Record<LookKey, string>>> = {
  CYBER: { arriba: 'ARNES', remera: '#0f1217', estampa: 'LISA', abajo: 'ANCHO', pantalon: '#1a1a1a', calzado: 'PLATAFORMAS', zapas: '#0f1217', accesorio: 'ANTENITAS', anteojos: 'RAVE', boca: 'BARBIJO', encima: 'NADA', mano: 'PALITOS DE LUZ', neon: '#b6ff00' },
  HADA: { arriba: 'TOP', remera: '#fee0ea', estampa: 'CORAZON', abajo: 'TUTU', pantalon: '#ff5ad0', calzado: 'PLATAFORMAS', zapas: '#ff5ad0', accesorio: 'CORONA', anteojos: 'CORAZONES', boca: 'CHUPETIN', encima: 'ALAS', mano: 'PULSERAS', neon: '#ff5ad0', pelo: 'RODETES', peloColor: '#ff5ad0' },
  OBRERO: { arriba: 'CHALECO', remera: '#f9f2e8', estampa: 'LISA', abajo: 'LARGO', pantalon: '#5a6a8a', calzado: 'BOTAS', zapas: '#0f1217', accesorio: 'CASCO', anteojos: 'ANTIPARRAS', boca: 'SILBATO', encima: 'NADA', mano: 'AGUA', neon: '#ff8a00' },
  PLAYERO: { arriba: 'EN CUERO', estampa: 'LISA', abajo: 'SHORT', pantalon: '#00e5ff', calzado: 'DESCALZO', accesorio: 'PILUSO', anteojos: 'OSCUROS', boca: 'NADA', encima: 'RIÑONERA', mano: 'ABANICO', neon: '#ffe600' },
  GABBER: { pelo: 'PELADO', cara: 'ENOJADO', arriba: 'BUZO', remera: '#f9f2e8', estampa: 'BASTONES', abajo: 'LARGO', pantalon: '#1a1a1a', calzado: 'ZAPAS', zapas: '#f9f2e8', accesorio: 'NADA', anteojos: 'NADA', boca: 'NADA', encima: 'CADENA', mano: 'NADA' },
  'RAVER 90': { pelo: 'DOS COLITAS', arriba: 'REMERA', remera: '#b6ff00', estampa: 'CARITA', abajo: 'ANCHO', pantalon: '#ff7a3c', calzado: 'ZAPAS', zapas: '#f9f2e8', accesorio: 'VINCHA', anteojos: 'NADA', boca: 'CHUPETE', encima: 'MOCHILA', mano: 'GUANTES', neon: '#00e5ff' },
  ALIEN: { piel: '#7dff6a', cara: 'HIPNOTIZADO', pelo: 'PELADO', arriba: 'REMERA', remera: '#c8c8d0', estampa: 'ALIEN', abajo: 'LARGO', pantalon: '#c8c8d0', calzado: 'BOTAS', zapas: '#9a4dff', accesorio: 'ANTENITAS', anteojos: 'NADA', boca: 'NADA', encima: 'NADA', mano: 'PALITOS DE LUZ', neon: '#9a4dff' },
  ELFA: { piel: '#f0d0b8', cara: 'GUIÑO', pelo: 'LARGO', peloColor: '#c09050', arriba: 'VESTIDO', remera: '#016239', estampa: 'LISA', abajo: 'SHORT', pantalon: '#6a4a2a', calzado: 'BOTAS', zapas: '#6a4a2a', accesorio: 'OREJAS DE ELFA', anteojos: 'NADA', boca: 'NADA', encima: 'CAPA', mano: 'PULSERAS', neon: '#016239' },
  ANGEL: { cara: 'CONTENTO', pelo: 'RULOS', peloColor: '#c09050', arriba: 'VESTIDO', remera: '#f9f2e8', estampa: 'LISA', abajo: 'SHORT', pantalon: '#f9f2e8', calzado: 'DESCALZO', accesorio: 'AUREOLA', anteojos: 'NADA', boca: 'NADA', encima: 'ALAS DE ANGEL', mano: 'NADA', neon: '#ffe600' },
  DIABLO: { cara: 'VAMPIRO', arriba: 'EN CUERO', estampa: 'LLAMAS', abajo: 'LARGO', pantalon: '#7a0024', calzado: 'BOTAS', zapas: '#0f1217', accesorio: 'CUERNOS', anteojos: 'NADA', boca: 'NADA', encima: 'CAPA', mano: 'NADA', neon: '#ff004a' },
};

export const OUTFIT_NAMES = Object.keys(OUTFITS);

/** Los campos del look que cambia un conjunto. */
export function outfit(name: string): Partial<Look> {
  const out: Partial<Look> = {};
  for (const [k, v] of Object.entries(OUTFITS[name] ?? {}) as [LookKey, string][]) {
    const i = (LOOK[k] as readonly string[]).indexOf(v);
    if (i >= 0) out[k] = i;
    else if (import.meta.env.DEV) console.warn(`Conjunto ${name}: no existe ${k} = ${v}`);
  }
  return out;
}
