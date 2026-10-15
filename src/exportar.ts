import * as THREE from 'three';
import { LOOK, type Look, validLook } from '../shared/look';
import { Crowd } from './scenes/boiler/crowd';
import { DR, FONT, fitSize, fontsReady, outlined, psxUniforms, sfx } from './style-kit';
import { el, sinTildes } from './ui/dom';
import { type Formato, GifWriter, ZipBatch, buildMov, buildMp4, canMp4 } from './exportar-formatos';

/**
 * Exportador para el videoclip: dibuja a cada raro bailando su paso, solo y con fondo
 * transparente (con su nombre y el globito con su frase, si se quiere), y lo baja en un ZIP:
 * un video por raro (MOV transparente o MP4 sobre verde), un GIF, o los PNG cuadro por cuadro.
 * Usa la misma pista (`Crowd`) y el mismo look PS1 que el sitio: resolución baja, vértices que
 * saltan y color de 15 bits con tramado. Cada clip es un loop perfecto: repetido, empalma.
 */

export interface ExportRaro {
  id: string;
  name: string;
  look: Look;
  /** Lo que dice cuando lo tocan ('' = nada). */
  phrase: string;
  created_at: string;
}

export interface ExportOptions {
  bpm: number;
  fps: number;
  /** Largo del loop en beats (múltiplo de 4 para que todos los pasos cierren). */
  beats: number;
  /** Resolución interna (la de "la Play") y por cuánto se agranda al guardar. */
  width: number;
  height: number;
  scale: number;
  view: 'frente' | 'perfil' | 'gira';
  /** Mismo tamaño en el cuadro para todos, o cada uno con su altura (el petiso sale petiso). */
  fit: boolean;
  /** Qué se escribe: nada, el nombre arriba, o el nombre y el globito con su frase (como en la pista). */
  texto: 'nada' | 'nombre' | 'frase';
  formato: Formato;
}

const TAU = Math.PI * 2;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Dibuja un raro por vez en un canvas chico con fondo transparente. */
class RaroStudio {
  /** El cuadro terminado, ya agrandado. */
  readonly canvas = document.createElement('canvas');
  private renderer: THREE.WebGLRenderer;
  private small = document.createElement('canvas');
  private ctx = this.small.getContext('2d', { willReadFrequently: true })!;
  private out = this.canvas.getContext('2d')!;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  private crowd = new Crowd(1);
  private name = '';
  private phrase = '';
  private head = new THREE.Vector3();

  constructor(private o: ExportOptions) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);
    this.scene.add(this.crowd.group);
    this.crowd.setSolo(true);
    // Luz pareja de frente, sin niebla: acá no hay boliche.
    psxUniforms.uFog.value = 0;
    psxUniforms.uAmbient.value.setRGB(0.5, 0.5, 0.56);
    psxUniforms.uLightColor.value.setRGB(0.6, 0.58, 0.54);
    psxUniforms.uLightDir.value.set(0.35, 0.7, 0.9).normalize();
    this.setOptions(o);
  }

  setOptions(o: ExportOptions) {
    this.o = o;
    this.renderer.setSize(o.width, o.height, false);
    this.small.width = o.width;
    this.small.height = o.height;
    this.canvas.width = o.width * o.scale;
    this.canvas.height = o.height * o.scale;
    this.out.imageSmoothingEnabled = false;
    psxUniforms.uResolution.value.set(o.width, o.height);
    this.camera.aspect = o.width / o.height;
    this.frame();
  }

  setRaro(r: { name: string; look: Look; phrase?: string }) {
    this.name = r.name;
    this.phrase = r.phrase ?? '';
    this.crowd.setDancers([{ id: 'export', name: r.name, look: r.look }]);
    this.crowd.pin(0, 0, 0);
    this.frame();
  }

  private frame() {
    // El cuadro entra de los pies a un salto con los brazos arriba; el gigante es 1,34.
    // Con el globito, la cámara se aleja y sube: el raro queda abajo y el globito entra arriba.
    const s = this.o.fit ? this.crowd.scaleOf(0) : 1.34;
    const up = this.o.texto === 'frase' ? 1.32 : 1.24, far = this.o.texto === 'frase' ? 5.6 : 5.1;
    this.camera.position.set(0, up * s, far * s);
    this.camera.lookAt(0, up * s, 0);
    this.camera.updateProjectionMatrix();
  }

  /** El globito con la frase (letras negras sobre crema, con su piquito hacia la cabeza) y el nombre arriba. */
  private bubble(w: number, h: number, unit: number) {
    const ctx = this.ctx;
    if (!this.crowd.headTop(0, this.head)) return;
    this.head.project(this.camera);
    const hx = Math.round((this.head.x * 0.5 + 0.5) * w), hy = Math.round((-this.head.y * 0.5 + 0.5) * h);
    const lines: string[] = [];
    for (const word of sinTildes(this.phrase).split(' ')) {
      const last = lines[lines.length - 1];
      if (last !== undefined && last.length + 1 + word.length <= 14) lines[lines.length - 1] = `${last} ${word}`;
      else lines.push(word);
    }
    ctx.font = `${unit}px ${FONT}`;
    const pad = Math.round(unit * 0.6), gap = Math.round(unit * 0.4);
    const bw = Math.min(w - 4, Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2), bh = lines.length * unit + (lines.length - 1) * gap + pad * 2;
    const x = Math.max(2, Math.min(w - bw - 2, hx - Math.round(bw / 2))), y = Math.max(unit * 2 + 2, hy - unit - bh);
    ctx.fillStyle = DR.negro;
    ctx.fillRect(x - 1, y - 1, bw + 2, bh + 2);
    const tip = Math.max(x + 2, Math.min(x + bw - 8, hx - 3));
    for (let k = 0; k < 4; k++) ctx.fillRect(tip + k, y + bh + 1 + k, Math.max(1, 7 - k * 2), 1);
    ctx.fillStyle = DR.crema;
    ctx.fillRect(x, y, bw, bh);
    for (let k = 0; k < 3; k++) ctx.fillRect(tip + 1 + k, y + bh + k, 5 - k * 2, 1);
    ctx.fillStyle = DR.negro;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((l, n) => ctx.fillText(l, x + Math.round(bw / 2), y + pad + Math.round(unit / 2) + n * (unit + gap)));
    if (this.name) outlined(ctx, sinTildes(this.name), x + Math.round(bw / 2), y - unit, fitSize(this.name, unit, w), DR.amarillo);
  }

  /** Dibuja el cuadro `f` de `frames` (el último empalma con el primero). */
  draw(f: number, frames: number) {
    const { o } = this;
    const k = f / frames;
    this.crowd.spin = o.view === 'gira' ? TAU * k : o.view === 'perfil' ? 0.6 : 0;
    this.crowd.update(k * o.beats, 1, 0);
    this.renderer.render(this.scene, this.camera);

    const { width: w, height: h } = o;
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.drawImage(this.renderer.domElement, 0, 0);
    // La letra pixelada se ve nítida en múltiplos de 8.
    const unit = 8 * Math.max(1, Math.floor(Math.min(w, h) / 320));
    if (o.texto === 'frase' && this.phrase) this.bubble(w, h, unit);
    else if (o.texto !== 'nada' && this.name) {
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      outlined(this.ctx, sinTildes(this.name), w / 2, Math.round(unit * 1.6), fitSize(this.name, unit, w), DR.amarillo);
    }
    // Como en la Play: cada píxel opaco o transparente, color de 15 bits con tramado.
    const img = this.ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let y = 0, i = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i += 4) {
        if (d[i + 3] < 128) {
          d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
          continue;
        }
        const t = (BAYER[(x & 3) + (y & 3) * 4] + 0.5) / 16;
        for (let c = 0; c < 3; c++) d[i + c] = Math.round((Math.min(31, Math.floor((d[i + c] / 255) * 31 + t)) / 31) * 255);
        d[i + 3] = 255;
      }
    }
    this.ctx.putImageData(img, 0, 0);
    this.out.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.out.drawImage(this.small, 0, 0, this.canvas.width, this.canvas.height);
  }

  png(): Promise<Blob> {
    return new Promise((resolve, reject) => this.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo armar el PNG.'))), 'image/png'));
  }

  /** El cuadro agrandado, como píxeles (para el GIF). */
  pixels() {
    return this.out.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }

  private flat = document.createElement('canvas');
  /** El cuadro sobre un fondo de color (para el MP4, que no tiene transparencia). */
  onColor(color: string) {
    const { width, height } = this.canvas;
    if (this.flat.width !== width || this.flat.height !== height) Object.assign(this.flat, { width, height });
    const ctx = this.flat.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(this.canvas, 0, 0);
    return this.flat;
  }
}

/** El verde del chroma (el de siempre: el editor lo saca solo). */
const CHROMA = '#00b140';

const frameCount = (o: ExportOptions) => Math.max(2, Math.round(((o.beats * 60) / o.bpm) * o.fps));
const slug = (s: string) => s.normalize('NFD').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'RARO';
const pad = (n: number, len: number) => String(n).padStart(len, '0');


/**
 * Panel del exportador. `load` trae todos los personajes (del más viejo al más nuevo: el número
 * de cada uno es su orden de llegada a la pista y no cambia cuando se suma gente).
 */
export function mountExportador(root: HTMLElement, load: () => Promise<ExportRaro[]>) {
  const o: ExportOptions = { bpm: 128, fps: 30, beats: 8, width: 320, height: 320, scale: 2, view: 'frente', fit: true, texto: 'frase', formato: 'mov' };
  let raros: ExportRaro[] = [];
  let at = 0;
  let busy = false;
  let cancel = false;
  let studio: RaroStudio | null = null;
  let frame = 0;

  const status = el('p', 'aviso', 'CARGANDO PERSONAJES...');
  status.setAttribute('role', 'status');
  const quien = el('span', 'export-quien');
  const marco = el('div', 'export-vista');
  const info = el('p', 'aviso');

  const select = <T extends string | number>(label: string, options: [T, string][], value: T, onChange: (v: T) => void) => {
    const s = el('select');
    options.forEach(([, text], i) => s.append(new Option(text, String(i), false, options[i][0] === value)));
    s.addEventListener('change', () => {
      onChange(options[Number(s.value)][0]);
      refresh();
    });
    return el('label', 'campo', [el('span', '', label), s]);
  };
  const number = (label: string, value: number, min: number, max: number, onChange: (v: number) => void) => {
    const i = el('input');
    i.type = 'number';
    i.min = String(min);
    i.max = String(max);
    i.value = String(value);
    i.addEventListener('change', () => {
      // (El máximo se lee del campo: el de DESDE y HASTA cambia cuando llegan los personajes.)
      const v = Math.min(Number(i.max) || max, Math.max(min, Math.round(Number(i.value) || value)));
      i.value = String(v);
      onChange(v);
      refresh();
    });
    return { field: el('label', 'campo', [el('span', '', label), i]), input: i };
  };

  let from = 1, to = 1;
  const desde = number('DESDE EL N°', 1, 1, 1, (v) => (from = v));
  const hasta = number('HASTA EL N°', 1, 1, 1, (v) => (to = v));
  const sizes: [string, string][] = [['320x320', '320×320 (GRUESO)'], ['480x480', '480×480 (FINO)'], ['256x320', '256×320 (VERTICAL)']];
  const formatos: [Formato, string][] = [
    ['mov', 'VIDEO MOV TRANSPARENTE (PREMIERE, AFTER, DAVINCI)'],
    ...(canMp4() ? ([['mp4', 'VIDEO MP4 CON FONDO VERDE (CAPCUT, CELU)']] as [Formato, string][]) : []),
    ['gif', 'GIF TRANSPARENTE'],
    ['png', 'PNG CUADRO POR CUADRO'],
  ];
  const opciones = el('div', 'export-opciones', [
    select('FORMATO', formatos, o.formato, (v) => (o.formato = v)),
    select('TEXTO', [['frase', 'NOMBRE Y GLOBITO CON SU FRASE'], ['nombre', 'SOLO EL NOMBRE ARRIBA'], ['nada', 'NADA']], o.texto, (v) => (o.texto = v)),
    number('BPM', o.bpm, 60, 200, (v) => (o.bpm = v)).field,
    select('CUADROS POR SEGUNDO', [[24, '24'], [25, '25'], [30, '30'], [60, '60']], o.fps, (v) => (o.fps = v)),
    select('LARGO DEL LOOP', [[4, '4 BEATS'], [8, '8 BEATS'], [16, '16 BEATS']], o.beats, (v) => (o.beats = v)),
    select('PIXELES', sizes, sizes[0][0], (v) => ([o.width, o.height] = v.split('x').map(Number))),
    select('AGRANDADO', [[2, '×2'], [3, '×3'], [4, '×4'], [6, '×6']], o.scale, (v) => (o.scale = v)),
    select('VISTA', [['frente', 'DE FRENTE'], ['perfil', 'DE COSTADO'], ['gira', 'GIRANDO']], o.view, (v) => (o.view = v)),
    select('TAMAÑO', [['si', 'TODOS LLENAN EL CUADRO'], ['no', 'CADA UNO CON SU ALTURA']], o.fit ? 'si' : 'no', (v) => (o.fit = v === 'si')),
    desde.field,
    hasta.field,
  ]);

  const show = (i: number) => {
    if (!raros.length || !studio) return;
    at = (i + raros.length) % raros.length;
    const r = raros[at];
    studio.setRaro(r);
    quien.textContent = `N° ${at + 1} · ${r.name} · ${LOOK.baile[r.look.baile]}`;
  };
  const refresh = () => {
    studio?.setOptions(o);
    const frames = frameCount(o);
    const n = Math.max(0, Math.min(to, raros.length) - from + 1);
    const per = { mov: '1 VIDEO', mp4: '1 VIDEO', gif: '1 GIF', png: `${frames} PNG` }[o.formato];
    info.textContent = `LOOP DE ${(frames / o.fps).toFixed(2)} S (${frames} CUADROS) · ${o.width * o.scale}×${o.height * o.scale} PX · ${n} PERSONAJES, ${per} CADA UNO. SI PESA MUCHO SE BAJA EN VARIOS ZIP.`;
  };

  const nav = (label: string, d: number) => {
    const b = el('button', 'btn chico', label);
    b.type = 'button';
    b.addEventListener('click', () => !busy && show(at + d));
    return b;
  };
  const go = el('button', 'btn rojo', 'EXPORTAR EN ZIP');
  go.type = 'button';
  const stop = el('button', 'btn', 'FRENAR');
  stop.type = 'button';
  stop.hidden = true;
  stop.addEventListener('click', () => (cancel = true));

  /** Un raro entero, en el formato elegido, adentro del ZIP. */
  const exportOne = async (zip: ZipBatch, r: ExportRaro, n: number, label: (f: number) => void) => {
    if (!studio) return;
    const frames = frameCount(o);
    const name = `${pad(n, 4)}_${slug(r.name)}`;
    const w = o.width * o.scale, h = o.height * o.scale;
    if (o.formato === 'png') {
      for (let f = 0; f < frames && !cancel; f++) {
        studio.draw(f, frames);
        await zip.add(`${name}/${slug(r.name)}_${pad(f + 1, 4)}.png`, await studio.png());
        label(f);
      }
    } else if (o.formato === 'mov') {
      const pngs: Uint8Array[] = [];
      for (let f = 0; f < frames && !cancel; f++) {
        studio.draw(f, frames);
        pngs.push(new Uint8Array(await (await studio.png()).arrayBuffer()));
        label(f);
      }
      if (!cancel) await zip.add(`${name}.mov`, buildMov(pngs, w, h, o.fps));
    } else if (o.formato === 'mp4') {
      const video = await buildMp4(
        (f) => {
          studio!.draw(f, frames);
          label(f);
          return studio!.onColor(CHROMA);
        },
        frames,
        w,
        h,
        o.fps,
      );
      await zip.add(`${name}.mp4`, video);
    } else {
      // La paleta del GIF sale de unos cuadros salteados; después se arma de a uno.
      const samples: ImageData[] = [];
      for (let f = 0; f < frames; f += Math.max(1, Math.floor(frames / 6))) {
        studio.draw(f, frames);
        samples.push(studio.pixels());
      }
      const gif = new GifWriter(samples, o.fps);
      for (let f = 0; f < frames && !cancel; f++) {
        studio.draw(f, frames);
        gif.add(studio.pixels());
        label(f);
        // Que la página no se congele mientras arma.
        if (f % 8 === 7) await new Promise((res) => setTimeout(res, 0));
      }
      if (!cancel) await zip.add(`${name}.gif`, gif.blob());
    }
  };

  go.addEventListener('click', async () => {
    if (busy || !studio) return;
    const list = raros.slice(from - 1, to);
    if (!list.length) return void (status.textContent = 'NO HAY PERSONAJES EN ESE RANGO.');
    busy = true;
    cancel = false;
    go.hidden = true;
    stop.hidden = false;
    status.className = 'aviso';
    const frames = frameCount(o);
    const rows = ['numero;archivo;nombre;frase;baile;fecha'];
    const zip = new ZipBatch(`raros_${o.formato}_${pad(from, 4)}-${pad(from + list.length - 1, 4)}`);
    let done = 0;
    try {
      for (const [i, r] of list.entries()) {
        if (cancel) break;
        const n = from + i;
        show(n - 1);
        await exportOne(zip, r, n, (f) => (status.textContent = `EXPORTANDO ${i + 1} DE ${list.length}: ${r.name} (${f + 1}/${frames})`));
        if (cancel) break;
        rows.push([n, `${pad(n, 4)}_${slug(r.name)}`, r.name, r.phrase, LOOK.baile[r.look.baile], r.created_at].join(';'));
        done++;
        if (zip.flushIfBig()) status.textContent = 'BAJANDO UNA PARTE DEL ZIP...';
      }
      // La lista, para armar los títulos en el editor (el BOM es para que Excel lea las Ñ).
      await zip.add('raros.csv', `\uFEFF${rows.join('\r\n')}\r\n`);
      zip.close();
      sfx.start();
      status.className = 'ok';
      status.textContent = cancel ? `FRENADO. SE BAJARON ${done} PERSONAJES COMPLETOS.` : `LISTO: ${done} PERSONAJES. FIJATE EN LAS DESCARGAS.`;
    } catch (e) {
      status.className = 'error';
      status.textContent = `SE CORTO: ${(e as Error).message}`;
    }
    busy = false;
    go.hidden = false;
    stop.hidden = true;
  });

  root.append(
    el('p', '', 'CADA RARO BAILANDO SU PASO, SOLO Y CON FONDO TRANSPARENTE, EN UN LOOP PERFECTO (REPETIDO, EMPALMA). SE BAJA TODO EN UN ZIP.'),
    el('div', 'export-cuerpo', [el('div', 'export-previa', [marco, el('div', 'fila', [nav('<', -1), quien, nav('>', 1)])]), opciones]),
    info,
    el('div', 'fila', [go, stop]),
    status,
  );

  void Promise.all([load(), fontsReady()]).then(
    ([list]) => {
      raros = list;
      if (!raros.length) return void (status.textContent = 'TODAVIA NO HAY NADIE EN LA PISTA.');
      studio = new RaroStudio(o);
      if (import.meta.env.DEV) (window as unknown as { drStudio: unknown }).drStudio = studio;
      marco.append(studio.canvas);
      from = 1;
      to = raros.length;
      desde.input.max = hasta.input.max = hasta.input.value = String(raros.length);
      show(0);
      refresh();
      status.textContent = `${raros.length} PERSONAJES LISTOS PARA EXPORTAR.`;
      // Vista previa: el mismo loop que se va a guardar, a la misma velocidad.
      let last = performance.now();
      const tick = (now: number) => {
        requestAnimationFrame(tick);
        if (busy || !studio || now - last < 1000 / o.fps) return;
        last = now;
        const frames = frameCount(o);
        frame = (frame + 1) % frames;
        studio.draw(frame, frames);
      };
      requestAnimationFrame(tick);
      studio.draw(0, frameCount(o));
    },
    (e: Error) => {
      status.className = 'error';
      status.textContent = e.message;
    },
  );
}

/** Deja solo los personajes con un look que se pueda dibujar (completando los viejos). */
export function cleanRaros(list: { id: string; name: string; look: unknown; phrase?: string; created_at: string }[]): ExportRaro[] {
  const out: ExportRaro[] = [];
  for (const r of list) {
    const look = validLook(r.look);
    if (look) out.push({ id: r.id, name: r.name, look, phrase: r.phrase ?? '', created_at: r.created_at });
  }
  return out;
}
