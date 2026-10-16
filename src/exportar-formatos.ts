import { Zip, ZipPassThrough } from 'fflate';
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';

/**
 * Los formatos del exportador del videoclip. Todos arman un loop perfecto: los cuadros vienen
 * contados (el último empalma con el primero) y cada uno dura exactamente lo mismo.
 * - MOV con transparencia: los cuadros van como PNG adentro de un QuickTime (códec "png ").
 *   Lo abren Premiere, After Effects, DaVinci y Final Cut como clip transparente.
 * - MP4 con fondo de color (verde, para el chroma de CapCut o del celu, que no leen transparencias).
 * - GIF: transparente (de borde duro, que al estilo pixelado le queda bien).
 * - PNG: un archivo por cuadro.
 * Todo va a un ZIP (sin comprimir: los videos y las imágenes ya vienen comprimidos).
 */

export type Formato = 'mov' | 'mp4' | 'gif' | 'png';

// --- MOV (QuickTime) con cuadros PNG -------------------------------------------------------
// Se arma a mano: es un archivo chico de describir. Unidad de tiempo 600 por segundo, que
// divide justo a 24, 25, 30 y 60 cuadros por segundo.

const TIMESCALE = 600;

class Bytes {
  private parts: Uint8Array[] = [];
  length = 0;
  push(b: Uint8Array) {
    this.parts.push(b);
    this.length += b.length;
  }
  u8(v: number) {
    this.push(Uint8Array.of(v & 255));
  }
  u16(v: number) {
    this.push(Uint8Array.of((v >>> 8) & 255, v & 255));
  }
  u32(v: number) {
    this.push(Uint8Array.of((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255));
  }
  str(s: string) {
    this.push(new TextEncoder().encode(s));
  }
  zeros(n: number) {
    this.push(new Uint8Array(n));
  }
  bytes() {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const p of this.parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }
}

/** Una "caja" de QuickTime: tamaño + tipo + contenido. */
function atom(type: string, ...children: Uint8Array[]) {
  const b = new Bytes();
  b.u32(8 + children.reduce((n, c) => n + c.length, 0));
  b.str(type);
  for (const c of children) b.push(c);
  return b.bytes();
}
const raw = (fill: (b: Bytes) => void) => {
  const b = new Bytes();
  fill(b);
  return b.bytes();
};
/** La matriz de transformación "sin transformar" de QuickTime. */
const identity = (b: Bytes) => [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].forEach((v) => b.u32(v));

/** Arma un MOV con transparencia a partir de los PNG de cada cuadro. */
/** Cuánto pesa un cuadro (un Blob no se lee: así un video largo no tiene que estar entero en memoria). */
const sizeOf = (f: Blob | Uint8Array) => (f instanceof Blob ? f.size : f.length);

export function buildMov(frames: (Blob | Uint8Array)[], width: number, height: number, fps: number): Blob {
  const delta = Math.round(TIMESCALE / fps);
  const duration = delta * frames.length;
  const ftyp = atom('ftyp', raw((b) => (b.str('qt  '), b.u32(0x20050300), b.str('qt  '))));
  const mdatHeader = raw((b) => (b.u32(8 + frames.reduce((n, f) => n + sizeOf(f), 0)), b.str('mdat')));
  const dataStart = ftyp.length + mdatHeader.length;

  const mvhd = atom('mvhd', raw((b) => {
    b.u32(0); // versión y flags
    b.u32(0);
    b.u32(0); // creado y modificado
    b.u32(TIMESCALE);
    b.u32(duration);
    b.u32(0x10000); // velocidad
    b.u16(0x100); // volumen
    b.zeros(10);
    identity(b);
    b.zeros(24); // preview, poster, selección, tiempo actual
    b.u32(2); // próximo id de pista
  }));
  const tkhd = atom('tkhd', raw((b) => {
    b.u32(0x000003); // prendida y en la película
    b.u32(0);
    b.u32(0);
    b.u32(1); // id de pista
    b.u32(0);
    b.u32(duration);
    b.zeros(8);
    b.u16(0); // capa
    b.u16(0); // grupo alternativo
    b.u16(0); // volumen (video: 0)
    b.u16(0);
    identity(b);
    b.u32(width << 16);
    b.u32(height << 16);
  }));
  const mdhd = atom('mdhd', raw((b) => {
    b.u32(0);
    b.u32(0);
    b.u32(0);
    b.u32(TIMESCALE);
    b.u32(duration);
    b.u16(0); // idioma
    b.u16(0); // calidad
  }));
  const hdlr = (component: string, sub: string, name: string) =>
    atom('hdlr', raw((b) => {
      b.u32(0);
      b.str(component);
      b.str(sub);
      b.str('appl');
      b.u32(0);
      b.u32(0);
      b.u8(name.length);
      b.str(name);
    }));
  const vmhd = atom('vmhd', raw((b) => (b.u32(0x000001), b.u16(0x40), b.zeros(6))));
  const dref = atom('dref', raw((b) => (b.u32(0), b.u32(1))), atom('alis', raw((b) => b.u32(0x000001))));
  const dinf = atom('dinf', dref);
  // La descripción de los cuadros: PNG de 32 bits (con transparencia).
  const pngEntry = atom('png ', raw((b) => {
    b.zeros(6);
    b.u16(1); // referencia a los datos
    b.u16(0); // versión
    b.u16(0); // revisión
    b.str('appl');
    b.u32(0); // calidad temporal
    b.u32(512); // calidad espacial (normal)
    b.u16(width);
    b.u16(height);
    b.u32(72 << 16); // 72 dpi
    b.u32(72 << 16);
    b.u32(0);
    b.u16(1); // cuadros por muestra
    const name = 'PNG';
    b.u8(name.length);
    b.str(name);
    b.zeros(31 - name.length);
    b.u16(32); // profundidad: con transparencia
    b.u16(0xffff); // sin tabla de colores
  }));
  const stsd = atom('stsd', raw((b) => (b.u32(0), b.u32(1))), pngEntry);
  const stts = atom('stts', raw((b) => (b.u32(0), b.u32(1), b.u32(frames.length), b.u32(delta))));
  const stsc = atom('stsc', raw((b) => (b.u32(0), b.u32(1), b.u32(1), b.u32(frames.length), b.u32(1))));
  const stsz = atom('stsz', raw((b) => (b.u32(0), b.u32(0), b.u32(frames.length), frames.forEach((f) => b.u32(sizeOf(f))))));
  const stco = atom('stco', raw((b) => (b.u32(0), b.u32(1), b.u32(dataStart))));
  const stbl = atom('stbl', stsd, stts, stsc, stsz, stco);
  const minf = atom('minf', vmhd, hdlr('dhlr', 'alis', 'Data Handler'), dinf, stbl);
  const mdia = atom('mdia', mdhd, hdlr('mhlr', 'vide', 'Video Handler'), minf);
  const moov = atom('moov', mvhd, atom('trak', tkhd, mdia));
  return new Blob([ftyp, mdatHeader, ...frames, moov] as BlobPart[], { type: 'video/quicktime' });
}

// --- MP4 (H.264) con fondo de color ----------------------------------------------------------

/** ¿Este navegador puede armar MP4? (Hace falta WebCodecs: Chrome o Edge.) */
export const canMp4 = () => typeof VideoEncoder !== 'undefined';

/** Arma un MP4 con los cuadros (canvas ya pintados sobre el fondo). Ancho y alto tienen que ser pares. */
export async function buildMp4(draw: (f: number) => HTMLCanvasElement, frames: number, width: number, height: number, fps: number): Promise<Blob> {
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width, height, frameRate: fps }, fastStart: 'in-memory' });
  let failed: Error | null = null;
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (failed = e) });
  encoder.configure({ codec: 'avc1.640028', width, height, bitrate: Math.round(width * height * fps * 0.2), framerate: fps });
  for (let f = 0; f < frames; f++) {
    // Cada cuadro dura exacto 1/fps: al repetir el clip, empalma.
    const frame = new VideoFrame(draw(f), { timestamp: Math.round((f * 1e6) / fps), duration: Math.round(1e6 / fps) });
    encoder.encode(frame, { keyFrame: f % (fps * 2) === 0 });
    frame.close();
    // Que no se junten demasiados cuadros esperando.
    if (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0));
    if (failed) throw failed;
  }
  await encoder.flush();
  encoder.close();
  if (failed) throw failed;
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

// --- GIF ----------------------------------------------------------------------------------------

/**
 * GIF transparente que se repite solo. Se va armando de a cuadros (guardarlos todos ocuparía
 * cientos de megas). La paleta sale de unos cuadros de muestra y es la misma para todo el loop:
 * si no, los colores titilan de un cuadro al otro.
 */
export class GifWriter {
  private gif = GIFEncoder();
  private palette: number[][];
  private clear: number;
  constructor(samples: ImageData[], private fps: number) {
    const all = new Uint8ClampedArray(samples.reduce((n, f) => n + f.data.length, 0));
    let at = 0;
    for (const f of samples) {
      all.set(f.data, at);
      at += f.data.length;
    }
    this.palette = quantize(all, 256, { format: 'rgba4444', oneBitAlpha: true });
    this.clear = this.palette.findIndex((c) => c[3] === 0);
  }
  add(f: ImageData) {
    const index = applyPalette(f.data, this.palette, 'rgba4444');
    // (dispose 2: cada cuadro borra el anterior; si no, lo transparente deja ver el de antes.)
    this.gif.writeFrame(index, f.width, f.height, { palette: this.palette, delay: 1000 / this.fps, transparent: this.clear >= 0, transparentIndex: Math.max(0, this.clear), repeat: 0, dispose: 2 });
  }
  blob() {
    this.gif.finish();
    return new Blob([this.gif.bytes()] as BlobPart[], { type: 'image/gif' });
  }
}

// --- ZIP ------------------------------------------------------------------------------------------

/**
 * Un ZIP que se va llenando de a archivos. Pasado `limit` bytes se cierra, se baja y arranca otro
 * (`_parte2`, `_parte3`...): así no se junta todo en la memoria del navegador.
 */
export class ZipBatch {
  private parts: Uint8Array[] = [];
  private zip!: Zip;
  private size = 0;
  private part = 1;
  private files = 0;
  constructor(private name: string, private limit = 350e6) {
    this.open();
  }
  private open() {
    this.parts = [];
    this.size = 0;
    this.files = 0;
    this.zip = new Zip((err, chunk) => {
      if (err) throw err;
      this.parts.push(chunk);
    });
  }
  async add(path: string, data: Blob | Uint8Array | string) {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data;
    const f = new ZipPassThrough(path);
    this.zip.add(f);
    f.push(bytes, true);
    this.size += bytes.length;
    this.files++;
  }
  /** Si ya pesa mucho, baja este y arranca otro. Devuelve si bajó. */
  flushIfBig() {
    if (this.size < this.limit) return false;
    this.close();
    this.part++;
    this.open();
    return true;
  }
  /** Cierra y baja lo que quede. */
  close() {
    if (!this.files) return;
    this.zip.end();
    const blob = new Blob(this.parts as BlobPart[], { type: 'application/zip' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${this.name}${this.part > 1 || this.size >= this.limit ? `_parte${this.part}` : ''}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    this.parts = [];
    this.files = 0;
  }
}
