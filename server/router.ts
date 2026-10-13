import { createHash, timingSafeEqual } from 'node:crypto';
import { cleanName, cleanPhrase, validLook } from '../shared/look.js';
import { getSets } from './sets.js';
import { getStore, usingSupabase } from './store.js';

/**
 * Toda la API del sitio. La usan las funciones de Vercel (carpeta /api) y el servidor de
 * desarrollo de Vite (vite.config.ts), así en local y en producción corre el mismo código.
 */

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
const fail = (status: number, error: string) => json({ error }, status);

export function clientIp(req: Request) {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
}

const hashIp = (ip: string) =>
  createHash('sha256').update(`${process.env.IP_SALT ?? 'discos-raros'}:${ip}`).digest('hex').slice(0, 32);

async function body(req: Request): Promise<Record<string, unknown> | null> {
  const text = await req.text();
  if (text.length > 6000) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

/** Cloudflare Turnstile: solo se exige si está configurada la clave secreta. */
async function humanOk(token: unknown, ip: string) {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return true;
  if (typeof token !== 'string' || !token) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  });
  return Boolean(((await res.json()) as { success?: boolean }).success);
}

function isAdmin(req: Request) {
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) return false;
  const got = Buffer.from((req.headers.get('authorization') ?? '').replace(/^Bearer /, ''));
  const want = Buffer.from(pass);
  return got.length === want.length && timingSafeEqual(got, want);
}

const DAY = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Cuántos personajes se mandan a la pista: los más nuevos + una muestra al azar. */
const RECENT = 60;
const RANDOM = 200;

export async function handleApi(req: Request, ip = clientIp(req)): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '');
  const store = getStore();
  try {
    // --- Sets ----------------------------------------------------------------------
    if (path === '/api/sets' && req.method === 'GET') {
      return json({ sets: await getSets() }, 200, { 'cache-control': 'public, s-maxage=900, stale-while-revalidate=86400' });
    }

    // --- Personajes ----------------------------------------------------------------
    if (path === '/api/raros' && req.method === 'GET') {
      const device = url.searchParams.get('device') ?? '';
      const [total, raros, mine] = await Promise.all([
        store.count(),
        store.sample(RECENT, RANDOM),
        UUID.test(device) ? store.byDevice(device) : null,
      ]);
      const me = mine ? { id: mine.id, name: mine.name, look: mine.look, phrase: mine.phrase ?? '' } : null;
      return json({ total, raros, mine: me }, 200, { 'cache-control': 'no-store' });
    }

    if (path === '/api/raros' && req.method === 'POST') {
      const b = await body(req);
      if (!b) return fail(400, 'Pedido inválido.');
      const device = b.device;
      const look = validLook(b.look);
      const name = cleanName(b.name);
      if (typeof device !== 'string' || !UUID.test(device) || !look) return fail(400, 'Pedido inválido.');
      if (!name) return fail(422, 'Ese nombre no va. Probá con otro.');
      const phrase = cleanPhrase(b.phrase);
      if (phrase === null) return fail(422, 'Esa frase no va. Probá con otra.');
      if (!(await humanOk(b.token, ip))) return fail(403, 'No pasaste el control anti-robots. Probá de nuevo.');
      const ipHash = hashIp(ip);
      const existing = await store.byDevice(device);
      // Editar el propio no cuenta; crear nuevos, hasta 5 por día por IP.
      if (!existing && (await store.createdSince(ipHash, new Date(Date.now() - DAY).toISOString())) >= 5) {
        return fail(429, 'Demasiados personajes desde esta conexión. Volvé mañana.');
      }
      const raro = await store.upsert({ device_id: device, ip_hash: ipHash, name, look, phrase });
      return json({ raro, total: await store.count() });
    }

    // --- Contacto ------------------------------------------------------------------
    if (path === '/api/contact' && req.method === 'POST') {
      const b = await body(req);
      if (!b) return fail(400, 'Pedido inválido.');
      // Campo trampa: las personas no lo ven, los bots lo llenan.
      if (b.web) return json({ ok: true });
      const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
      const m = { name: str(b.name, 60), email: str(b.email, 120), kind: str(b.kind, 20), message: str(b.message, 2000) };
      if (!m.name || !m.message) return fail(422, 'Faltan el nombre o el mensaje.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email)) return fail(422, 'Ese mail no parece un mail.');
      if (!(await humanOk(b.token, ip))) return fail(403, 'No pasaste el control anti-robots. Probá de nuevo.');
      const ipHash = hashIp(ip);
      if ((await store.messagesSince(ipHash, new Date(Date.now() - DAY).toISOString())) >= 5) {
        return fail(429, 'Ya mandaste varios mensajes hoy. Escribinos por Instagram.');
      }
      await store.addMessage({ ...m, ip_hash: ipHash });
      return json({ ok: true });
    }

    // --- Admin ---------------------------------------------------------------------
    if (path === '/api/admin') {
      if (!process.env.ADMIN_PASSWORD) return fail(503, 'Falta configurar ADMIN_PASSWORD.');
      if (!isAdmin(req)) return fail(401, 'Clave incorrecta.');
      if (req.method === 'GET') {
        const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
        const [total, raros, mensajes] = await Promise.all([store.count(), store.list(100, offset), store.listMessages(100)]);
        return json({ total, raros, mensajes, supabase: usingSupabase() }, 200, { 'cache-control': 'no-store' });
      }
      if (req.method === 'DELETE') {
        const id = url.searchParams.get('id') ?? '';
        if (!UUID.test(id)) return fail(400, 'Pedido inválido.');
        if (url.searchParams.get('tipo') === 'mensaje') await store.removeMessage(id);
        else await store.remove(id);
        return json({ ok: true });
      }
    }

    return fail(404, 'No existe.');
  } catch (e) {
    console.error('[api]', path, e);
    return fail(500, 'Se rompió algo del lado del servidor.');
  }
}
