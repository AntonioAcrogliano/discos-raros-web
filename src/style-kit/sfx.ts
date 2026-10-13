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
 * El ambiente de la vereda de un boliche, sintetizado (sin archivos):
 * - la calle de noche (un fondo grave y parejo);
 * - los graves del boliche atravesando la pared;
 * - la gente de la fila hablando: voces sintetizadas (un tono con formantes de vocales que
 *   cambian sílaba a sílaba), cada una con su timbre, sus frases y sus silencios, y cada
 *   tanto una risa;
 * - una bocina lejos, de vez en cuando;
 * - los autos, que suenan cuando la escena avisa que pasa uno (car): motor + ruedas, con el
 *   tono que cae al pasar.
 * Todo pasa por un eco corto (el rebote de la vereda de enfrente) y un compresor.
 * No lleva ritmo a propósito: arriba suena, bajito, el set de verdad.
 */
type Layer = { gain: AudioParam; filter: BiquadFilterNode; source: AudioBufferSourceNode };
/** Formantes (Hz) de las vocales: con dos alcanza para que suene a alguien hablando. */
const VOWELS: [number, number][] = [[730, 1200], [480, 1900], [300, 2250], [520, 900], [340, 820], [600, 1500]];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export const street = {
  out: null as GainNode | null,
  echo: null as AudioNode | null,
  timers: new Set<number>(),
  sources: [] as AudioScheduledSourceNode[],
  layer: null as ((type: BiquadFilterType, freq: number, q: number, vol: number, to?: AudioNode) => Layer) | null,
  get playing() {
    return this.out !== null;
  },
  /** Hace `fn` dentro de `seconds` (si para entonces sigue sonando). */
  later(seconds: number, fn: () => void) {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      if (this.out) fn();
    }, seconds * 1000);
    this.timers.add(id);
  },
  /** Repite `fn` cada tanto (los segundos los decide `every` en cada vuelta). */
  loop(every: () => number, fn: () => void) {
    const tick = () => {
      fn();
      this.later(every(), tick);
    };
    this.later(every(), tick);
  },
  start(level = 1) {
    const ctx = actx;
    if (!ctx || this.out) return;
    const out = (this.out = ctx.createGain());
    out.gain.value = 0;
    out.gain.setTargetAtTime(level, ctx.currentTime, 0.3);
    const squash = ctx.createDynamicsCompressor();
    squash.threshold.value = -20;
    squash.ratio.value = 4;
    out.connect(squash).connect(ctx.destination);

    // Eco corto y apagado: lo que rebota en la vereda de enfrente. Le da aire de calle.
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.13;
    const back = ctx.createGain();
    back.gain.value = 0.3;
    const dull = ctx.createBiquadFilter();
    dull.type = 'lowpass';
    dull.frequency.value = 1400;
    delay.connect(dull).connect(back).connect(delay);
    dull.connect(out);
    this.echo = delay;

    // Ruido marrón (más graves que agudos) en un buffer que se repite.
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
    /** El ruido pasado por un filtro, a cierto volumen. */
    const layer = (this.layer = (type, freq, q, vol, to = out) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = rnd(0.8, 1.2);
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(f).connect(g).connect(to);
      src.start(0, Math.random() * 3);
      this.sources.push(src);
      return { gain: g.gain, filter: f, source: src };
    });

    // 1) La calle de noche: un fondo parejo y grave, que respira despacio.
    const bed = layer('lowpass', 260, 0.4, 0.3);
    const air = layer('bandpass', 900, 0.4, 0.05);
    // 2) El boliche a través de la pared: solo graves, en oleadas.
    const wall = layer('lowpass', 85, 1.2, 1.3);
    this.loop(
      () => rnd(0.35, 0.9),
      () => {
        const t = ctx.currentTime;
        wall.gain.setTargetAtTime(rnd(0.8, 2), t, 0.25);
        bed.gain.setTargetAtTime(rnd(0.22, 0.36), t, 1.5);
        air.gain.setTargetAtTime(rnd(0.03, 0.07), t, 1.5);
      },
    );

    // 3) La gente de la fila. Cada voz: un tono (las cuerdas) por dos filtros (la boca).
    const crowd = ctx.createGain();
    crowd.gain.value = 0.2;
    const far = ctx.createBiquadFilter();
    far.type = 'lowpass';
    far.frequency.value = 2600;
    crowd.connect(far).connect(out);
    far.connect(delay);
    const voice = (pitch: number, pan: number) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = pitch;
      // Un poco de temblor: una voz nunca es un tono fijo.
      const vib = ctx.createOscillator();
      vib.frequency.value = rnd(4.5, 6);
      const depth = ctx.createGain();
      depth.gain.value = pitch * 0.015;
      vib.connect(depth).connect(osc.frequency);
      const amp = ctx.createGain();
      amp.gain.value = 0;
      const where = ctx.createStereoPanner();
      where.pan.value = pan;
      const mouth = [0, 1].map((k) => {
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = k ? 9 : 6;
        const g = ctx.createGain();
        g.gain.value = k ? 0.6 : 1;
        osc.connect(f).connect(g).connect(amp);
        return f;
      });
      amp.connect(where).connect(crowd);
      osc.start();
      vib.start();
      this.sources.push(osc, vib);
      // Habla en frases (sílaba por sílaba) y hace silencios.
      let left = 0;
      const syllable = () => {
        const t = ctx.currentTime;
        let wait: number;
        if (left > 0) {
          left--;
          const [f1, f2] = VOWELS[Math.floor(Math.random() * VOWELS.length)];
          mouth[0].frequency.setTargetAtTime(f1 * rnd(0.9, 1.1), t, 0.03);
          mouth[1].frequency.setTargetAtTime(f2 * rnd(0.9, 1.1), t, 0.03);
          // La entonación sube y baja, y cae al final de la frase.
          osc.frequency.setTargetAtTime(pitch * (left === 0 ? 0.82 : rnd(0.92, 1.22)), t, 0.05);
          wait = rnd(0.11, 0.24);
          amp.gain.setTargetAtTime(rnd(0.5, 1), t, 0.02);
          amp.gain.setTargetAtTime(left === 0 ? 0 : rnd(0.05, 0.3), t + wait * 0.65, 0.03);
        } else {
          amp.gain.setTargetAtTime(0, t, 0.05);
          wait = rnd(0.5, 3.5);
          left = Math.floor(rnd(4, 14));
        }
        this.later(wait, syllable);
      };
      this.later(rnd(0.2, 2.5), syllable);
      /** Una risa: "ja ja ja" cada vez más grave. */
      return () => {
        const t = ctx.currentTime, n = Math.floor(rnd(4, 8));
        left = 0;
        mouth[0].frequency.setTargetAtTime(760, t, 0.02);
        mouth[1].frequency.setTargetAtTime(1250, t, 0.02);
        for (let i = 0; i < n; i++) {
          const at = t + i * 0.17;
          osc.frequency.setTargetAtTime(pitch * (1.5 - i * 0.07), at, 0.02);
          amp.gain.setTargetAtTime(1, at, 0.012);
          amp.gain.setTargetAtTime(0, at + 0.08, 0.02);
        }
      };
    };
    // Graves y agudas, repartidas a los costados (la fila está a la izquierda de la puerta).
    const laughs = [voice(108, -0.7), voice(132, -0.35), voice(205, -0.55), voice(228, -0.15), voice(118, 0.25), voice(190, -0.85)];
    this.loop(
      () => rnd(7, 18),
      () => laughs[Math.floor(Math.random() * laughs.length)](),
    );

    // 4) Una bocina lejos, de vez en cuando.
    this.loop(
      () => rnd(14, 34),
      () => {
        const t = ctx.currentTime, dur = rnd(0.18, 0.6);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.035, t + 0.02);
        g.gain.setValueAtTime(0.035, t + dur);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 1300;
        const where = ctx.createStereoPanner();
        where.pan.value = rnd(-0.9, 0.9);
        f.connect(g).connect(where).connect(out);
        where.connect(delay);
        for (const hz of [392, 494]) {
          const o = ctx.createOscillator();
          o.type = 'square';
          o.frequency.value = hz;
          o.connect(f);
          o.start(t);
          o.stop(t + dur + 0.15);
        }
      },
    );
  },
  /** Pasa un auto (`dir` 1 = hacia la derecha): motor y ruedas que crecen, cruzan y se van, con el tono que cae al pasar. */
  car(dir: number, dur: number) {
    const ctx = actx;
    if (!ctx || !this.out || !this.layer) return;
    const t = ctx.currentTime, mid = t + dur * 0.5;
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(-dir, t);
    pan.pan.linearRampToValueAtTime(dir, t + dur);
    pan.connect(this.out);
    if (this.echo) pan.connect(this.echo);
    const swell = (g: AudioParam, peak: number) => {
      g.setValueAtTime(0.0001, t);
      g.exponentialRampToValueAtTime(peak, mid);
      g.exponentialRampToValueAtTime(0.0001, t + dur);
    };
    // Las ruedas contra el asfalto.
    const tyres = this.layer('bandpass', 300, 0.7, 0, pan);
    // Este ruido es solo de este auto: se apaga cuando termina de pasar.
    this.sources.splice(this.sources.indexOf(tyres.source), 1);
    tyres.source.stop(t + dur + 0.1);
    swell(tyres.gain, 0.9);
    tyres.filter.frequency.setValueAtTime(260, t);
    tyres.filter.frequency.linearRampToValueAtTime(900, mid);
    tyres.filter.frequency.linearRampToValueAtTime(240, t + dur);
    // El motor: un zumbido grave, más agudo mientras se acerca y más grave cuando se aleja.
    const base = rnd(62, 96);
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 420;
    const g = ctx.createGain();
    swell(g.gain, 0.22);
    low.connect(g).connect(pan);
    for (const mult of [1, 2.01]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * mult * 1.07, t);
      o.frequency.setValueAtTime(base * mult * 1.07, mid - 0.25);
      o.frequency.linearRampToValueAtTime(base * mult * 0.93, mid + 0.25);
      o.connect(low);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  },
  /** Volumen (0–1), sin saltos. */
  level(v: number) {
    if (actx && this.out) this.out.gain.setTargetAtTime(v, actx.currentTime, 0.1);
  },
  stop() {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers.clear();
    for (const src of this.sources) {
      try {
        src.stop();
      } catch {
        /* ya estaba frenada */
      }
    }
    this.sources = [];
    this.layer = null;
    this.echo = null;
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

/**
 * La pista festejando el drop: el soplido de los chorros de humo, el "aaah" de la gente (ruido
 * con forma de vocal, que sube y se va en tres segundos) y, salpicados, unos "wuu" y un par de silbidos.
 */
function cheer(vol = 0.5) {
  const ctx = actx;
  if (!ctx || ctx.state !== 'running') return;
  try {
    const t = ctx.currentTime, out = ctx.createGain();
    out.gain.value = vol;
    out.connect(ctx.destination);
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 3.2), ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    /** Sube rápido a `peak` y se apaga de a poco. */
    const swell = (from: AudioNode, peak: number, at: number, dur: number) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(peak, t + at + dur * 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      from.connect(g).connect(out);
    };
    const noise = (type: BiquadFilterType, freq: number, q: number, peak: number, at: number, dur: number) => {
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter();
      src.buffer = buf;
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      swell(src.connect(f), peak, at, dur);
      src.start(t + at);
      src.stop(t + at + dur + 0.05);
    };
    noise('highpass', 5000, 0.7, 0.22, 0, 1.3);
    noise('bandpass', 1100, 0.9, 0.5, 0.05, 3);
    noise('bandpass', 2400, 1.2, 0.22, 0.1, 2.6);
    for (let i = 0; i < 5; i++) {
      const whistle = i < 2, at = rnd(0.1, 1.5), base = whistle ? rnd(1900, 2500) : rnd(380, 620);
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter();
      o.type = whistle ? 'sine' : 'sawtooth';
      o.frequency.setValueAtTime(base, t + at);
      o.frequency.linearRampToValueAtTime(base * (whistle ? 1.35 : 1.7), t + at + 0.25);
      o.frequency.linearRampToValueAtTime(base * (whistle ? 1.1 : 1.2), t + at + 0.7);
      f.type = 'bandpass';
      f.frequency.value = whistle ? base * 1.2 : 1000;
      f.Q.value = whistle ? 0.5 : 2;
      swell(o.connect(f), whistle ? 0.05 : 0.09, at, 0.7);
      o.start(t + at);
      o.stop(t + at + 0.8);
    }
  } catch {
    /* sin audio */
  }
}

export const sfx = {
  /** La pista festeja el drop (el volumen acompaña al del set). */
  cheer,
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
