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

/** ¿Ya puede sonar? Algunos navegadores lo permiten sin esperar el primer click. */
export function audioLive() {
  try {
    actx ??= new AudioContext();
  } catch {
    return false;
  }
  return actx.state === 'running';
}

/**
 * El boliche escuchado desde la vereda: lo único que atraviesa la pared es el bombo y un poco
 * del bajo, sin agudos. Se sintetiza al tempo del set (el audio de YouTube no se puede filtrar)
 * y se funde con el set de verdad cuando se abre la puerta.
 */
export const muffled = {
  bpm: 126,
  out: null as GainNode | null,
  next: 0,
  timer: 0,
  get playing() {
    return this.out !== null;
  },
  start(level = 1) {
    if (!actx || this.out) return;
    const filter = actx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 170;
    this.out = actx.createGain();
    this.out.gain.value = level;
    this.out.connect(filter).connect(actx.destination);
    this.next = actx.currentTime + 0.05;
    // Se agendan los golpes un poquito por adelantado: así el tempo no depende de los frames.
    this.timer = window.setInterval(() => this.schedule(), 40);
    this.schedule();
  },
  schedule() {
    if (!actx || !this.out) return;
    const beat = 60 / this.bpm;
    // Si la pestaña estuvo en segundo plano, no tocar de golpe todos los que se salteó.
    if (this.next < actx.currentTime) this.next = actx.currentTime + 0.02;
    while (this.next < actx.currentTime + 0.2) {
      this.hit(this.next, 96, 42, 0.3, 0.9);
      this.hit(this.next + beat / 2, 62, 55, 0.16, 0.3);
      this.next += beat;
    }
  },
  /** Un golpe grave: baja de tono y se apaga. */
  hit(t: number, from: number, to: number, dur: number, vol: number) {
    if (!actx || !this.out) return;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  },
  /** Volumen (0–1), sin saltos. */
  level(v: number) {
    if (actx && this.out) this.out.gain.setTargetAtTime(v, actx.currentTime, 0.08);
  },
  stop() {
    window.clearInterval(this.timer);
    this.out?.disconnect();
    this.out = null;
  },
};

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
