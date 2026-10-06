import { sfx } from '../style-kit';
import { el, isTouch } from '../ui/dom';
import { openPanel } from '../ui/shell';

const JUEGOS = [
  { path: 'pelea', name: 'DISCOS VS RAROS', what: 'PELEA 1 CONTRA LA CPU, AL MEJOR DE 3 ROUNDS. GOLPES, AGARRES, VINILOS, HUMO Y VOMITO.' },
  { path: 'futbol', name: 'CABEZAZOS', what: 'FUTBOL DE CABEZONES. 60 SEGUNDOS, TIRO VINILO Y GOL DE ORO.' },
];

/** Menú de juegos. En el celular se avisa que son para la compu (teclado o joystick). */
export function openJugar() {
  const p = openPanel({ title: 'JUGAR', narrow: true });
  if (isTouch()) {
    p.body.append(
      el('p', 'aviso', 'LOS JUEGOS SE JUEGAN EN LA COMPU, CON TECLADO O JOYSTICK.'),
      el('p', '', 'ENTRA DESDE UNA PC A DISCOSRAROS.COM.AR Y ELEGI:'),
      ...JUEGOS.map((j) => el('p', 'ok', `- ${j.name}`)),
    );
    return;
  }
  const list = el('div', 'juegos');
  for (const j of JUEGOS) {
    const a = el('a', 'btn juego', [el('span', 'nombre', j.name), el('span', 'meta', j.what)]);
    a.href = `#/${j.path}`;
    a.addEventListener('focus', () => sfx.move());
    a.addEventListener('click', () => sfx.start());
    list.append(a);
  }
  p.body.append(list, el('p', 'aviso', 'TECLADO O JOYSTICK. ESC PARA SALIR DE UN JUEGO.'));
  p.focusFirst();
}
