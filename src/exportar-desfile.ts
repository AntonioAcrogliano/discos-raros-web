import * as THREE from 'three';
import { Crowd } from './scenes/boiler/crowd';
import { fontsReady, psxUniforms, sfx } from './style-kit';
import { el } from './ui/dom';
import { type ExportRaro, drawBubble, psxLook } from './exportar';
import { buildMov, buildMp4, canMp4 } from './exportar-formatos';

/**
 * El desfile: un solo video con todos los raros pasando de derecha a izquierda, uno atrás del
 * otro, bailando su paso, cada uno con su ropa, su altura de verdad, su nombre y el globito con su
 * frase. Fondo transparente (MOV) o verde (MP4). Como los créditos del final de un juego.
 * La "cámara" se corre hacia la derecha a velocidad pareja y los raros están parados en fila: así
 * entran por la derecha y salen por la izquierda. El video arranca y termina sin nadie en cuadro.
 */

interface DesfileOptions {
  bpm: number;
  fps: number;
  /** Cuánto tarda en pasar cada raro (segundos entre uno y el siguiente). */
  secs: number;
  /** Resolución interna (la de "la Play") y por cuánto se agranda. */
  width: number;
  height: number;
  scale: number;
  texto: 'frase' | 'nombre' | 'nada';
  formato: 'mov' | 'mp4';
}

/** Distancia entre un raro y el siguiente en la fila (metros): que los globitos no se pisen. */
const GAP = 1.6;
/** Cuántos raros puede haber en cuadro a la vez, como mucho (en vertical entra uno; acostado, unos cuatro). */
const MAX_SHOWN = 10;
/** Alto del cuadro en la fila (metros): del piso al globito de un gigante. */
const VIEW_H = 2.95;
const CHROMA = '#00b140';

class Desfile {
  readonly canvas = document.createElement('canvas');
  private renderer: THREE.WebGLRenderer;
  private small = document.createElement('canvas');
  private ctx = this.small.getContext('2d', { willReadFrequently: true })!;
  private out = this.canvas.getContext('2d')!;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(22, 1, 0.1, 80);
  private crowd = new Crowd(MAX_SHOWN);
  private shown: number[] = [];
  private head = new THREE.Vector3();
  private flat = document.createElement('canvas');

  constructor(private o: DesfileOptions, private raros: ExportRaro[]) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);
    this.scene.add(this.crowd.group);
    this.setOptions(o);
  }

  setOptions(o: DesfileOptions) {
    this.o = o;
    this.renderer.setSize(o.width, o.height, false);
    this.small.width = o.width;
    this.small.height = o.height;
    this.canvas.width = o.width * o.scale;
    this.canvas.height = o.height * o.scale;
    this.out.imageSmoothingEnabled = false;
    this.camera.aspect = o.width / o.height;
    this.camera.updateProjectionMatrix();
  }

  setRaros(list: ExportRaro[]) {
    this.raros = list;
    this.shown = [];
  }

  /** Medio ancho del cuadro en la fila (metros). */
  private get halfW() {
    return (VIEW_H / 2) * this.camera.aspect;
  }
  /** Por dónde arranca y termina la cámara: el primero entra por la derecha y el último sale por la izquierda. */
  private get span() {
    const pad = this.halfW + GAP * 0.6;
    return { from: -pad, to: (this.raros.length - 1) * GAP + pad };
  }
  get frames() {
    const { from, to } = this.span;
    return Math.max(1, Math.ceil(((to - from) / (GAP / this.o.secs)) * this.o.fps));
  }

  /** Dibuja el cuadro `f` del desfile. */
  draw(f: number) {
    const { o } = this;
    const t = f / o.fps;
    const camX = this.span.from + (t * GAP) / o.secs;
    // Los que están en cuadro (o por entrar): si cambiaron, se rearma la fila.
    const reach = this.halfW + GAP;
    const want: number[] = [];
    for (let i = Math.max(0, Math.floor((camX - reach) / GAP)); i < this.raros.length && i * GAP < camX + reach && want.length < MAX_SHOWN; i++) want.push(i);
    if (want.join() !== this.shown.join()) {
      this.shown = want;
      this.crowd.setDancers(want.map((i) => ({ id: this.raros[i].id, name: this.raros[i].name, look: this.raros[i].look })));
      // De frente, sin variaciones de altura (cada uno con la suya de verdad) y en su lugar de la fila.
      want.forEach((i, k) => this.crowd.pin(k, i * GAP, 0));
    }
    // Luz pareja de frente, sin niebla (la misma del exportador de a uno).
    psxUniforms.uFog.value = 0;
    psxUniforms.uAmbient.value.setRGB(0.5, 0.5, 0.56);
    psxUniforms.uLightColor.value.setRGB(0.6, 0.58, 0.54);
    psxUniforms.uLightDir.value.set(0.35, 0.7, 0.9).normalize();
    psxUniforms.uResolution.value.set(o.width, o.height);
    // Un poco de aire abajo de los pies (los de plataforma, el salto).
    const camY = VIEW_H / 2 - 0.22;
    this.camera.position.set(camX, camY, VIEW_H / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    this.camera.lookAt(camX, camY, 0);
    this.crowd.update((t * o.bpm) / 60, 1, t);
    this.renderer.render(this.scene, this.camera);

    const { width: w, height: h } = o;
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.drawImage(this.renderer.domElement, 0, 0);
    if (o.texto !== 'nada') {
      const unit = 8 * Math.max(1, Math.floor(Math.min(w, h) / 270));
      want.forEach((i, k) => {
        if (!this.crowd.headTop(k, this.head)) return;
        this.head.project(this.camera);
        const hx = Math.round((this.head.x * 0.5 + 0.5) * w), hy = Math.round((-this.head.y * 0.5 + 0.5) * h);
        // Cada globito queda en su franja de la fila: no se va encima del de al lado.
        const lane = (GAP / (this.halfW * 2)) * w;
        drawBubble(this.ctx, this.raros[i].name, o.texto === 'frase' ? this.raros[i].phrase : '', hx, hy, unit, hx - lane / 2, hx + lane / 2);
      });
    }
    psxLook(this.ctx, w, h);
    this.out.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.out.drawImage(this.small, 0, 0, this.canvas.width, this.canvas.height);
    return this.canvas;
  }

  png(): Promise<Blob> {
    return new Promise((resolve, reject) => this.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo armar el PNG.'))), 'image/png'));
  }

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

const pad = (n: number, len: number) => String(n).padStart(len, '0');
const download = (blob: Blob, name: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
};

/** Panel del desfile en el admin. `load` trae todos los personajes, del más viejo al más nuevo. */
export function mountDesfile(root: HTMLElement, load: () => Promise<ExportRaro[]>) {
  const o: DesfileOptions = { bpm: 128, fps: 30, secs: 1.5, width: 480, height: 270, scale: 4, texto: 'frase', formato: 'mov' };
  let raros: ExportRaro[] = [];
  let desfile: Desfile | null = null;
  let busy = false, cancel = false, from = 1, to = 1, frame = 0;

  const status = el('p', 'aviso', 'CARGANDO PERSONAJES...');
  status.setAttribute('role', 'status');
  const marco = el('div', 'export-vista desfile-vista');
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
      const v = Math.min(Number(i.max) || max, Math.max(min, Math.round(Number(i.value) || value)));
      i.value = String(v);
      onChange(v);
      refresh();
    });
    return { field: el('label', 'campo', [el('span', '', label), i]), input: i };
  };
  const desde = number('DESDE EL N°', 1, 1, 1, (v) => (from = v));
  const hasta = number('HASTA EL N°', 1, 1, 1, (v) => (to = v));
  const sizes: [string, string][] = [['480x270x4', '1920×1080 (ACOSTADO)'], ['320x180x4', '1280×720 (ACOSTADO, MAS LIVIANO)'], ['270x480x4', '1080×1920 (PARADO, PARA HISTORIAS)']];
  const opciones = el('div', 'export-opciones', [
    select('FORMATO', [['mov', 'VIDEO MOV TRANSPARENTE'], ...(canMp4() ? ([['mp4', 'VIDEO MP4 CON FONDO VERDE']] as ['mp4', string][]) : [])], o.formato, (v) => (o.formato = v)),
    select('TEXTO', [['frase', 'NOMBRE Y GLOBITO CON SU FRASE'], ['nombre', 'SOLO EL NOMBRE'], ['nada', 'NADA']], o.texto, (v) => (o.texto = v)),
    select('CADA RARO TARDA', [[1, '1 SEGUNDO'], [1.5, '1,5 SEGUNDOS'], [2, '2 SEGUNDOS'], [3, '3 SEGUNDOS']], o.secs, (v) => (o.secs = v)),
    select('TAMAÑO', sizes, sizes[0][0], (v) => ([o.width, o.height, o.scale] = v.split('x').map(Number))),
    select('CUADROS POR SEGUNDO', [[24, '24'], [25, '25'], [30, '30']], o.fps, (v) => (o.fps = v)),
    number('BPM', o.bpm, 60, 200, (v) => (o.bpm = v)).field,
    desde.field,
    hasta.field,
  ]);

  const refresh = () => {
    if (!desfile) return;
    desfile.setOptions(o);
    desfile.setRaros(raros.slice(from - 1, to));
    frame = 0;
    const frames = desfile.frames, secs = frames / o.fps;
    const n = Math.max(0, Math.min(to, raros.length) - from + 1);
    // Medido: un cuadro de 1280×720 con tres raros pesa unos 41 KB (crece con la superficie).
    const peso = o.formato === 'mov' ? ` · PESA UNOS ${Math.max(1, Math.round((frames * 41 * (o.width * o.height)) / (320 * 180) / 1024))} MB` : '';
    info.textContent = `${n} RAROS · ${Math.floor(secs / 60)}:${pad(Math.round(secs % 60), 2)} DE VIDEO · ${o.width * o.scale}×${o.height * o.scale} PX${peso}`;
  };

  const go = el('button', 'btn rojo', 'EXPORTAR DESFILE');
  go.type = 'button';
  const stop = el('button', 'btn', 'FRENAR');
  stop.type = 'button';
  stop.hidden = true;
  stop.addEventListener('click', () => (cancel = true));

  go.addEventListener('click', async () => {
    if (busy || !desfile) return;
    const list = raros.slice(from - 1, to);
    if (!list.length) return void (status.textContent = 'NO HAY PERSONAJES EN ESE RANGO.');
    busy = true;
    cancel = false;
    go.hidden = true;
    stop.hidden = false;
    status.className = 'aviso';
    status.textContent = 'ARRANCANDO...';
    desfile.setRaros(list);
    const frames = desfile.frames, w = o.width * o.scale, h = o.height * o.scale;
    const name = `desfile_raros_${pad(from, 4)}-${pad(from + list.length - 1, 4)}`;
    const label = (f: number) => (status.textContent = `ARMANDO EL DESFILE: CUADRO ${f + 1} DE ${frames} (${Math.round(((f + 1) / frames) * 100)}%)`);
    try {
      if (o.formato === 'mov') {
        // Cada cuadro queda como Blob (el navegador lo puede guardar en disco): un video de
        // varios minutos no tiene que estar entero en memoria.
        const pngs: Blob[] = [];
        for (let f = 0; f < frames && !cancel; f++) {
          desfile.draw(f);
          pngs.push(await desfile.png());
          label(f);
        }
        if (!cancel) download(buildMov(pngs, w, h, o.fps), `${name}.mov`);
      } else {
        const video = await buildMp4(
          (f) => {
            if (cancel) throw new Error('FRENADO');
            desfile!.draw(f);
            label(f);
            return desfile!.onColor(CHROMA);
          },
          frames,
          w,
          h,
          o.fps,
        );
        download(video, `${name}.mp4`);
      }
      sfx.start();
      status.className = 'ok';
      status.textContent = cancel ? 'FRENADO.' : 'LISTO: FIJATE EN LAS DESCARGAS.';
    } catch (e) {
      status.className = cancel ? 'aviso' : 'error';
      status.textContent = cancel ? 'FRENADO.' : `SE CORTO: ${(e as Error).message}`;
    }
    busy = false;
    go.hidden = false;
    stop.hidden = true;
    refresh();
  });

  root.append(
    el('p', '', 'TODOS LOS RAROS PASANDO DE DERECHA A IZQUIERDA, UNO ATRAS DEL OTRO, BAILANDO, CON SU ROPA, SU ALTURA, SU NOMBRE Y SU FRASE. UN SOLO VIDEO CON FONDO TRANSPARENTE.'),
    marco,
    opciones,
    info,
    el('div', 'fila', [go, stop]),
    status,
  );

  void Promise.all([load(), fontsReady()]).then(
    ([list]) => {
      raros = list;
      if (!raros.length) return void (status.textContent = 'TODAVIA NO HAY NADIE EN LA PISTA.');
      desfile = new Desfile(o, raros);
      if (import.meta.env.DEV) (window as unknown as { drDesfile: unknown }).drDesfile = desfile;
      marco.append(desfile.canvas);
      from = 1;
      to = raros.length;
      desde.input.max = hasta.input.max = hasta.input.value = String(raros.length);
      refresh();
      status.textContent = `${raros.length} PERSONAJES LISTOS PARA EL DESFILE.`;
      // Vista previa: el desfile pasando, a velocidad real.
      let last = performance.now();
      const tick = (now: number) => {
        requestAnimationFrame(tick);
        if (busy || !desfile || now - last < 1000 / o.fps) return;
        last = now;
        frame = (frame + 1) % desfile.frames;
        desfile.draw(frame);
      };
      requestAnimationFrame(tick);
    },
    (e: Error) => {
      status.className = 'error';
      status.textContent = e.message;
    },
  );
}
