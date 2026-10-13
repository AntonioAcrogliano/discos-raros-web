import type { Look, Raro, SetInfo } from '../shared/look';

/** Llamada a la API del sitio. Si falla, tira un Error con el mensaje que mandó el servidor. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  } catch {
    throw new Error('No hay conexión.');
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) throw new Error(data?.error ?? `Error ${res.status}`);
  return data;
}

/** Identificador del dispositivo: de acá sale lo de "1 personaje por dispositivo". */
export function deviceId(): string {
  try {
    let id = localStorage.getItem('dr-device');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('dr-device', id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

let setsPromise: Promise<SetInfo[]> | null = null;
export function fetchSets(): Promise<SetInfo[]> {
  setsPromise ??= api<{ sets: SetInfo[] }>('/api/sets').then((r) => r.sets);
  setsPromise.catch(() => (setsPromise = null));
  return setsPromise;
}

export interface PistaData {
  total: number;
  raros: Raro[];
  mine: Raro | null;
}
export const fetchPista = () => api<PistaData>(`/api/raros?device=${deviceId()}`);

export const saveRaro = (name: string, look: Look, phrase: string, token?: string) =>
  api<{ raro: Raro; total: number }>('/api/raros', { method: 'POST', body: JSON.stringify({ device: deviceId(), name, look, phrase, token }) });

export const sendContact = (data: Record<string, string | undefined>) =>
  api<{ ok: true }>('/api/contact', { method: 'POST', body: JSON.stringify(data) });
