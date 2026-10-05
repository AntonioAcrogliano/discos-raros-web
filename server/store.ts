import type { Look, Raro } from '../shared/look.js';

/** Fila completa de un personaje (lo que no sale del servidor: dispositivo e IP hasheada). */
export interface RaroRow extends Raro {
  device_id: string;
  ip_hash: string;
  created_at: string;
}

export interface MessageRow {
  id: string;
  name: string;
  email: string;
  kind: string;
  message: string;
  ip_hash: string;
  created_at: string;
}

export interface Store {
  count(): Promise<number>;
  /** Los `recent` más nuevos + `random` al azar (sin repetir). */
  sample(recent: number, random: number): Promise<Raro[]>;
  byDevice(deviceId: string): Promise<RaroRow | null>;
  /** Crea el personaje del dispositivo, o lo pisa si ya tenía uno. */
  upsert(row: { device_id: string; ip_hash: string; name: string; look: Look }): Promise<Raro>;
  createdSince(ipHash: string, sinceIso: string): Promise<number>;
  list(limit: number, offset: number): Promise<RaroRow[]>;
  remove(id: string): Promise<void>;
  addMessage(m: Omit<MessageRow, 'id' | 'created_at'>): Promise<void>;
  messagesSince(ipHash: string, sinceIso: string): Promise<number>;
  listMessages(limit: number): Promise<MessageRow[]>;
  removeMessage(id: string): Promise<void>;
}

const pub = ({ id, name, look }: Raro): Raro => ({ id, name, look });

// --- Supabase (producción) --------------------------------------------------------
// Se habla directo con la API REST (PostgREST) usando la service key, que solo vive en el
// servidor. Las tablas tienen RLS prendido y sin políticas: desde el navegador no se llega.

class SupabaseStore implements Store {
  constructor(private url: string, private key: string) {}

  private async call(path: string, init: RequestInit & { prefer?: string } = {}) {
    const res = await fetch(`${this.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.key,
        authorization: `Bearer ${this.key}`,
        'content-type': 'application/json',
        ...(init.prefer ? { prefer: init.prefer } : {}),
      },
    });
    if (!res.ok) throw new Error(`supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res;
  }

  private async countOf(path: string) {
    const res = await this.call(path, { method: 'HEAD', prefer: 'count=exact' });
    return Number(res.headers.get('content-range')?.split('/')[1] ?? 0);
  }

  count() {
    return this.countOf('raros?select=id');
  }

  async sample(recent: number, random: number) {
    const res = await this.call('rpc/raros_sample', { method: 'POST', body: JSON.stringify({ n_recent: recent, n_random: random }) });
    return ((await res.json()) as Raro[]).map(pub);
  }

  async byDevice(deviceId: string) {
    const res = await this.call(`raros?device_id=eq.${encodeURIComponent(deviceId)}&limit=1`);
    return ((await res.json()) as RaroRow[])[0] ?? null;
  }

  async upsert(row: { device_id: string; ip_hash: string; name: string; look: Look }) {
    const res = await this.call('raros?on_conflict=device_id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: JSON.stringify(row),
    });
    return pub(((await res.json()) as Raro[])[0]);
  }

  createdSince(ipHash: string, sinceIso: string) {
    return this.countOf(`raros?select=id&ip_hash=eq.${ipHash}&created_at=gte.${encodeURIComponent(sinceIso)}`);
  }

  async list(limit: number, offset: number) {
    const res = await this.call(`raros?order=created_at.desc&limit=${limit}&offset=${offset}`);
    return (await res.json()) as RaroRow[];
  }

  async remove(id: string) {
    await this.call(`raros?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async addMessage(m: Omit<MessageRow, 'id' | 'created_at'>) {
    await this.call('mensajes', { method: 'POST', body: JSON.stringify(m) });
  }

  messagesSince(ipHash: string, sinceIso: string) {
    return this.countOf(`mensajes?select=id&ip_hash=eq.${ipHash}&created_at=gte.${encodeURIComponent(sinceIso)}`);
  }

  async listMessages(limit: number) {
    const res = await this.call(`mensajes?order=created_at.desc&limit=${limit}`);
    return (await res.json()) as MessageRow[];
  }

  async removeMessage(id: string) {
    await this.call(`mensajes?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
}

// --- Archivo local (desarrollo) -----------------------------------------------------
// Sin las variables de Supabase, todo se guarda en .data/db.json para poder probar sin cuenta.

class FileStore implements Store {
  private file = '.data/db.json';
  private db: { raros: RaroRow[]; mensajes: MessageRow[] } | null = null;

  private async load() {
    if (this.db) return this.db;
    const fs = await import('node:fs/promises');
    try {
      this.db = JSON.parse(await fs.readFile(this.file, 'utf8'));
    } catch {
      this.db = { raros: [], mensajes: [] };
    }
    return this.db!;
  }

  private async save() {
    const fs = await import('node:fs/promises');
    await fs.mkdir('.data', { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(this.db, null, 1));
  }

  async count() {
    return (await this.load()).raros.length;
  }

  async sample(recent: number, random: number) {
    const all = [...(await this.load()).raros].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const rest = all.slice(recent);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return [...all.slice(0, recent), ...rest.slice(0, random)].map(pub);
  }

  async byDevice(deviceId: string) {
    return (await this.load()).raros.find((r) => r.device_id === deviceId) ?? null;
  }

  async upsert(row: { device_id: string; ip_hash: string; name: string; look: Look }) {
    const db = await this.load();
    let r = db.raros.find((x) => x.device_id === row.device_id);
    if (r) Object.assign(r, { name: row.name, look: row.look });
    else {
      r = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
      db.raros.push(r);
    }
    await this.save();
    return pub(r);
  }

  async createdSince(ipHash: string, sinceIso: string) {
    return (await this.load()).raros.filter((r) => r.ip_hash === ipHash && r.created_at >= sinceIso).length;
  }

  async list(limit: number, offset: number) {
    const all = [...(await this.load()).raros].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return all.slice(offset, offset + limit);
  }

  async remove(id: string) {
    const db = await this.load();
    db.raros = db.raros.filter((r) => r.id !== id);
    await this.save();
  }

  async addMessage(m: Omit<MessageRow, 'id' | 'created_at'>) {
    const db = await this.load();
    db.mensajes.push({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...m });
    await this.save();
  }

  async messagesSince(ipHash: string, sinceIso: string) {
    return (await this.load()).mensajes.filter((m) => m.ip_hash === ipHash && m.created_at >= sinceIso).length;
  }

  async listMessages(limit: number) {
    return [...(await this.load()).mensajes].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
  }

  async removeMessage(id: string) {
    const db = await this.load();
    db.mensajes = db.mensajes.filter((m) => m.id !== id);
    await this.save();
  }
}

let store: Store | null = null;

export function getStore(): Store {
  if (store) return store;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  store = url && key ? new SupabaseStore(url.replace(/\/$/, ''), key) : new FileStore();
  return store;
}

export const usingSupabase = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
