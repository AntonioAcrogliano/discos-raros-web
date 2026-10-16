import type { Raro } from '../../shared/look';
import { CHAT_MAX } from '../../shared/look';
import { chat } from '../chat';
import { el, sinTildes } from '../ui/dom';
import { openPanel } from '../ui/shell';

/** Un emoji entero (con sus combinados, tonos de piel y banderas), para mostrarlo más grande que la letra. */
const EMOJI = /\p{Extended_Pictographic}(?:\uFE0F|\u20E3|[\u{1F3FB}-\u{1F3FF}]|\u200D\p{Extended_Pictographic}\uFE0F?)*|[\u{1F1E6}-\u{1F1FF}]{2}/gu;

/** El texto de un mensaje: la letra pixelada (sin tildes) y los emojis aparte, más grandes. */
function textNodes(text: string): (Node | string)[] {
  const out: (Node | string)[] = [];
  let at = 0;
  for (const m of text.matchAll(EMOJI)) {
    if (m.index! > at) out.push(sinTildes(text.slice(at, m.index)));
    const e = el('span', 'chat-e');
    e.textContent = m[0];
    out.push(e);
    at = m.index! + m[0].length;
  }
  if (at < text.length) out.push(sinTildes(text.slice(at)));
  return out;
}

/** Los emojis del botón (en el celu están en el teclado; esto es más que nada para la compu). */
const EMOJIS = ['🔥', '🪩', '🎧', '🎶', '💃', '🕺', '🤘', '🙌', '👏', '😂', '😍', '😎', '🥵', '🤯', '🥴', '👀', '💀', '👽', '🍄', '🍻', '❤\uFE0F', '💜', '✨', '⚡'];

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
        row.append(el('b', '', sinTildes(m.name)), ' ', ...textNodes(m.text));
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
  // Los emojis: un botón que abre una grilla; tocar uno lo pone donde está el cursor.
  const carita = el('button', 'btn chico chat-emoji', '🙂');
  carita.type = 'button';
  carita.setAttribute('aria-label', 'Emojis');
  carita.setAttribute('aria-expanded', 'false');
  const grilla = el('div', 'chat-emojis');
  grilla.hidden = true;
  for (const emoji of EMOJIS) {
    const b = el('button', 'chat-emojis-uno');
    b.type = 'button';
    b.textContent = emoji;
    b.setAttribute('aria-label', `Poner ${emoji}`);
    b.addEventListener('click', () => {
      const at = input.selectionStart ?? input.value.length, to = input.selectionEnd ?? at;
      const next = input.value.slice(0, at) + emoji + input.value.slice(to);
      if (next.length > CHAT_MAX) return;
      input.value = next;
      input.setSelectionRange(at + emoji.length, at + emoji.length);
      // En la compu vuelve al renglón para seguir escribiendo; en el celu no (abriría el teclado).
      if (!matchMedia('(pointer: coarse)').matches) input.focus();
    });
    grilla.append(b);
  }
  carita.addEventListener('click', () => {
    grilla.hidden = !grilla.hidden;
    carita.setAttribute('aria-expanded', String(!grilla.hidden));
  });
  const form = el('form', 'chat-form', [input, carita, enviar]);
  // Enter manda. (El formulario ya lo hace solo, pero con el teclado del celu, mientras el
  // corrector tiene la palabra "en edición", a veces no: por eso se lo agarra acá también.)
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.keyCode !== 13) return;
    e.preventDefault();
    form.requestSubmit();
  });
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
        grilla.hidden = true;
        carita.setAttribute('aria-expanded', 'false');
        lista.scrollTop = lista.scrollHeight;
      })
      .catch((err: Error) => (status.textContent = sinTildes(err.message.toUpperCase())))
      .finally(() => {
        enviar.disabled = false;
        input.focus();
      });
  });
  p.body.append(form, grilla, status);
  // En el celu no se abre el teclado solo (taparía la pista): recién cuando toca el renglón.
  if (!matchMedia('(pointer: coarse)').matches) input.focus();
}
