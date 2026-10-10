import { redesLinks } from '../redes';
import { el } from '../ui/dom';
import { openPanel } from '../ui/shell';

/**
 * Por ahora el contacto es por Instagram. El formulario que guardaba el mensaje (la API
 * /api/contact y la pestaña del admin siguen estando) vuelve cuando se pueda avisar por mail.
 */
export function openContacto() {
  const p = openPanel({ title: 'CONTACTO', hints: [['ENTER', 'ABRIR INSTAGRAM'], ['ESC', 'VOLVER']] });

  // ig.me abre directo el chat con la cuenta.
  const dm = el('a', 'btn', 'ESCRIBINOS POR INSTAGRAM');
  dm.href = 'https://ig.me/m/discosraros.arg';
  dm.target = '_blank';
  dm.rel = 'noopener';

  p.body.append(
    el('p', 'aviso', 'FECHAS, PRENSA, PROPUESTAS RARAS: ESCRIBINOS POR MENSAJE DIRECTO.'),
    el('p', '', [dm]),
    el('p', 'aviso', '@DISCOSRAROS.ARG'),
    el('p'),
    el('p', 'aviso', 'SEGUINOS:'),
    redesLinks('redes en-ventana'),
  );
  p.focusFirst();
}
