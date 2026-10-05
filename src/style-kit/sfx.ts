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
