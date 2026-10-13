import { redesLinks } from '../redes';
import { sfx } from '../style-kit';
import { el, isTouch, pixIcon } from './dom';
import './ui.css';

/**
 * La "carcasa" de la interfaz: barra de abajo, cartel de arriba y ventanas. Todo se maneja con
 * mouse, dedo o teclado (flechas para moverse, Enter para elegir, Esc para volver).
 */

export const ui = el('div', 'ui');
const hud = el('div', 'hud');
export const hudContador = el('div', 'contador');
/** Reproductor: qué set suena, con anterior / pausa / siguiente y el link a YouTube. */
const suena = el('div', 'suena');
suena.hidden = true;
const titulo = el('div', 'titulo');
const tituloTexto = el('span');
titulo.append(tituloTexto);
const ctrl = (label: string, aria: string) => {
  const b = el('button', 'btn chico', label);
  b.type = 'button';
  b.setAttribute('aria-label', aria);
  b.addEventListener('click', () => sfx.select());
  return b;
};
const prev = ctrl('<<', 'Set anterior');
const toggle = ctrl('||', 'Pausar');
const next = ctrl('>>', 'Set siguiente');
const verYt = el('a', 'btn chico', 'VER EN YT');
verYt.target = '_blank';
verYt.rel = 'noopener';
const todos = el('a', 'btn chico', 'MAS DISCOS');
todos.href = '#/sets';
todos.setAttribute('aria-label', 'Todos los sets');
// Volumen: una tira de casilleros, como el vúmetro de un equipo. Tocar uno deja el volumen
// ahí; tocar VOL lo apaga o lo vuelve a prender.
const VOL_STEPS = 8;
const volRow = el('div', 'suena-vol');
volRow.hidden = true;
volRow.setAttribute('role', 'group');
volRow.setAttribute('aria-label', 'Volumen');
const volMute = el('button', 'vol-mudo', 'VOL');
volMute.type = 'button';
const volBars = Array.from({ length: VOL_STEPS }, (_, i) => {
  const b = el('button', 'vol-paso');
  b.type = 'button';
  b.setAttribute('aria-label', `Volumen ${Math.round(((i + 1) / VOL_STEPS) * 100)}%`);
  return b;
});
volRow.append(volMute, el('div', 'vol-tira', volBars));
let volume = 1, lastVolume = 1;
let onVolumeSet: ((v: number) => void) | null = null;
function paintVolume() {
  const lit = Math.round(volume * VOL_STEPS);
  volBars.forEach((b, i) => {
    b.classList.toggle('on', i < lit);
    b.setAttribute('aria-pressed', String(i + 1 === lit));
  });
  volMute.classList.toggle('mudo', lit === 0);
  volMute.setAttribute('aria-label', lit === 0 ? 'Prender el sonido' : 'Apagar el sonido');
}
function chooseVolume(v: number) {
  if (v > 0) lastVolume = v;
  volume = v;
  paintVolume();
  sfx.move();
  onVolumeSet?.(v);
}
volBars.forEach((b, i) => b.addEventListener('click', () => chooseVolume((i + 1) / VOL_STEPS)));
volMute.addEventListener('click', () => chooseVolume(volume > 0 ? 0 : lastVolume));

suena.append(el('div', 'suena-cab', [el('span', 'eq', [el('i'), el('i'), el('i')]), el('span', 'estado'), titulo]), volRow, el('div', 'controles', [prev, toggle, next, verYt, todos]));

/** Si el nombre del set no entra en el cartel, va y vuelve. */
function marquee() {
  titulo.classList.remove('corre');
  const extra = tituloTexto.offsetWidth - titulo.clientWidth;
  if (extra <= 2) return;
  // A los saltos de 4 píxeles, a unos 30 píxeles por segundo.
  titulo.style.setProperty('--dist', `${-extra}px`);
  titulo.style.setProperty('--pasos', String(Math.max(2, Math.round(extra / 4))));
  titulo.style.setProperty('--dur', `${Math.max(3, extra / 30 + 2).toFixed(1)}s`);
  titulo.classList.add('corre');
}
window.addEventListener('resize', marquee);
hud.append(el('div', 'hud-izq', [hudContador, suena]), redesLinks());

export const player = {
  /** Muestra qué set suena. */
  set(text: string, url: string) {
    suena.hidden = false;
    tituloTexto.textContent = text;
    suena.title = text;
    verYt.href = url;
    requestAnimationFrame(marquee);
  },
  setPlaying(playing: boolean) {
    toggle.textContent = playing ? '||' : '>';
    toggle.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
    suena.classList.toggle('pausa', !playing);
  },
  /** Muestra el control de volumen (donde se puede manejar) y avisa cuando el visitante lo mueve. */
  onVolume(fn: (v: number) => void) {
    onVolumeSet = fn;
    volRow.hidden = false;
  },
  /** El volumen cambió por otro lado (el control de YouTube): se refleja en la tira. */
  setVolume(v: number) {
    volume = v;
    if (v > 0) lastVolume = v;
    paintVolume();
  },
  onPrev: (fn: () => void) => prev.addEventListener('click', fn),
  onNext: (fn: () => void) => next.addEventListener('click', fn),
  onToggle: (fn: () => void) => toggle.addEventListener('click', fn),
};
const navbar = el('nav', 'navbar');
navbar.setAttribute('aria-label', 'Secciones');
/** Cartelitos de arriba de la barra (van después de ella: se esconden cuando ella se esconde). */
const avisos = el('div', 'avisos');
ui.append(hud, navbar, avisos);

/** Botones de lo que puede hacer el raro del visitante en la pista (también van con las teclas 1, 2, 3...). */
const acciones = el('div', 'acciones');
acciones.setAttribute('role', 'group');
acciones.setAttribute('aria-label', 'Acciones de tu raro');
acciones.hidden = true;
ui.append(acciones);
let runAction: ((kind: number) => void) | null = null;

export interface ActionButton {
  kind: number;
  label: string;
  icon: string[];
}

/** Pone (o saca, con null) los botones de acciones. La tecla de cada una es su lugar en la lista: 1, 2, 3... */
export function setActions(list: ActionButton[] | null, run?: (kind: number) => void) {
  runAction = list && run ? run : null;
  acciones.hidden = !runAction;
  acciones.replaceChildren(
    ...(list ?? []).map((a, i) => {
      const b = el('button', 'btn chico', [pixIcon(a.icon), el('span', 'tecla', String(i + 1)), el('span', 'nombre', a.label)]);
      b.type = 'button';
      b.dataset.kind = String(a.kind);
      b.setAttribute('aria-label', `${a.label} (tecla ${i + 1})`);
      b.addEventListener('click', () => {
        sfx.select();
        runAction?.(a.kind);
        // Que el foco no se quede en el botón: si no, el espacio o el Enter lo repiten sin querer.
        b.blur();
      });
      return b;
    }),
  );
}

/** Saca un cartelito titilando. */
function dismiss(box: HTMLElement) {
  box.classList.add('chau');
  box.addEventListener('animationend', () => box.remove());
}

export interface Route {
  /** '' es la pista (sin ventana). */
  path: string;
  label: string;
  /** false = la ruta existe pero no tiene botón en la barra (se entra desde otra ventana). */
  nav?: boolean;
  /** Dibujito del botón de la barra (ver `pixIcon`). */
  icon?: string[];
  /** Abre la sección. No se llama para la pista. Puede devolver cómo cerrarla al irse. */
  open?: () => void | (() => void) | Promise<void>;
}

const routes: Route[] = [];
const buttons = new Map<string, { a: HTMLAnchorElement; label: HTMLElement }>();

/** Cambia el texto de un botón de la barra (y si tiene que titilar para llamar la atención). */
export function setRouteLabel(path: string, label: string, call = false) {
  const b = buttons.get(path);
  if (!b) return;
  b.label.textContent = label;
  b.a.classList.toggle('llamar', call);
}
let panel: { root: HTMLElement; onClose?: () => void; navWasHidden: boolean } | null = null;
let leave: (() => void) | null = null;

/** Mostrar u ocultar la barra y el cartel (la pelea usa toda la pantalla). */
export function setChrome(visible: boolean) {
  navbar.hidden = hud.hidden = !visible;
  acciones.classList.toggle('fuera', !visible);
  // Al volver a la pista (de un juego, por ejemplo) el cartel puede haber cambiado de ancho.
  if (visible) requestAnimationFrame(marquee);
}

/**
 * Cartelito arriba de la barra con cómo moverse por la pista. Se va solo a los `seconds`, o un
 * rato después de que el visitante empiece a moverse (ya entendió).
 */
export function showHint(keys: [string, string][], seconds = 12) {
  const box = el('div', 'ayuda', keys.map(([k, v]) => el('span', '', [el('b', '', k), ` ${v}`])));
  avisos.append(box);
  let left = false;
  const leave = (ms: number) => {
    if (left) return;
    left = true;
    window.removeEventListener('pointerdown', onMove);
    window.removeEventListener('keydown', onMove);
    setTimeout(() => dismiss(box), ms);
  };
  // Solo cuenta lo que se hace sobre la pista (no los clics en la barra o en una ventana).
  const onMove = (e: Event) => (e.type === 'keydown' || e.target === document.body || e.target === document.documentElement) && !panel && leave(2500);
  window.addEventListener('pointerdown', onMove);
  window.addEventListener('keydown', onMove);
  setTimeout(() => leave(0), seconds * 1000);
}

/** Aviso con un botón que lleva a una sección (por ejemplo: recién armaste tu raro, compartilo). Se va solo. */
export function showCall(text: string, label: string, path: string, seconds = 25) {
  const a = el('a', 'btn chico rojo', label);
  a.href = `#/${path}`;
  const box = el('div', 'llamado', [el('span', '', text), a]);
  avisos.prepend(box);
  a.addEventListener('click', () => {
    sfx.select();
    box.remove();
  });
  setTimeout(() => box.isConnected && dismiss(box), seconds * 1000);
}

/** La ayuda que corresponde a cómo se maneja en este aparato. */
export const pistaHint = (): [string, string][] =>
  isTouch()
    ? [['ARRASTRA', 'MIRAR'], ['TOCA', 'IR'], ['PELLIZCA', 'ZOOM']]
    : [['ARRASTRA', 'MIRAR'], ['CLIC', 'IR'], ['WASD', 'CAMINAR'], ['RUEDA', 'ZOOM']];

export function mountUi(list: Route[]) {
  routes.push(...list);
  for (const r of list) {
    if (r.nav === false) continue;
    const label = el('span', '', r.label);
    const a = el('a', 'btn', r.icon ? [pixIcon(r.icon), label] : [label]);
    a.href = `#/${r.path}`;
    a.addEventListener('click', () => sfx.select());
    a.addEventListener('focus', () => sfx.move());
    navbar.append(a);
    buttons.set(r.path, { a, label });
  }
  document.body.append(ui);
  window.addEventListener('hashchange', render);
  window.addEventListener('keydown', onKey);
  render();
}

export const currentPath = () => location.hash.replace(/^#\/?/, '');
export function go(path: string) {
  if (currentPath() === path) render();
  else location.hash = `#/${path}`;
}

function render() {
  const path = currentPath();
  closePanel();
  leave?.();
  leave = null;
  for (const [p, b] of buttons) {
    b.a.classList.toggle('on', p === path);
    if (p === path) b.a.setAttribute('aria-current', 'page');
    else b.a.removeAttribute('aria-current');
  }
  const route = routes.find((r) => r.path === path);
  const out = route?.open?.();
  if (typeof out === 'function') leave = out;
}

function closePanel() {
  if (!panel) return;
  panel.root.remove();
  ui.classList.remove('con-ventana');
  panel.onClose?.();
  // La barra vuelve a como estaba antes de abrir la ventana (en la puerta todavía no se muestra).
  navbar.hidden = panel.navWasHidden;
  panel = null;
}
/** Cierra la ventana abierta sin cambiar de sección (para las que no son una ruta, como la de la puerta). */
export const closeWindow = closePanel;

export interface PanelOptions {
  title: string;
  narrow?: boolean;
  /** Acoplada a un costado, sin oscurecer la pista. */
  dock?: boolean;
  /** Ayuda de teclas de abajo: pares [tecla, qué hace]. */
  hints?: [string, string][];
  /** Sin X ni "click afuera": hay que terminar lo que pide (armar el raro en la puerta). */
  fixed?: boolean;
  onClose?: () => void;
}

/** Abre una ventana (cierra la que hubiera) y devuelve dónde poner el contenido. */
export function openPanel(o: PanelOptions) {
  closePanel();
  const wrap = el('div', `panel-wrap${o.dock ? ' dock' : ''}`);
  const root = el('section', `panel${o.narrow ? ' angosto' : ''}`);
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', o.title);
  const close = el('button', 'btn chico rojo', 'X');
  close.setAttribute('aria-label', 'Cerrar');
  close.addEventListener('click', () => {
    sfx.back();
    go('');
  });
  const body = el('div', 'panel-body');
  const foot = el('div', 'panel-foot');
  for (const [k, v] of o.hints ?? [['↑↓', 'MOVER'], ['ENTER', 'ELEGIR'], ['ESC', 'VOLVER']]) foot.append(el('span', '', [el('b', '', k), ` ${v}`]));
  root.append(el('header', 'panel-title', o.fixed ? [el('span', '', o.title)] : [el('span', '', o.title), close]), body, foot);
  wrap.append(root);
  // Click afuera de la ventana = volver.
  wrap.addEventListener('pointerdown', (e) => {
    if (e.target === wrap && !o.fixed) go('');
  });
  // En la puerta la interfaz todavía no está en la página (se monta recién adentro).
  if (!ui.isConnected) document.body.append(ui);
  ui.append(wrap);
  ui.classList.add('con-ventana');
  const navWasHidden = Boolean(navbar.hidden);
  navbar.hidden = true;
  panel = { root: wrap, onClose: o.onClose, navWasHidden };
  return {
    body,
    /** Pone el foco en lo primero que se puede elegir. */
    focusFirst: () => focusables()[0]?.focus(),
  };
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([type=hidden]), select, textarea, [tabindex="0"]';
function focusables() {
  const scope = panel ? panel.root.querySelector('.panel-body')! : navbar;
  return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => e.offsetParent && !e.closest('.trampa'));
}

function onKey(e: KeyboardEvent) {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target as HTMLElement;
  if (e.key === 'Escape') {
    if (panel) {
      e.preventDefault();
      sfx.back();
      go('');
    }
    return;
  }
  const typing = t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown');
  if (typing) return;
  // En la pista, los números son las acciones del raro.
  if (!panel && runAction && !navbar.hidden && /^[1-9]$/.test(e.key)) {
    const b = acciones.children[Number(e.key) - 1] as HTMLElement | undefined;
    if (b && !e.repeat) {
      sfx.select();
      runAction(Number(b.dataset.kind));
    }
    return;
  }
  // En la barra se va de costado; en las ventanas, para arriba y abajo.
  const fwd = panel ? e.key === 'ArrowDown' : e.key === 'ArrowRight' || e.key === 'ArrowDown';
  const back = panel ? e.key === 'ArrowUp' : e.key === 'ArrowLeft' || e.key === 'ArrowUp';
  if (!fwd && !back) return;
  const list = focusables();
  if (!list.length) return;
  e.preventDefault();
  const i = list.indexOf(document.activeElement as HTMLElement);
  const next = i < 0 ? (fwd ? 0 : list.length - 1) : (i + (fwd ? 1 : -1) + list.length) % list.length;
  list[next].focus();
  list[next].scrollIntoView({ block: 'nearest' });
  sfx.move();
}
