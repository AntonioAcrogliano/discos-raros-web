import type { Raro } from '../../shared/look';
import { CHAT_MAX } from '../../shared/look';
import { chat } from '../chat';
import { el, sinTildes } from '../ui/dom';
import { openPanel } from '../ui/shell';

/**
 * La ventana del chat: acoplada a un costado (abajo en el celu), sin tapar la pista. Arriba los
 * últimos mensajes; abajo, para escribir (hace falta tener raro: el nombre es el suyo). Lo que
 * escribís sale también en un globito arriba de tu raro.
 */
export function openChat(o: { mine: () => Raro | null }) {
  let off = () => {};
  const p = openPanel({
    title: 'CHAT',
    dock: true,
    hints: [['ENTER', 'MANDAR'], ['ESC', 'VOLVER']],
    onClose: () => {
      chat.setOpen(false);
      off();
    },
  });
  chat.setOpen(true);

  const estado = el('p', 'chat-estado');
  const lista = el('div', 'chat-lista');
  lista.setAttribute('role', 'log');
  lista.setAttribute('aria-live', 'polite');
  const status = el('p', 'chat-error');
  status.setAttribute('role', 'status');

  /** El último mensaje dibujado (para no redibujar si no cambió nada). */
  let drawn = '';
  const paint = () => {
    const n = chat.online;
    estado.textContent = n ? `${n} ${n === 1 ? 'CONECTADO' : 'CONECTADOS'} AHORA` : 'EL CHAT DE LA PISTA';
    const msgs = chat.messages;
    if (!msgs.length) {
      lista.replaceChildren(el('p', 'aviso', chat.loaded ? 'TODAVIA NO ESCRIBIO NADIE. ARRANCA VOS.' : 'CARGANDO...'));
      drawn = '';
      return;
    }
    const last = msgs[msgs.length - 1].id;
    if (last === drawn) return;
    // Si estaba mirando lo último, sigue abajo; si subió a leer, no se lo mueve.
    const atBottom = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 24;
    const mine = o.mine()?.id;
    lista.replaceChildren(
      ...msgs.map((m) => {
        const row = el('p', `chat-msg${m.raro === mine ? ' propio' : ''}`);
        row.append(el('b', '', sinTildes(m.name)), ' ', sinTildes(m.text));
        return row;
      }),
    );
    const first = !drawn;
    drawn = last;
    if (atBottom || first) lista.scrollTop = lista.scrollHeight;
  };
  off = chat.subscribe(paint);
  paint();
  requestAnimationFrame(() => (lista.scrollTop = lista.scrollHeight));

  p.body.append(estado, lista);
  if (!o.mine()) {
    const crear = el('a', 'btn chico', 'ARMA TU RARO');
    crear.href = '#/crear';
    p.body.append(el('p', 'aviso', 'PARA ESCRIBIR NECESITAS TU RARO.'), el('p', '', [crear]));
    p.focusFirst();
    return;
  }
  const input = el('input');
  input.maxLength = CHAT_MAX;
  input.placeholder = 'ESCRIBI ALGO...';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.enterKeyHint = 'send';
  input.setAttribute('aria-label', `Mensaje (hasta ${CHAT_MAX} letras)`);
  const enviar = el('button', 'btn chico', 'MANDAR');
  enviar.type = 'submit';
  const form = el('form', 'chat-form', [input, enviar]);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || enviar.disabled) return;
    enviar.disabled = true;
    status.textContent = '';
    chat
      .send(text)
      .then(() => {
        input.value = '';
        lista.scrollTop = lista.scrollHeight;
      })
      .catch((err: Error) => (status.textContent = sinTildes(err.message.toUpperCase())))
      .finally(() => {
        enviar.disabled = false;
        input.focus();
      });
  });
  p.body.append(form, status);
  // En el celu no se abre el teclado solo (taparía la pista): recién cuando toca el renglón.
  if (!matchMedia('(pointer: coarse)').matches) input.focus();
}
