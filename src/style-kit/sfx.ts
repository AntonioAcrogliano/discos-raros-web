/**
 * Sonidos de menú tipo Play, sintetizados con WebAudio (sin archivos).
 * Los navegadores no dejan sonar nada hasta el primer click: unlockAudio() se llama en PRESS START.
 */

let actx: AudioContext | null = null;

export function unlockAudio() {
  try {
    actx ??= new AudioContext();
    if (actx.state === 'suspended') void actx.resume();
  } catch {
    /* sin audio */
  }
}

/**
 * El set escuchado desde la vereda, de verdad tapado: un archivo de audio propio (los primeros
 * minutos del set, en public/audio/) pasado por un filtro que deja solo los graves. Al abrirse
 * la puerta el filtro se abre y se cruza con el player de YouTube, que no se puede filtrar.
 */
export class DoorAudio {
  private el: HTMLAudioElement;
  private filter: BiquadFilterNode | null = null;
  private gain: GainNode | null = null;

  /** @param synced el archivo es el principio del mismo set que suena en YouTube. */
  private constructor(url: string, readonly synced: boolean) {
    this.el = new Audio(url);
    this.el.preload = 'auto';
  }

  /** Busca el archivo del set (por número) o, si no está, uno genérico. null = no hay ninguno. */
  static async find(setNumber: string | number): Promise<DoorAudio | null> {
    const base = import.meta.env.BASE_URL;
    for (const [url, synced] of [[`${base}audio/${setNumber}.mp3`, true], [`${base}audio/afuera.mp3`, false]] as const) {
      try {
        const res = await fetch(url, { method: 'HEAD' });
        // En desarrollo, una ruta que no existe devuelve la página (200): hay que mirar el tipo.
        if (res.ok && (res.headers.get('content-type') ?? '').startsWith('audio')) return new DoorAudio(url, synced);
      } catch {
        /* sin red: se sigue sin el efecto */
      }
    }
    return null;
  }

  /** Cuánto dura el archivo (0 hasta que carga los datos). */
  get duration() {
    return Number.isFinite(this.el.duration) ? this.el.duration : 0;
  }

  /** Arranca tapado, desde `offset` segundos. Devuelve false si el navegador no lo dejó. */
  start(offset: number) {
    if (!actx) return false;
    try {
      this.filter = actx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.Q.value = 0.7;
      this.gain = actx.createGain();
      actx.createMediaElementSource(this.el).connect(this.filter).connect(this.gain).connect(actx.destination);
      this.open(0);
      this.level(1);
      this.el.currentTime = offset;
      void this.el.play().catch(() => this.stop());
      return true;
    } catch {
      return false;
    }
  }

  /** Por dónde va (segundos). */
  get time() {
    return this.el.currentTime;
  }

  /** Qué tan abierta está la puerta: 0 = solo graves, 1 = se escucha todo. */
  open(k: number) {
    if (actx && this.filter) this.filter.frequency.setTargetAtTime(170 * 110 ** Math.max(0, Math.min(1, k)), actx.currentTime, 0.03);
  }

  level(v: number) {
    if (actx && this.gain) this.gain.gain.setTargetAtTime(v, actx.currentTime, 0.03);
  }

  stop() {
    this.el.pause();
    this.gain?.disconnect();
    this.gain = null;
  }
}

export function blip(freq: number, dur = 0.05, type: OscillatorType = 'square', vol = 0.05, delay = 0) {
  if (!actx) return;
  try {
    const t = actx.currentTime + delay;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch {
    /* sin audio */
  }
}

export const sfx = {
  /** Mover el cursor del menú. */
  move: () => blip(1320, 0.03, 'square', 0.03),
  /** Elegir una opción. */
  select: () => blip(880, 0.08),
  /** Volver / cancelar. */
  back: () => blip(440, 0.08),
  /** No se puede. */
  error: () => blip(220, 0.12, 'sawtooth', 0.04),
  /** PRESS START: arpegio que sube. */
  start: () => {
    blip(660, 0.08);
    blip(990, 0.08, 'square', 0.05, 0.08);
    blip(1320, 0.2, 'square', 0.05, 0.16);
  },
};
