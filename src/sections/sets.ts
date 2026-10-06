import type { SetInfo } from '../../shared/look';
import { fetchSets } from '../api';
import { sfx } from '../style-kit';
import { el, sinTildes } from '../ui/dom';
import { go, openPanel } from '../ui/shell';

/** Miniatura pixelada: la de YouTube achicada a 64×36 y agrandada sin suavizar. */
function thumb(set: SetInfo) {
  const c = el('canvas');
  c.width = 64;
  c.height = 36;
  const img = new Image();
  img.onload = () => c.getContext('2d')!.drawImage(img, 0, 0, 64, 36);
  img.src = set.thumb;
  return c;
}

const fecha = (iso: string) => {
  const d = new Date(iso);
  return isNaN(+d) ? '' : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

export interface SetsOptions {
  /** Qué set está sonando en la tele (para marcarlo). */
  playing: () => string | null;
  /** Poner un set en la tele de la pista. */
  play: (set: SetInfo) => void;
}

export async function openSets(o: SetsOptions) {
  const p = openPanel({ title: 'SETS', hints: [['↑↓', 'MOVER'], ['ENTER', 'PONER EN LA TELE'], ['ESC', 'VOLVER']] });
  const status = el('p', 'aviso', 'NOW LOADING...');
  p.body.append(status);
  let sets: SetInfo[];
  try {
    sets = await fetchSets();
  } catch (e) {
    status.className = 'error';
    status.textContent = sinTildes(`NO SE PUDIERON CARGAR LOS SETS. ${(e as Error).message}`.toUpperCase());
    p.body.append(canal());
    return;
  }
  if (!p.body.isConnected) return;
  status.textContent = 'UN SET NUEVO POR SEMANA, CADA UNO DE UN PALO DISTINTO. ELEGI UNO Y SUENA EN LA PISTA.';
  const list = el('div', 'sets');
  const playing = o.playing();
  for (const s of sets) {
    const row = el('button', `btn set${s.id === playing ? ' sonando' : ''}`, [
      thumb(s),
      el('span', 'num', `#${s.number}`),
      el('span', 'nombre', s.name),
      el('span', 'meta', [...(s.genre ? [el('span', 'genero', s.genre)] : []), fecha(s.published)]),
    ]);
    row.addEventListener('focus', () => sfx.move());
    row.addEventListener('click', () => {
      sfx.select();
      o.play(s);
      go('');
    });
    const yt = el('a', 'btn chico yt', 'VER EN YT');
    yt.href = s.url;
    yt.target = '_blank';
    yt.rel = 'noopener';
    yt.setAttribute('aria-label', `Ver el set ${s.number} en YouTube`);
    list.append(el('div', 'set-fila', [row, yt]));
  }
  p.body.append(list, canal());
  p.focusFirst();
}

function canal() {
  const a = el('a', 'btn', 'TODOS LOS SETS EN YOUTUBE');
  a.href = 'https://www.youtube.com/@discosraros';
  a.target = '_blank';
  a.rel = 'noopener';
  return el('p', '', [a]);
}
