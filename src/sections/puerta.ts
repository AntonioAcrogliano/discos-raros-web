import { type Raro, validLook } from '../../shared/look';
import type { BoilerRoom } from '../scenes/boiler';
import { openCreador } from './creador';

/**
 * La lista de la puerta. El que ya tiene raro está anotado: aparece parado frente al patova y
 * pasa. El que no, tiene que armarlo ahí mismo: se abre el creador completo (el mismo de TU
 * RARO), con el personaje parado en la vereda, y no se entra hasta guardarlo.
 *
 * Devuelve el nombre con el que el patova lo hace pasar.
 */
export function askAtDoor(o: { room: BoilerRoom; mine: Raro | null; onSaved(raro: Raro, total: number): void }): Promise<string | null> {
  const saved = o.mine && validLook(o.mine.look);
  if (o.mine && saved) {
    o.room.setGuest(saved);
    return Promise.resolve(o.mine.name);
  }
  return new Promise((resolve) => openCreador({ room: o.room, mine: () => null, onSaved: o.onSaved, door: resolve }));
}
