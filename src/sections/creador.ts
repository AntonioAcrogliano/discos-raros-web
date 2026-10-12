import { LOOK, LOOK_GROUPS, LOOK_HIDDEN, LOOK_LABELS, type Look, type LookKey, NAME_MAX, type Raro, cleanName, randomLook, validLook } from '../../shared/look';
import { saveRaro } from '../api';
import type { BoilerRoom } from '../scenes/boiler';
import { makeFaceTexture, makePrintTexture, sfx } from '../style-kit';
import { mountTurnstile } from '../turnstile';
import { el } from '../ui/dom';
import { closeWindow, go, openPanel } from '../ui/shell';
import { OUTFIT_NAMES, outfit } from './outfits';

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
  /**
   * En la puerta del boliche: hay que armar el raro para entrar. La ventana no se puede
   * cerrar y, al guardar, en vez de volver a la pista avisa con qué nombre quedó.
   */
  door?: (name: string) => void;
}

/** Las caras y las estampas se dibujan una sola vez y se copian a los botones del menú. */
let faceArt: CanvasImageSource[] | null = null;
let printArt: (CanvasImageSource | null)[] | null = null;

/**
 * Menú de personalización: nombre + pestañas (conjuntos, cuerpo, cabeza, ropa, extras, baile)
 * con todas las opciones a la vista, y el personaje bailando en vivo al lado. La cámara se
 * acerca a lo que se está eligiendo y el personaje se gira arrastrándolo.
 * Con teclado: ↑↓ para moverse y ←→ para cambiar.
 */
export function openCreador(o: CreadorOptions) {
  const mine = o.mine();
  // Un guardado viejo puede no traer las opciones nuevas: validLook las completa.
  const saved = mine && validLook(mine.look);
  const start = (mine && saved ? { name: mine.name, look: saved } : null) ?? loadDraft();
  const look: Look = { ...(start?.look ?? randomLook()) };
  let name = start?.name ?? '';

  // Girar al personaje arrastrando afuera del menú.
  let spin = 0;
  let drag: { id: number; x: number; from: number } | null = null;
  const onDown = (e: PointerEvent) => {
    if ((e.target as Element).closest?.('.panel')) return;
    drag = { id: e.pointerId, x: e.clientX, from: spin };
  };
  const onMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    spin = drag.from + (e.clientX - drag.x) * 0.012;
    o.room.setSpin(spin);
  };
  const onUp = (e: PointerEvent) => {
    if (drag?.id === e.pointerId) drag = null;
  };
  window.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  const p = openPanel({
    title: o.door ? 'ARMA TU RARO PARA ENTRAR' : mine ? 'TU RARO' : 'CREA TU RARO',
    dock: true,
    fixed: Boolean(o.door),
    hints: o.door ? [['CLIC', 'ELEGIR'], ['ARRASTRA AFUERA', 'GIRARLO']] : [['↑↓', 'MOVER'], ['←→', 'CAMBIAR'], ['ESC', 'VOLVER']],
    onClose: () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      // En la puerta el raro se queda parado ahí: es el que entra.
      if (!o.door) o.room.setDraft(null);
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
  input.setAttribute('aria-label', `Nombre (hasta ${NAME_MAX} letras)`);
  input.addEventListener('input', () => {
    name = input.value;
    preview();
  });

  /** Repintan cada fila cuando cambia el look (al azar, un conjunto, o al tocar una opción). */
  const painters: (() => void)[] = [];
  const repaint = () => painters.forEach((paint) => paint());

  faceArt ??= LOOK.cara.map((_, i) => makeFaceTexture(i).image as CanvasImageSource);
  printArt ??= LOOK.estampa.map((_, i) => (i ? (makePrintTexture(i - 1).image as CanvasImageSource) : null));

  const row = (key: LookKey) => {
    const options = LOOK[key] as readonly string[];
    const isColor = options[0].startsWith('#');
    const shown = options.map((_, i) => i).filter((i) => !LOOK_HIDDEN[key]?.includes(i));
    const set = (i: number) => {
      look[key] = i;
      sfx.move();
      repaint();
      preview();
    };
    /** Pasa a la opción de al lado (salteando las que no se ofrecen). */
    const step = (d: number) => {
      const at = shown.indexOf(look[key]);
      set(shown[((at < 0 ? 0 : at + d) + shown.length) % shown.length]);
    };

    const valor = el('span', 'valor');
    const body = el('div', isColor ? 'muestras' : key === 'cara' || key === 'estampa' ? 'fichas dibujos' : 'fichas');
    /** Dibujitos de 16×16 (caras y estampas) con el color de piel o de remera de ahora. */
    const icons: { i: number; ctx: CanvasRenderingContext2D }[] = [];
    const buttons = shown.map((i) => {
      const b = el('button', isColor ? 'muestra' : 'ficha');
      b.type = 'button';
      // Con teclado se maneja la fila entera (← →); los botones son para mouse y dedo.
      b.tabIndex = -1;
      b.setAttribute('aria-label', isColor ? `${LOOK_LABELS[key]} ${i + 1}` : options[i]);
      if (isColor) b.style.background = options[i];
      else if (key === 'cara' || key === 'estampa') {
        const c = el('canvas');
        c.width = c.height = 16;
        icons.push({ i, ctx: c.getContext('2d')! });
        b.title = options[i];
        b.append(c);
      } else b.textContent = options[i];
      b.addEventListener('click', () => set(i));
      return b;
    });
    body.append(...buttons);

    painters.push(() => {
      buttons.forEach((b, j) => {
        const on = shown[j] === look[key];
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      });
      valor.textContent = isColor ? '' : options[look[key]];
      for (const { i, ctx } of icons) {
        ctx.globalCompositeOperation = 'source-over';
        if (key === 'cara') {
          // La cara es blanca y se multiplica por la piel, igual que en 3D.
          ctx.drawImage(faceArt![i], 0, 0);
          ctx.globalCompositeOperation = 'multiply';
          ctx.fillStyle = LOOK.piel[look.piel];
          ctx.fillRect(0, 0, 16, 16);
        } else {
          ctx.fillStyle = LOOK.remera[look.remera];
          ctx.fillRect(0, 0, 16, 16);
          const print = printArt![i];
          if (print) ctx.drawImage(print, 0, 0);
        }
      }
    });

    const r = el('div', 'opcion', [el('div', 'opcion-titulo', [el('span', 'etiqueta', LOOK_LABELS[key]), valor]), body]);
    r.tabIndex = 0;
    r.setAttribute('role', 'group');
    r.setAttribute('aria-label', LOOK_LABELS[key]);
    r.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      step(e.key === 'ArrowLeft' ? -1 : 1);
      buttons[shown.indexOf(look[key])]?.scrollIntoView({ block: 'nearest' });
    });
    r.addEventListener('focus', () => sfx.move());
    return r;
  };

  // Conjuntos: ropa y accesorios armados, para arrancar de algo y después tocar.
  const outfits = el('div', 'fichas grandes');
  for (const n of OUTFIT_NAMES) {
    const b = el('button', 'ficha', n);
    b.type = 'button';
    b.addEventListener('click', () => {
      Object.assign(look, outfit(n));
      sfx.select();
      repaint();
      preview();
    });
    outfits.append(b);
  }
  const outfitsPage = el('div', 'opciones', [
    el('p', 'aviso', 'ELEGI UN CONJUNTO Y DESPUES CAMBIALE LO QUE QUIERAS EN LAS OTRAS PESTAÑAS.'),
    outfits,
  ]);

  // Pestañas: un grupo de opciones a la vez, así el menú no es una lista eterna.
  const tabs = el('div', 'pestanas');
  tabs.setAttribute('role', 'tablist');
  const sections = [{ name: 'CONJUNTOS', view: 'todo' as const, page: outfitsPage }, ...LOOK_GROUPS.map((g) => ({ name: g.name, view: g.view, page: el('div', 'opciones', g.keys.map(row)) }))];
  const tabButtons = sections.map((g, i) => {
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
    sections.forEach((g, j) => (g.page.hidden = j !== i));
    tabButtons.forEach((b, j) => {
      b.classList.toggle('on', j === i);
      b.setAttribute('aria-selected', String(j === i));
    });
    tabButtons[i].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    p.body.scrollTop = 0;
    o.room.setView(sections[i].view);
  };

  const random = el('button', 'btn', 'AL AZAR');
  random.type = 'button';
  random.addEventListener('click', () => {
    // El baile no se sortea: es lo que más se elige a propósito.
    Object.assign(look, randomLook(), { baile: look.baile });
    sfx.select();
    repaint();
    preview();
  });
  const save = el('button', 'btn rojo', mine ? 'GUARDAR CAMBIOS' : 'ENTRAR A LA PISTA');
  save.type = 'submit';
  const status = el('p', 'aviso', o.door ? 'SIN RARO NO SE ENTRA. ARMATE Y PASAS.' : mine ? 'YA ESTAS EN LA PISTA. PODES CAMBIARTE CUANDO QUIERAS.' : 'ARMATE Y QUEDAS BAILANDO EN LA PISTA PARA SIEMPRE.');
  status.setAttribute('role', 'status');
  const captcha = el('div');
  const turnstile = mountTurnstile(captcha);

  const form = el('form', 'form creador', [
    el('div', 'creador-nombre', [input, random]),
    tabs,
    ...sections.map((g) => g.page),
    el('div', 'creador-pie', [captcha, save, status]),
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
      if (o.door) {
        closeWindow();
        o.door(res.raro.name);
      } else go('');
    } catch (err) {
      sfx.error();
      status.className = 'error';
      status.textContent = (err as Error).message;
      turnstile.reset();
      save.disabled = false;
    }
  });

  p.body.append(form);
  repaint();
  // Quien ya tiene personaje viene a retocarlo; el que no, arranca por los conjuntos.
  show(mine ? 1 : 0);
  preview();
  // En el celular no abrir el teclado de entrada: tapa al personaje.
  if (window.matchMedia('(pointer: fine)').matches) input.focus();
}
