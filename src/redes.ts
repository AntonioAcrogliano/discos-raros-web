/** Las redes de Discos Raros. `short` es la etiqueta para pantallas chicas. */
export const REDES = [
  { name: 'YOUTUBE', short: 'YT', href: 'https://www.youtube.com/@discosraros', cls: 'yt' },
  { name: 'INSTAGRAM', short: 'IG', href: 'https://www.instagram.com/discosraros.arg', cls: 'ig' },
  { name: 'KICK', short: 'KICK', href: 'https://kick.com/discosraros', cls: 'kick' },
] as const;

/** Fila de botones a las redes (se abren en otra pestaña). */
export function redesLinks(className = 'redes'): HTMLElement {
  const row = document.createElement('div');
  row.className = className;
  for (const r of REDES) {
    const a = document.createElement('a');
    a.className = `btn chico red ${r.cls}`;
    a.href = r.href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.setAttribute('aria-label', `Discos Raros en ${r.name}`);
    const largo = document.createElement('span');
    largo.className = 'largo';
    largo.textContent = r.name;
    const corto = document.createElement('span');
    corto.className = 'corto';
    corto.textContent = r.short;
    a.append(largo, corto);
    row.append(a);
  }
  return row;
}
