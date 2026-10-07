import * as THREE from 'three';
import { LOOK, type Look, validLook } from '../shared/look';
import { Crowd } from './scenes/boiler/crowd';
import { DR, fitSize, fontsReady, outlined, psxUniforms, sfx } from './style-kit';
import { el } from './ui/dom';

/**
 * Exportador para el videoclip: dibuja a cada raro bailando su paso, solo y con fondo
 * transparente, y guarda una secuencia de PNG por personaje en la carpeta que se elija
 * (cualquier editor de video la importa como un clip con transparencia).
 * Usa la misma pista (`Crowd`) y el mismo look PS1 que el sitio: resolución baja, vértices que
 * saltan y color de 15 bits con tramado. Cada secuencia es un loop perfecto.
 */

export interface ExportRaro {
  id: string;
  name: string;
  look: Look;
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
  /** Nombre escrito arriba, con la fuente del sitio. */
  name: boolean;
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

  setRaro(r: { name: string; look: Look }) {
    this.name = r.name;
    this.crowd.setDancers([{ id: 'export', name: r.name, look: r.look }]);
    this.crowd.pin(0, 0, 0);
    this.frame();
  }

  private frame() {
    // El cuadro entra de los pies a un salto con los brazos arriba; el gigante es 1,34.
    const s = this.o.fit ? this.crowd.scaleOf(0) : 1.34;
    this.camera.position.set(0, 1.24 * s, 5.1 * s);
    this.camera.lookAt(0, 1.24 * s, 0);
    this.camera.updateProjectionMatrix();
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
    if (o.name && this.name) {
      const unit = Math.max(6, Math.round((Math.min(w, h) / 240) * 8));
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      outlined(this.ctx, this.name, w / 2, Math.round(unit * 1.6), fitSize(this.name, unit, w), DR.amarillo);
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
}

const frameCount = (o: ExportOptions) => Math.max(2, Math.round(((o.beats * 60) / o.bpm) * o.fps));
const slug = (s: string) => s.normalize('NFD').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'RARO';
const pad = (n: number, len: number) => String(n).padStart(len, '0');

type DirPicker = (o?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
const dirPicker = () => (window as unknown as { showDirectoryPicker?: DirPicker }).showDirectoryPicker;

async function writeFile(dir: FileSystemDirectoryHandle, name: string, data: Blob | string) {
  const file = await dir.getFileHandle(name, { create: true });
  const w = await file.createWritable();
  await w.write(data);
  await w.close();
}

/**
 * Panel del exportador. `load` trae todos los personajes (del más viejo al más nuevo: el número
 * de cada uno es su orden de llegada a la pista y no cambia cuando se suma gente).
 */
export function mountExportador(root: HTMLElement, load: () => Promise<ExportRaro[]>) {
  const o: ExportOptions = { bpm: 128, fps: 30, beats: 8, width: 320, height: 320, scale: 3, view: 'frente', fit: true, name: false };
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
      const v = Math.min(max, Math.max(min, Math.round(Number(i.value) || value)));
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
  const opciones = el('div', 'export-opciones', [
    number('BPM', o.bpm, 60, 200, (v) => (o.bpm = v)).field,
    select('CUADROS POR SEGUNDO', [[24, '24'], [25, '25'], [30, '30'], [60, '60']], o.fps, (v) => (o.fps = v)),
    select('LARGO DEL LOOP', [[4, '4 BEATS'], [8, '8 BEATS'], [16, '16 BEATS']], o.beats, (v) => (o.beats = v)),
    select('PIXELES', sizes, sizes[0][0], (v) => ([o.width, o.height] = v.split('x').map(Number))),
    select('AGRANDADO', [[2, '×2'], [3, '×3'], [4, '×4'], [6, '×6']], o.scale, (v) => (o.scale = v)),
    select('VISTA', [['frente', 'DE FRENTE'], ['perfil', 'DE COSTADO'], ['gira', 'GIRANDO']], o.view, (v) => (o.view = v)),
    select('TAMAÑO', [['si', 'TODOS LLENAN EL CUADRO'], ['no', 'CADA UNO CON SU ALTURA']], o.fit ? 'si' : 'no', (v) => (o.fit = v === 'si')),
    select('NOMBRE ARRIBA', [['no', 'NO'], ['si', 'SI']], o.name ? 'si' : 'no', (v) => (o.name = v === 'si')),
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
    info.textContent = `${frames} CUADROS POR PERSONAJE (${(frames / o.fps).toFixed(2)} S) · ${o.width * o.scale}×${o.height * o.scale} PX · ${n} PERSONAJES = ${n * frames} PNG`;
  };

  const nav = (label: string, d: number) => {
    const b = el('button', 'btn chico', label);
    b.type = 'button';
    b.addEventListener('click', () => !busy && show(at + d));
    return b;
  };
  const go = el('button', 'btn rojo', 'ELEGIR CARPETA Y EXPORTAR');
  go.type = 'button';
  const stop = el('button', 'btn', 'FRENAR');
  stop.type = 'button';
  stop.hidden = true;
  stop.addEventListener('click', () => (cancel = true));

  go.addEventListener('click', async () => {
    const pick = dirPicker();
    if (!pick) return void (status.textContent = 'ESTE NAVEGADOR NO DEJA GUARDAR EN UNA CARPETA. USA CHROME O EDGE EN LA COMPU.');
    if (busy || !studio) return;
    const list = raros.slice(from - 1, to);
    if (!list.length) return void (status.textContent = 'NO HAY PERSONAJES EN ESE RANGO.');
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await pick({ mode: 'readwrite' });
    } catch {
      return; // canceló el diálogo
    }
    busy = true;
    cancel = false;
    go.hidden = true;
    stop.hidden = false;
    status.className = 'aviso';
    const frames = frameCount(o);
    const rows = ['numero;carpeta;nombre;baile;fecha'];
    let done = 0;
    try {
      for (const [i, r] of list.entries()) {
        if (cancel) break;
        const n = from + i;
        const folder = `${pad(n, 4)}_${slug(r.name)}`;
        const sub = await dir.getDirectoryHandle(folder, { create: true });
        show(n - 1);
        for (let f = 0; f < frames && !cancel; f++) {
          studio.draw(f, frames);
          await writeFile(sub, `${slug(r.name)}_${pad(f + 1, 4)}.png`, await studio.png());
          status.textContent = `EXPORTANDO ${i + 1} DE ${list.length}: ${r.name} (${f + 1}/${frames})`;
        }
        if (cancel) break;
        rows.push([n, folder, r.name, LOOK.baile[r.look.baile], r.created_at].join(';'));
        done++;
      }
      // La lista, para armar los títulos en el editor (el BOM es para que Excel lea las Ñ).
      await writeFile(dir, `raros_${pad(from, 4)}-${pad(from + Math.max(0, done - 1), 4)}.csv`, `﻿${rows.join('\r\n')}\r\n`);
      sfx.start();
      status.className = 'ok';
      status.textContent = cancel ? `FRENADO. QUEDARON ${done} PERSONAJES COMPLETOS.` : `LISTO: ${done} PERSONAJES EN LA CARPETA "${dir.name}".`;
    } catch (e) {
      status.className = 'error';
      status.textContent = `SE CORTO: ${(e as Error).message}`;
    }
    busy = false;
    go.hidden = false;
    stop.hidden = true;
  });

  root.append(
    el('p', '', 'CADA RARO BAILANDO SU PASO, SOLO Y CON FONDO TRANSPARENTE: UNA CARPETA DE PNG POR PERSONAJE, PARA ARMAR EL VIDEOCLIP.'),
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
      status.textContent = dirPicker() ? `${raros.length} PERSONAJES LISTOS PARA EXPORTAR.` : 'PARA EXPORTAR HACE FALTA CHROME O EDGE EN LA COMPU.';
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
export function cleanRaros(list: { id: string; name: string; look: unknown; created_at: string }[]): ExportRaro[] {
  const out: ExportRaro[] = [];
  for (const r of list) {
    const look = validLook(r.look);
    if (look) out.push({ id: r.id, name: r.name, look, created_at: r.created_at });
  }
  return out;
}
