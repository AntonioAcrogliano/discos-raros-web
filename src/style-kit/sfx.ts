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
 * El ambiente de la vereda de un boliche, sintetizado (sin archivos): el fondo de la calle,
 * los graves que atraviesan la pared y el murmullo de la gente de la fila. Los autos suenan
 * cuando la escena avisa que pasa uno (car). No lleva ritmo a propósito: arriba suena, bajito, el set de verdad.
 */
export const street = {
  out: null as GainNode | null,
  timers: [] as number[],
  sources: [] as AudioScheduledSourceNode[],
  get playing() {
    return this.out !== null;
  },
  start(level = 1) {
    const ctx = actx;
    if (!ctx || this.out) return;
    const out = (this.out = ctx.createGain());
    out.gain.value = 0;
    out.gain.setTargetAtTime(level, ctx.currentTime, 0.25);
    out.connect(ctx.destination);

    // Ruido marrón (más graves que agudos) en un buffer que se repite: de ahí sale todo.
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    // Que el final empalme con el principio (si no, hace "clic" en cada vuelta).
    for (let i = 0; i < 2000; i++) d[len - 1 - i] = d[len - 1 - i] * (i / 2000) + d[i] * (1 - i / 2000);
    /** El ruido pasado por un filtro, a cierto volumen. Devuelve la perilla de volumen. */
    const layer = (type: BiquadFilterType, freq: number, q: number, vol: number, to: AudioNode = out) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(f).connect(g).connect(to);
      src.start(0, Math.random() * 3);
      this.sources.push(src);
      return { gain: g.gain, filter: f };
    };

    // 1) La calle de noche: un fondo parejo, grave.
    layer('lowpass', 320, 0.5, 0.5);
    // 2) El boliche a través de la pared: solo graves, que suben y bajan despacio.
    const wall = layer('bandpass', 62, 3, 1.6);
    // 3) La gente de la fila hablando: tres bandas de la voz, cada una con su vaivén.
    const voices = [layer('bandpass', 480, 2.5, 0), layer('bandpass', 1150, 3, 0), layer('bandpass', 2300, 3.5, 0)];
    this.timers.push(
      window.setInterval(() => {
        const t = ctx.currentTime;
        wall.gain.setTargetAtTime(1.1 + Math.random() * 1.1, t, 0.5);
        voices.forEach((v, i) => v.gain.setTargetAtTime(Math.random() < 0.75 ? Math.random() * [0.5, 0.3, 0.14][i] : 0, t, 0.06));
      }, 140),
    );
    this.layer = layer;
  },
  layer: null as ((type: BiquadFilterType, freq: number, q: number, vol: number, to?: AudioNode) => { gain: AudioParam; filter: BiquadFilterNode }) | null,
  /** Pasa un auto: un soplido que crece, cruza de un lado al otro (`dir` 1 = hacia la derecha) y se va. */
  car(dir: number, dur: number) {
    const ctx = actx;
    if (!ctx || !this.out || !this.layer) return;
    const t = ctx.currentTime;
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(-dir, t);
    pan.pan.linearRampToValueAtTime(dir, t + dur);
    pan.connect(this.out);
    const c = this.layer('bandpass', 260, 0.8, 0, pan);
    c.gain.setValueAtTime(0.0001, t);
    c.gain.exponentialRampToValueAtTime(1.1, t + dur * 0.5);
    c.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    c.filter.frequency.setValueAtTime(220, t);
    c.filter.frequency.linearRampToValueAtTime(640, t + dur * 0.5);
    c.filter.frequency.linearRampToValueAtTime(200, t + dur);
  },
  /** Volumen (0–1), sin saltos. */
  level(v: number) {
    if (actx && this.out) this.out.gain.setTargetAtTime(v, actx.currentTime, 0.1);
  },
  stop() {
    for (const t of this.timers) {
      window.clearInterval(t);
      window.clearTimeout(t);
    }
    this.timers = [];
    for (const src of this.sources) {
      try {
        src.stop();
      } catch {
        /* ya estaba frenada */
      }
    }
    this.sources = [];
    this.layer = null;
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
