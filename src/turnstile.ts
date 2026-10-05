/**
 * Cloudflare Turnstile (control anti-robots sin registro). Solo se usa si está configurada
 * VITE_TURNSTILE_SITEKEY; si no, mountTurnstile no dibuja nada y el token queda vacío.
 */

const SITEKEY = import.meta.env.VITE_TURNSTILE_SITEKEY as string | undefined;

interface TurnstileApi {
  render(el: HTMLElement, o: { sitekey: string; theme: string; size: string }): string;
  getResponse(id: string): string | undefined;
  reset(id: string): void;
}

let loading: Promise<TurnstileApi> | null = null;
function load(): Promise<TurnstileApi> {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.onload = () => resolve((window as unknown as { turnstile: TurnstileApi }).turnstile);
    s.onerror = () => reject(new Error('No cargó el control anti-robots.'));
    document.head.append(s);
  });
  return loading;
}

export function mountTurnstile(container: HTMLElement) {
  let id: string | null = null;
  let apiRef: TurnstileApi | null = null;
  if (SITEKEY) {
    void load().then((t) => {
      apiRef = t;
      id = t.render(container, { sitekey: SITEKEY, theme: 'dark', size: 'flexible' });
    });
  }
  return {
    token: () => (apiRef && id ? apiRef.getResponse(id) : undefined),
    reset: () => {
      if (apiRef && id) apiRef.reset(id);
    },
  };
}
