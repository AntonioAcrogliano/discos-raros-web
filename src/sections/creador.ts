import { LOOK, LOOK_KEYS, LOOK_LABELS, type Look, type LookKey, NAME_MAX, type Raro, cleanName, randomLook, validLook } from '../../shared/look';
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

/** Menú de personalización: nombre + opciones, con el personaje en vivo al lado. */
export function openCreador(o: CreadorOptions) {
  const mine = o.mine();
  const start = mine ?? loadDraft();
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

  const rows = new Map<LookKey, () => void>();
  const opciones = el('div', 'opciones');
  for (const key of LOOK_KEYS) {
    const options = LOOK[key] as readonly string[];
    const valor = el('span', 'valor');
    const paint = () => {
      const v = options[look[key]];
      if (v.startsWith('#')) {
        const sw = el('span', 'muestra');
        sw.style.background = v;
        valor.replaceChildren(sw, `${look[key] + 1}/${options.length}`);
      } else valor.replaceChildren(el('span', '', v));
    };
    const step = (d: number) => {
      look[key] = (look[key] + d + options.length) % options.length;
      sfx.move();
      paint();
      preview();
    };
    const prev = el('button', 'btn chico', '<');
    const next = el('button', 'btn chico', '>');
    // Con teclado se maneja la fila entera (← →); los botones son para mouse y dedo.
    prev.tabIndex = next.tabIndex = -1;
    prev.type = next.type = 'button';
    prev.setAttribute('aria-label', `${LOOK_LABELS[key]} anterior`);
    next.setAttribute('aria-label', `${LOOK_LABELS[key]} siguiente`);
    prev.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    const row = el('div', 'opcion', [el('span', '', LOOK_LABELS[key]), prev, valor, next]);
    row.tabIndex = 0;
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', LOOK_LABELS[key]);
    row.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      step(e.key === 'ArrowLeft' ? -1 : 1);
    });
    rows.set(key, paint);
    paint();
    opciones.append(row);
  }

  const random = el('button', 'btn', 'AL AZAR');
  random.type = 'button';
  random.addEventListener('click', () => {
    Object.assign(look, randomLook());
    sfx.select();
    rows.forEach((paint) => paint());
    preview();
  });
  const save = el('button', 'btn rojo', mine ? 'GUARDAR CAMBIOS' : 'ENTRAR A LA PISTA');
  save.type = 'submit';
  const status = el('p', 'aviso', mine ? 'YA ESTAS EN LA PISTA. PODES CAMBIARTE CUANDO QUIERAS.' : 'ARMATE Y QUEDAS BAILANDO EN LA PISTA PARA SIEMPRE.');
  status.setAttribute('role', 'status');
  const captcha = el('div');
  const turnstile = mountTurnstile(captcha);

  const form = el('form', 'form', [
    el('label', 'campo creador-nombre', [el('span', '', `NOMBRE (HASTA ${NAME_MAX})`), input]),
    opciones,
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
