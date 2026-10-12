import { type Look, NAME_MAX, type Raro, cleanName, randomLook, validLook } from '../../shared/look';
import { saveRaro } from '../api';
import type { BoilerRoom } from '../scenes/boiler';
import { sfx } from '../style-kit';
import { mountTurnstile } from '../turnstile';
import { el } from '../ui/dom';
import { ui } from '../ui/shell';

/**
 * La lista de la puerta: cuando el patova revisa si estás anotado, se le dice el nombre y con
 * eso ya queda creado el raro (con un look al azar, que se puede cambiar ahí mismo las veces
 * que haga falta), parado en la puerta. Después se lo arma a gusto desde TU RARO.
 * El que ya tiene raro no pregunta nada: está en la lista.
 *
 * Devuelve el nombre con el que el patova lo hace pasar, o null si entra sin anotarse.
 */
export function askAtDoor(o: { room: BoilerRoom; mine: Raro | null; onSaved(raro: Raro, total: number): void }): Promise<string | null> {
  const saved = o.mine && validLook(o.mine.look);
  if (o.mine && saved) {
    o.room.setGuest(saved);
    return Promise.resolve(o.mine.name);
  }

  return new Promise((resolve) => {
    let look: Look = randomLook();
    o.room.setGuest(look);

    const input = el('input');
    input.maxLength = NAME_MAX;
    input.placeholder = 'TU NOMBRE';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', `Nombre de tu raro (hasta ${NAME_MAX} letras)`);
    const other = el('button', 'btn chico', 'OTRO LOOK');
    other.type = 'button';
    other.addEventListener('click', () => {
      sfx.select();
      look = randomLook();
      o.room.setGuest(look);
    });
    const enter = el('button', 'btn rojo', 'ENTRAR');
    enter.type = 'submit';
    const skip = el('button', 'btn chico', 'PASAR SIN ANOTARME');
    skip.type = 'button';
    const status = el('p', 'aviso', 'DESPUES LO ARMAS A TU GUSTO DESDE "TU RARO".');
    status.setAttribute('role', 'status');
    const captcha = el('div');
    const turnstile = mountTurnstile(captcha);

    const form = el('form', 'form', [
      el('p', 'aviso', 'A VER SI ESTAS EN LA LISTA... COMO TE LLAMAS?'),
      el('div', 'creador-nombre', [input, other]),
      captcha,
      el('div', 'fila', [enter, skip]),
      status,
    ]);
    const wrap = el('div', 'panel-wrap dock');
    const root = el('section', 'panel angosto', [el('header', 'panel-title', [el('span', '', 'LA LISTA')]), el('div', 'panel-body', [form])]);
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'La lista de la puerta');
    wrap.append(root);
    // La interfaz todavía no está en la página (se monta recién adentro): se la cuelga ahora.
    if (!ui.isConnected) document.body.append(ui);
    ui.append(wrap);

    const done = (name: string | null) => {
      window.removeEventListener('keydown', onKey, true);
      wrap.remove();
      resolve(name);
    };
    // Esc = pasar sin anotarse. Se frena acá para que no le llegue a nada más.
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.code !== 'Escape') return;
      e.preventDefault();
      pass();
    };
    const pass = () => {
      sfx.back();
      o.room.setGuest(null);
      done(null);
    };
    window.addEventListener('keydown', onKey, true);
    skip.addEventListener('click', pass);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const clean = cleanName(input.value);
      if (!clean) {
        sfx.error();
        status.className = 'error';
        status.textContent = input.value.trim() ? 'ESE NOMBRE NO VA. PROBA CON OTRO.' : 'TE FALTA EL NOMBRE.';
        return input.focus();
      }
      enter.disabled = other.disabled = skip.disabled = true;
      status.className = 'aviso';
      status.textContent = 'NOW SAVING...';
      try {
        const res = await saveRaro(clean, look, turnstile.token());
        sfx.start();
        o.onSaved(res.raro, res.total);
        done(res.raro.name);
      } catch (err) {
        sfx.error();
        status.className = 'error';
        status.textContent = (err as Error).message;
        turnstile.reset();
        enter.disabled = other.disabled = skip.disabled = false;
      }
    });
    // En el celular no abrir el teclado solo: tapa la escena.
    if (window.matchMedia('(pointer: fine)').matches) input.focus();
  });
}
