import { LOOK, LOOK_GROUPS, LOOK_LABELS, type Look, type LookKey, NAME_MAX, type Raro, cleanName, randomLook, validLook } from '../../shared/look';
import { saveRaro } from '../api';
import type { BoilerRoom } from '../scenes/boiler';
import { sfx } from '../style-kit';
import { mountTurnstile } from '../turnstile';
import { el } from '../ui/dom';
import { go, openPanel } from '../ui/shell';

const DRAFT_KEY = 'dr-raro';

function loadDraft(): { name: string; look: Look } | null {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
    const look = validLook(d?.look);
    return look ? { name: typeof d.name === 'string' ? d.name : '', look } : null;
  } catch {
    return null;
  }
}

export interface CreadorOptions {
  room: BoilerRoom;
  /** El personaje que este dispositivo ya tiene guardado (si tiene). */
  mine: () => Raro | null;
  onSaved: (raro: Raro, total: number) => void;
}

/**
 * Menú de personalización: nombre + opciones en pestañas (cuerpo, pelo, ropa, baile), con el
 * personaje girando en vivo al lado. Los colores se eligen tocando la muestra; el resto, con
 * las flechitas. Con teclado: ↑↓ para moverse y ←→ para cambiar.
 */
export function openCreador(o: CreadorOptions) {
  const mine = o.mine();
  // Un guardado viejo puede no traer las opciones nuevas: ahí se arranca de uno al azar.
  const start = (mine && validLook(mine.look) ? mine : null) ?? loadDraft();
  const look: Look = { ...(start?.look ?? randomLook()) };
  let name = start?.name ?? '';

  const p = openPanel({
    title: mine ? 'TU RARO' : 'CREA TU RARO',
    dock: true,
    hints: [['↑↓', 'MOVER'], ['←→', 'CAMBIAR'], ['ESC', 'VOLVER']],
    onClose: () => {
      o.room.setDraft(null);
      o.room.setMode('pista');
    },
  });
  o.room.setMode('creador');

  const preview = () => {
    o.room.setDraft({ name: cleanName(name) ?? '', look });
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ name, look }));
    } catch {
      /* sin almacenamiento */
    }
  };

  const input = el('input');
  input.maxLength = NAME_MAX;
  input.value = name;
  input.placeholder = 'TU NOMBRE';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.addEventListener('input', () => {
    name = input.value;
    preview();
  });

  /** Repintan cada fila cuando cambia el look (al azar, o al tocar una opción). */
  const painters: (() => void)[] = [];

  const row = (key: LookKey) => {
    const options = LOOK[key] as readonly string[];
    const isColor = options[0].startsWith('#');
    const set = (i: number) => {
      look[key] = (i + options.length) % options.length;
      sfx.move();
      paint();
      preview();
    };
    const body = el('div', isColor ? 'muestras' : 'selector');
    let paint: () => void;
    if (isColor) {
      // Paleta: se toca el color directo.
      const swatches = options.map((hex, i) => {
        const b = el('button', 'muestra');
        b.type = 'button';
        b.tabIndex = -1;
        b.style.background = hex;
        b.setAttribute('aria-label', `${LOOK_LABELS[key]} ${i + 1}`);
        b.addEventListener('click', () => set(i));
        return b;
      });
      body.append(...swatches);
      paint = () => swatches.forEach((b, i) => b.classList.toggle('on', i === look[key]));
    } else {
      const prev = el('button', 'btn chico', '<');
      const next = el('button', 'btn chico', '>');
      const valor = el('span', 'valor');
      prev.type = next.type = 'button';
      // Con teclado se maneja la fila entera (← →); los botones son para mouse y dedo.
      prev.tabIndex = next.tabIndex = -1;
      prev.setAttribute('aria-label', `${LOOK_LABELS[key]} anterior`);
      next.setAttribute('aria-label', `${LOOK_LABELS[key]} siguiente`);
      prev.addEventListener('click', () => set(look[key] - 1));
      next.addEventListener('click', () => set(look[key] + 1));
      body.append(prev, valor, next);
      paint = () => valor.replaceChildren(el('span', '', options[look[key]]), el('small', '', `${look[key] + 1}/${options.length}`));
    }
    const r = el('div', 'opcion', [el('span', 'etiqueta', LOOK_LABELS[key]), body]);
    r.tabIndex = 0;
    r.setAttribute('role', 'group');
    r.setAttribute('aria-label', LOOK_LABELS[key]);
    r.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      set(look[key] + (e.key === 'ArrowLeft' ? -1 : 1));
    });
    r.addEventListener('focus', () => sfx.move());
    painters.push(paint);
    paint();
    return r;
  };

  // Pestañas: un grupo de opciones a la vez, así el menú no es una lista eterna.
  const tabs = el('div', 'pestanas');
  tabs.setAttribute('role', 'tablist');
  const pages = LOOK_GROUPS.map((g) => el('div', 'opciones', g.keys.map(row)));
  const tabButtons = LOOK_GROUPS.map((g, i) => {
    const b = el('button', 'btn chico', g.name);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => {
      sfx.select();
      show(i);
    });
    tabs.append(b);
    return b;
  });
  const show = (i: number) => {
    pages.forEach((pg, j) => (pg.hidden = j !== i));
    tabButtons.forEach((b, j) => {
      b.classList.toggle('on', j === i);
      b.setAttribute('aria-selected', String(j === i));
    });
  };
  show(0);

  const random = el('button', 'btn', 'AL AZAR');
  random.type = 'button';
  random.addEventListener('click', () => {
    Object.assign(look, randomLook());
    sfx.select();
    painters.forEach((paint) => paint());
    preview();
  });
  const save = el('button', 'btn rojo', mine ? 'GUARDAR CAMBIOS' : 'ENTRAR A LA PISTA');
  save.type = 'submit';
  const status = el('p', 'aviso', mine ? 'YA ESTAS EN LA PISTA. PODES CAMBIARTE CUANDO QUIERAS.' : 'ARMATE Y QUEDAS BAILANDO EN LA PISTA PARA SIEMPRE.');
  status.setAttribute('role', 'status');
  const captcha = el('div');
  const turnstile = mountTurnstile(captcha);

  const form = el('form', 'form creador', [
    el('label', 'campo creador-nombre', [el('span', '', `NOMBRE (HASTA ${NAME_MAX})`), input]),
    tabs,
    ...pages,
    captcha,
    el('div', 'fila', [random, save]),
    status,
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const clean = cleanName(name);
    if (!clean) {
      sfx.error();
      status.className = 'error';
      status.textContent = name.trim() ? 'ESE NOMBRE NO VA. PROBA CON OTRO.' : 'TE FALTA EL NOMBRE.';
      return input.focus();
    }
    save.disabled = true;
    status.className = 'aviso';
    status.textContent = 'NOW SAVING...';
    try {
      const res = await saveRaro(clean, look, turnstile.token());
      sfx.start();
      o.onSaved(res.raro, res.total);
      go('');
    } catch (err) {
      sfx.error();
      status.className = 'error';
      status.textContent = (err as Error).message;
      turnstile.reset();
      save.disabled = false;
    }
  });

  p.body.append(form);
  preview();
  // En el celular no abrir el teclado de entrada: tapa al personaje.
  if (window.matchMedia('(pointer: fine)').matches) input.focus();
}
