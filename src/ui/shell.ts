import { redesLinks } from '../redes';
import { sfx } from '../style-kit';
import { el } from './dom';
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
const todos = el('a', 'btn chico', 'MAS SETS');
todos.href = '#/sets';
todos.setAttribute('aria-label', 'Todos los sets');
suena.append(titulo, el('div', 'controles', [prev, toggle, next, verYt, todos]));
hud.append(el('div', 'hud-izq', [hudContador, suena]), redesLinks());

export const player = {
  /** Muestra qué set suena. */
  set(text: string, url: string) {
    suena.hidden = false;
    titulo.textContent = text;
    verYt.href = url;
  },
  setPlaying(playing: boolean) {
    toggle.textContent = playing ? '||' : '>';
    toggle.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
    suena.classList.toggle('pausa', !playing);
  },
  onPrev: (fn: () => void) => prev.addEventListener('click', fn),
  onNext: (fn: () => void) => next.addEventListener('click', fn),
  onToggle: (fn: () => void) => toggle.addEventListener('click', fn),
};
const navbar = el('nav', 'navbar');
navbar.setAttribute('aria-label', 'Secciones');
ui.append(hud, navbar);

export interface Route {
  /** '' es la pista (sin ventana). */
  path: string;
  label: string;
  /** false = la ruta existe pero no tiene botón en la barra (se entra desde otra ventana). */
  nav?: boolean;
  /** Abre la sección. No se llama para la pista. Puede devolver cómo cerrarla al irse. */
  open?: () => void | (() => void) | Promise<void>;
}

const routes: Route[] = [];
const buttons = new Map<string, HTMLAnchorElement>();

/** Cambia el texto de un botón de la barra (y si tiene que titilar para llamar la atención). */
export function setRouteLabel(path: string, label: string, call = false) {
  const b = buttons.get(path);
  if (!b) return;
  b.textContent = label;
  b.classList.toggle('llamar', call);
}
let panel: { root: HTMLElement; onClose?: () => void } | null = null;
let leave: (() => void) | null = null;

/** Mostrar u ocultar la barra y el cartel (la pelea usa toda la pantalla). */
export function setChrome(visible: boolean) {
  navbar.hidden = hud.hidden = !visible;
}

export function mountUi(list: Route[]) {
  routes.push(...list);
  for (const r of list) {
    if (r.nav === false) continue;
    const a = el('a', 'btn', r.label);
    a.href = `#/${r.path}`;
    a.addEventListener('click', () => sfx.select());
    a.addEventListener('focus', () => sfx.move());
    navbar.append(a);
    buttons.set(r.path, a);
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
  for (const [p, b] of buttons) b.classList.toggle('on', p === path);
  const route = routes.find((r) => r.path === path);
  const out = route?.open?.();
  if (typeof out === 'function') leave = out;
}

function closePanel() {
  if (!panel) return;
  panel.root.remove();
  ui.classList.remove('con-ventana');
  panel.onClose?.();
  panel = null;
  navbar.hidden = false;
}

export interface PanelOptions {
  title: string;
  narrow?: boolean;
  /** Acoplada a un costado, sin oscurecer la pista. */
  dock?: boolean;
  /** Ayuda de teclas de abajo: pares [tecla, qué hace]. */
  hints?: [string, string][];
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
  root.append(el('header', 'panel-title', [el('span', '', o.title), close]), body, foot);
  wrap.append(root);
  // Click afuera de la ventana = volver.
  wrap.addEventListener('pointerdown', (e) => {
    if (e.target === wrap) go('');
  });
  ui.append(wrap);
  ui.classList.add('con-ventana');
  navbar.hidden = true;
  panel = { root: wrap, onClose: o.onClose };
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
