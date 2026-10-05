import { sendContact } from '../api';
import { sfx } from '../style-kit';
import { mountTurnstile } from '../turnstile';
import { el } from '../ui/dom';
import { openPanel } from '../ui/shell';

const REDES: [string, string][] = [
  ['YOUTUBE', 'https://www.youtube.com/@discosraros'],
  ['INSTAGRAM', 'https://www.instagram.com/discosraros.arg'],
  ['KICK', 'https://kick.com/discosraros'],
];

function campo(label: string, input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, name: string) {
  input.name = name;
  return el('label', 'campo', [el('span', '', label), input]);
}

export function openContacto() {
  const p = openPanel({ title: 'CONTACTO', hints: [['TAB', 'MOVER'], ['ESC', 'VOLVER']] });

  const name = el('input');
  name.required = true;
  name.maxLength = 60;
  name.autocomplete = 'name';
  const email = el('input');
  email.type = 'email';
  email.required = true;
  email.maxLength = 120;
  email.autocomplete = 'email';
  const kind = el('select');
  for (const k of ['BOOKING', 'PRENSA', 'COLABORACIÓN', 'OTRA COSA']) kind.append(new Option(k, k));
  const message = el('textarea');
  message.required = true;
  message.maxLength = 2000;
  // Campo trampa para bots: invisible para las personas.
  const web = el('input');
  web.tabIndex = -1;
  web.autocomplete = 'off';
  const trampa = el('label', 'trampa', ['No completar', web]);
  trampa.setAttribute('aria-hidden', 'true');

  const captcha = el('div');
  const turnstile = mountTurnstile(captcha);
  const send = el('button', 'btn', 'MANDAR');
  send.type = 'submit';
  const status = el('span', 'aviso');
  status.setAttribute('role', 'status');

  const form = el('form', 'form', [
    campo('TU NOMBRE', name, 'name'),
    campo('TU MAIL', email, 'email'),
    campo('PARA QUÉ', kind, 'kind'),
    campo('MENSAJE', message, 'message'),
    trampa,
    captcha,
    el('div', 'fila', [send, status]),
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    send.disabled = true;
    status.className = 'aviso';
    status.textContent = 'NOW SAVING...';
    try {
      await sendContact({ name: name.value, email: email.value, kind: kind.value, message: message.value, web: web.value, token: turnstile.token() });
      sfx.start();
      form.replaceWith(el('p', 'ok', 'MENSAJE GUARDADO EN LA MEMORY CARD. TE CONTESTAMOS PRONTO.'));
    } catch (err) {
      sfx.error();
      status.className = 'error';
      status.textContent = (err as Error).message;
      turnstile.reset();
      send.disabled = false;
    }
  });

  const redes = el('div', 'fila');
  for (const [label, href] of REDES) {
    const a = el('a', 'btn chico', `${label} ↗`);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    redes.append(a);
  }

  p.body.append(el('p', 'aviso', 'FECHAS, PRENSA, PROPUESTAS RARAS: ESCRIBINOS.'), form, el('p'), redes);
  p.focusFirst();
}
