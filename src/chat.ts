import { type ChatMsg, fetchChat, sendChat } from './api';

/**
 * El chat de la pista. Los mensajes se guardan en el servidor (pasan por el mismo filtro que los
 * nombres y las frases) y al abrir el chat se ven los últimos. Lo "en vivo" es un canal de
 * Supabase Realtime que hace de timbre: cuando alguien escribe, toca el timbre y cada uno le pide
 * al servidor lo nuevo. Lo que viaja por el canal (que cualquiera con la clave pública podría
 * mandar) nunca se muestra tal cual. El mismo canal cuenta cuántos hay conectados.
 * Sin las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY no hay canal: con el chat
 * abierto se pregunta cada unos segundos.
 */

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
/** Cada cuánto se pregunta si no hay canal (solo con el chat abierto y la pestaña a la vista). */
const POLL_MS = 8000;
/** Cuántos mensajes se tienen a mano. */
const KEEP = 200;

const messages: ChatMsg[] = [];
const seen = new Set<string>();
const listeners = new Set<() => void>();
let onArrive: ((list: ChatMsg[]) => void) | null = null;
let ring: (() => void) | null = null;
let started = false, live = false, open = false, loaded = false;
let online = 0;

const notify = () => listeners.forEach((f) => f());

/** Suma los que no estaban; los nuevos (no la historia del principio) salen además en la pista. */
function add(list: ChatMsg[], bubble: boolean) {
  const fresh = list.filter((m) => !seen.has(m.id));
  if (!fresh.length) return;
  for (const m of fresh) {
    seen.add(m.id);
    messages.push(m);
  }
  messages.sort((a, b) => a.at.localeCompare(b.at));
  if (messages.length > KEEP) messages.splice(0, messages.length - KEEP);
  notify();
  if (bubble) onArrive?.(fresh);
}

let busy: Promise<void> | null = null;
let again = false;
/** Le pide al servidor lo que llegó después del último que se tiene (si ya hay un pedido en camino, repite al terminar). */
function refresh(): Promise<void> {
  if (busy) {
    again = true;
    return busy;
  }
  busy = (async () => {
    try {
      add(await fetchChat(messages[messages.length - 1]?.at), loaded);
    } catch {
      /* sin conexión: ya se va a volver a intentar */
    }
    loaded = true;
    busy = null;
    notify();
    if (again) {
      again = false;
      void refresh();
    }
  })();
  return busy;
}

async function connect() {
  if (!URL || !KEY) return;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const ch = sb.channel('pista', { config: { broadcast: { self: false }, presence: { key: crypto.randomUUID() } } });
    // Si escriben varios a la vez, un solo pedido; y no todos los conectados en el mismo instante.
    let timer = 0;
    ch.on('broadcast', { event: 'nuevo' }, () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => void refresh(), 200 + Math.random() * 800);
    });
    ch.on('presence', { event: 'sync' }, () => {
      online = Object.keys(ch.presenceState()).length;
      notify();
    });
    ch.subscribe((status) => {
      live = status === 'SUBSCRIBED';
      // Recién conectado (o reconectado): se trae lo que se haya perdido mientras tanto.
      if (live) {
        void ch.track({});
        void refresh();
      }
      notify();
    });
    ring = () => void ch.send({ type: 'broadcast', event: 'nuevo', payload: {} });
  } catch {
    live = false;
  }
}

export const chat = {
  /** Arranca (una vez): trae los últimos mensajes y se conecta al canal en vivo. */
  start() {
    if (started) return;
    started = true;
    void refresh();
    void connect();
    window.setInterval(() => {
      if (!live && open && document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
  },
  get messages(): readonly ChatMsg[] {
    return messages;
  },
  /** Ya llegó la primera tanda (para no decir "no escribió nadie" mientras carga). */
  get loaded() {
    return loaded;
  },
  /** Cuántos hay conectados ahora (0 = no se sabe: sin canal en vivo). */
  get online() {
    return live ? online : 0;
  },
  /** La ventana del chat abierta o cerrada (sin canal en vivo, solo se pregunta con la ventana abierta). */
  setOpen(v: boolean) {
    open = v;
    if (v) void refresh();
  },
  async send(text: string) {
    const m = await sendChat(text);
    add([m], true);
    ring?.();
  },
  /** Avisa cada vez que cambia algo (mensajes, conectados). Devuelve cómo dejar de escuchar. */
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
  /** Para la pista: los mensajes nuevos, para el globito arriba de quien los escribió. */
  onArrive(fn: (list: ChatMsg[]) => void) {
    onArrive = fn;
  },
};
