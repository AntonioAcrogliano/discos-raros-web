/**
 * Las luces siguen la música de verdad. YouTube no deja leer el audio del player, así que cada
 * set se analiza una vez (`npm run luces`, scripts/luces.mjs) y queda en public/luces/<id>.bin:
 * el volumen de graves, medios y agudos 25 veces por segundo, y el momento de cada beat. Acá se
 * lee ese archivo y se lo sigue con el reloj del player.
 * Si un set no tiene archivo, no hay música que seguir y la pista baila al BPM aproximado de siempre.
 */

/** Lo que está sonando en este momento. */
export interface Music {
  /** El golpe del bombo (0–1): lo que sobresale de los graves, no el bajo sostenido. */
  kick: number;
  /** Platillos (0–1). */
  high: number;
  /** Qué tan arriba está el tema (0–1): baja en los cortes y sube en los drops. */
  loud: number;
  /** El drop (0–1): salta cuando el tema explota después de venir tranquilo, y se va apagando en unos segundos. */
  drop: number;
  /** Por qué beat va el set, con fracción. */
  beat: number;
  /** Segundos por beat. */
  period: number;
}

interface Data {
  fps: number;
  frames: number;
  /** Graves, medios y agudos de cada medida (0–255). */
  env: Uint8Array;
  /** Segundos de cada beat. */
  beats: Float32Array;
}

/** Cuánto se adelantan las luces al reloj del player (segundos): subirlo si se ven atrasadas. */
const ADELANTO = 0.03;

function parse(buf: ArrayBuffer): Data | null {
  // Si el archivo no existe, el servidor puede contestar con la página: se mira la firma.
  const v = new DataView(buf);
  if (buf.byteLength < 16 || v.getUint32(0) !== 0x44524c31 || v.getUint16(6, true) !== 3) return null;
  const frames = v.getUint32(8, true), count = v.getUint32(12, true);
  if (frames < 2 || count < 2 || buf.byteLength < 16 + count * 4 + frames * 3) return null;
  const beats = new Float32Array(count);
  for (let i = 0; i < count; i++) beats[i] = v.getUint32(16 + i * 4, true) / 1000;
  return { fps: v.getUint16(4, true), frames, env: new Uint8Array(buf, 16 + count * 4, frames * 3), beats };
}

export class Luces {
  private id: string | null = null;
  private data: Data | null = null;
  /** Por dónde va el set según la cuenta de acá, y lo último que dijo el player. */
  private time = 0;
  private told = -1;
  private floor = 0;
  /** Cómo venía el tema en los últimos segundos: contra esto se mide el drop. */
  private usual = 0;
  private i = 0;
  private music: Music = { kick: 0, high: 0, loud: 0, drop: 0, beat: 0, period: 0.5 };

  /** Cambió el set: busca su archivo (si no hay, queda sin música que seguir). */
  load(id: string) {
    if (id === this.id) return;
    this.id = id;
    this.data = null;
    fetch(`/luces/${id}.bin`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((buf) => {
        if (buf && this.id === id) this.data = parse(buf);
      })
      .catch(() => {});
  }

  /**
   * Llamar en cada frame mientras el set suena. `told` es el tiempo que informa el player, que
   * llega a los saltos (unas pocas veces por segundo): entre aviso y aviso se cuenta acá.
   * Devuelve null si el set no tiene archivo.
   */
  follow(dt: number, told: number, rate: number): Music | null {
    const d = this.data;
    if (!d || told < 0) return null;
    this.time += dt * rate;
    let jumped = false;
    if (told !== this.told) {
      this.told = told;
      // Si se fue lejos (adelantaron el video, cambió el set) se salta; si no, se corrige de a poco.
      const off = told - this.time;
      jumped = Math.abs(off) > 0.25;
      this.time += jumped ? off : off * 0.15;
    }
    const t = this.time + ADELANTO, m = this.music;

    const x = Math.max(0, Math.min(d.frames - 1.001, t * d.fps)), f = Math.floor(x), k = x - f;
    const at = (band: number) => (d.env[f * 3 + band] * (1 - k) + d.env[f * 3 + 3 + band] * k) / 255;
    const bass = at(0), mid = at(1);
    // El piso de los graves baja enseguida y sube despacio: lo que sobresale es el bombo.
    this.floor += (bass - this.floor) * Math.min(1, dt * (bass < this.floor ? 8 : 1.5));
    m.kick = Math.max(0, Math.min(1, (bass - this.floor * 0.85) * 1.6));
    m.high = at(2);
    const level = Math.max(bass, mid);
    m.loud += (level - m.loud) * Math.min(1, dt * (level > m.loud ? 2.5 : 0.8));
    // Caer en el medio de un tema no es un drop.
    if (jumped) this.usual = m.loud = level;
    this.usual += (m.loud - this.usual) * Math.min(1, dt / 6);
    const over = Math.max(0, Math.min(1, (m.loud - this.usual - 0.12) * 6));
    m.drop += (over - m.drop) * Math.min(1, dt * (over > m.drop ? 5 : 0.6));

    const b = d.beats, last = b.length - 2;
    let i = Math.min(this.i, last);
    while (i > 0 && b[i] > t) i--;
    while (i < last && b[i + 1] <= t) i++;
    this.i = i;
    m.period = Math.max(0.2, b[i + 1] - b[i]);
    m.beat = i + (t - b[i]) / m.period;
    return m;
  }
}
