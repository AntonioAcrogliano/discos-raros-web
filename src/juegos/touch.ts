import './touch.css';
import { el } from '../ui/dom';

/**
 * Controles táctiles de los juegos: un stick a la izquierda, botones a la derecha y uno de
 * pausa/salir. No hablan con los juegos: "aprietan teclas" (eventos de teclado de mentira),
 * así el celular usa exactamente los mismos controles que el teclado, pausa incluida.
 * Se juega con el celu acostado: parado aparece un cartel pidiendo girarlo.
 */

export interface TouchAction {
  /** Tecla que aprieta (KeyboardEvent.code). */
  code: string;
  label: string;
  /** El botón principal va más grande. */
  big?: boolean;
}

export interface TouchPad {
  /** 'play': stick y botones a la vista. 'menu': solo el botón de salir (selección, resultado). */
  setMode(mode: 'menu' | 'play'): void;
  dispose(): void;
}

const key = (type: 'keydown' | 'keyup', code: string) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));

/**
 * ¿El juego está acostado por CSS? Pasa con el celu parado y el giro trabado (casi todos los
 * iPhone): la página no gira nunca, así que se gira el dibujo y se juega girando el celu a mano.
 */
const turned = () => document.documentElement.classList.contains('acostado');

/** Dónde cayó un toque sobre la capa de textos, en píxeles de la capa (esté acostada o no). */
export function layerPoint(layer: HTMLCanvasElement, e: PointerEvent) {
  if (turned()) return { x: (e.clientY / window.innerHeight) * layer.width, y: (1 - e.clientX / window.innerWidth) * layer.height };
  const r = layer.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * layer.width, y: ((e.clientY - r.top) / r.height) * layer.height };
}

/** ¿El toque fue sobre un control táctil? (para no tomarlo también como "toque en la pantalla"). */
export const onTouchUi = (e: Event) => Boolean((e.target as Element | null)?.closest?.('.touch-ui'));

export function mountTouchPad(actions: TouchAction[], onPortrait: (portrait: boolean) => void): TouchPad {
  // --- Stick: según para dónde se lo lleve, mantiene apretadas las flechas ----------------
  const knob = el('div', 'touch-knob');
  const stick = el('div', 'touch-stick', [knob]);
  const held = new Set<string>();
  const hold = (next: Set<string>) => {
    for (const c of held) if (!next.has(c)) key('keyup', c);
    for (const c of next) if (!held.has(c)) key('keydown', c);
    held.clear();
    for (const c of next) held.add(c);
  };
  let finger: number | null = null;
  const aim = (e: PointerEvent) => {
    const r = stick.getBoundingClientRect();
    const sx = (e.clientX - r.left - r.width / 2) / (r.width / 2), sy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    // Acostado por CSS, "derecha" en el juego es "abajo" en la pantalla.
    const [x, y] = turned() ? [sy, -sx] : [sx, sy];
    const k = Math.min(1, 1 / Math.max(1e-6, Math.hypot(x, y)));
    knob.style.transform = `translate(${x * k * 32}%, ${y * k * 32}%)`;
    const next = new Set<string>();
    if (x < -0.3) next.add('ArrowLeft');
    if (x > 0.3) next.add('ArrowRight');
    if (y < -0.45) next.add('ArrowUp');
    if (y > 0.45) next.add('ArrowDown');
    hold(next);
  };
  const letGo = (e?: PointerEvent) => {
    if (e && e.pointerId !== finger) return;
    finger = null;
    knob.style.transform = '';
    hold(new Set());
  };
  stick.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    finger = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    aim(e);
  });
  stick.addEventListener('pointermove', (e) => e.pointerId === finger && aim(e));
  stick.addEventListener('pointerup', letGo);
  stick.addEventListener('pointercancel', letGo);

  // --- Botones --------------------------------------------------------------------------
  const buttons = el('div', 'touch-buttons');
  const pressed = new Set<string>();
  for (const a of actions) {
    const b = el('div', `touch-btn${a.big ? ' big' : ''}`, a.label);
    const up = () => {
      if (!pressed.delete(a.code)) return;
      b.classList.remove('on');
      key('keyup', a.code);
    };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      pressed.add(a.code);
      b.classList.add('on');
      key('keydown', a.code);
    });
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    buttons.append(b);
  }

  // Pausa en la partida; fuera de la partida el Esc sale del juego.
  const menu = el('div', 'touch-menu', 'SALIR');
  menu.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    key('keydown', 'Escape');
    key('keyup', 'Escape');
  });

  const root = el('div', 'touch-ui', [stick, buttons, menu]);
  root.dataset.mode = 'menu';
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  document.body.append(root);

  // Con el celu parado el juego se dibuja acostado igual (ver `turned`).
  const portrait = window.matchMedia('(orientation: portrait)');
  const lay = (on: boolean) => {
    if (on === turned()) return;
    letGo();
    document.documentElement.classList.toggle('acostado', on);
    window.dispatchEvent(new Event('resize'));
  };
  const flipped = () => {
    lay(portrait.matches);
    onPortrait(portrait.matches);
  };
  portrait.addEventListener('change', flipped);
  lay(portrait.matches);

  // Donde se puede (Android): pantalla completa y trabada acostada. En iPhone no existe: se acuesta el dibujo.
  const orientation = screen.orientation as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
  void document.documentElement
    .requestFullscreen?.()
    .then(() => orientation?.lock?.('landscape'))
    .catch(() => {});

  return {
    setMode(mode) {
      root.dataset.mode = mode;
      menu.textContent = mode === 'play' ? 'II' : 'SALIR';
      if (mode === 'menu') {
        letGo();
        for (const c of [...pressed]) key('keyup', c);
        pressed.clear();
        for (const b of buttons.children) b.classList.remove('on');
      }
    },
    dispose() {
      letGo();
      for (const c of pressed) key('keyup', c);
      portrait.removeEventListener('change', flipped);
      lay(false);
      root.remove();
      orientation?.unlock?.();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    },
  };
}
