import { LOOK, type Look } from '../shared/look';
import './style-kit/kit.css';
import './style-kit/font';
import './ui/ui.css';
import './admin.css';
import { el } from './ui/dom';

/**
 * Panel de moderación: lista los personajes y los mensajes de contacto, y deja borrarlos.
 * La clave se manda en cada pedido y la valida el servidor (ADMIN_PASSWORD); acá no se guarda
 * más que en la pestaña abierta.
 */

interface AdminData {
  total: number;
  supabase: boolean;
  raros: { id: string; name: string; look: Look; created_at: string }[];
  mensajes: { id: string; name: string; email: string; kind: string; message: string; created_at: string }[];
}

const root = document.querySelector<HTMLElement>('#admin')!;
root.className = 'ui admin-ui';
let pass = sessionStorage.getItem('dr-admin') ?? '';

async function call<T>(path: string, method = 'GET'): Promise<T> {
  const res = await fetch(path, { method, headers: { authorization: `Bearer ${pass}` } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.error ?? `Error ${res.status}`), { status: res.status });
  return data as T;
}

const fecha = (iso: string) => new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

function login(error = '') {
  const input = el('input');
  input.type = 'password';
  input.autocomplete = 'current-password';
  const form = el('form', 'form', [
    el('label', 'campo', [el('span', '', 'CLAVE'), input]),
    el('div', 'fila', [el('button', 'btn', 'ENTRAR'), el('span', 'error', error)]),
  ]);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    pass = input.value;
    sessionStorage.setItem('dr-admin', pass);
    void load();
  });
  root.replaceChildren(el('section', 'panel angosto', [el('header', 'panel-title', 'ADMIN'), el('div', 'panel-body', [form])]));
  input.focus();
}

async function load() {
  let data: AdminData;
  try {
    data = await call<AdminData>('/api/admin');
  } catch (e) {
    sessionStorage.removeItem('dr-admin');
    return login((e as Error).message);
  }

  const borrar = (path: string, row: HTMLElement) => {
    const b = el('button', 'btn chico rojo', 'BORRAR');
    b.addEventListener('click', async () => {
      // Dos clicks para borrar: el primero arma, el segundo confirma.
      if (b.textContent === 'BORRAR') return void (b.textContent = '¿SEGURO?');
      b.disabled = true;
      try {
        await call(path, 'DELETE');
        row.remove();
      } catch (e) {
        b.textContent = (e as Error).message;
      }
    });
    return b;
  };

  const raros = el('div', 'admin-lista');
  for (const r of data.raros) {
    const row = el('div', 'admin-fila');
    const look = `${LOOK.cuerpo[r.look.cuerpo]} · ${LOOK.pelo[r.look.pelo]} · ${LOOK.accesorio[r.look.accesorio]}`;
    row.append(el('b', '', r.name), el('span', 'aviso', look), el('span', 'aviso', fecha(r.created_at)), borrar(`/api/admin?id=${r.id}`, row));
    raros.append(row);
  }

  const mensajes = el('div', 'admin-lista');
  for (const m of data.mensajes) {
    const row = el('div', 'admin-msg');
    const mail = el('a', '', m.email);
    mail.href = `mailto:${m.email}`;
    // El mensaje va tal cual lo escribieron (el() le sacaría las tildes).
    const texto = el('p');
    texto.textContent = m.message;
    row.append(
      el('div', 'fila', [el('b', '', m.name), mail, el('span', 'genero', m.kind), el('span', 'aviso', fecha(m.created_at)), borrar(`/api/admin?tipo=mensaje&id=${m.id}`, row)]),
      texto,
    );
    mensajes.append(row);
  }

  root.replaceChildren(
    el('section', 'panel', [
      el('header', 'panel-title', `PERSONAJES (${data.total})`),
      el('div', 'panel-body', [
        el('p', data.supabase ? 'ok' : 'error', data.supabase ? 'GUARDANDO EN SUPABASE' : 'MODO LOCAL: SE GUARDA EN .data/db.json (FALTA CONFIGURAR SUPABASE)'),
        data.raros.length ? raros : el('p', 'aviso', 'TODAVÍA NO HAY NADIE EN LA PISTA.'),
      ]),
    ]),
    el('section', 'panel', [
      el('header', 'panel-title', `MENSAJES (${data.mensajes.length})`),
      el('div', 'panel-body', [data.mensajes.length ? mensajes : el('p', 'aviso', 'SIN MENSAJES.')]),
    ]),
  );
}

if (pass) void load();
else login();
