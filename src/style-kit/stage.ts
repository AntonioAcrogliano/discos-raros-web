import * as THREE from 'three';
import { psxUniforms } from './psxMaterial';
import { PSXPost } from './psxPost';

export type OverlayDraw = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;

/**
 * El "televisor": renderer + post PSX + capa de textos + loop. Cada sección del sitio arma su
 * escena y se la pasa a un PSXStage; ninguna crea su propio renderer ni su propio look.
 */
export class PSXStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly post: PSXPost;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 60);
  /** Se llama cada frame antes de renderizar (t y dt en segundos). */
  onUpdate: ((t: number, dt: number) => void) | null = null;
  /** Dibuja los textos (títulos, HUD) a la resolución interna; null = sin capa de textos. */
  onOverlay: OverlayDraw | null = null;
  /** Después de dibujar el frame (para capas que siguen a la cámara, como la tele de YouTube). */
  onAfterRender: (() => void) | null = null;
  /** Cambió el tamaño de la ventana (ancho y alto en píxeles CSS). */
  onResize: ((w: number, h: number) => void) | null = null;

  /**
   * La capa de textos es un canvas aparte, a la resolución interna y agrandado sin suavizar.
   * Va por encima de todo lo que no sea interfaz: así las barras de vida y los carteles nunca
   * quedan tapados.
   */
  readonly overlayCanvas = document.createElement('canvas');
  private overlayCtx = this.overlayCanvas.getContext('2d', { willReadFrequently: true })!;
  private overlayDirty = false;
  private last = 0;
  private time = 0;
  private running = false;

  constructor(readonly canvas: HTMLCanvasElement) {
    // Con transparencia: la tele de YouTube va DETRÁS del canvas y se ve por un agujero (ver tele.ts).
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
    // La imagen se arma a baja resolución y se agranda: no hace falta más que 1 píxel por píxel CSS.
    this.renderer.setPixelRatio(1);
    this.post = new PSXPost(this.renderer);
    this.overlayCanvas.className = 'overlay-layer';
    canvas.after(this.overlayCanvas);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    // Con los juegos en un celu parado, la imagen se dibuja acostada y se gira por CSS (`html.acostado`).
    const turned = document.documentElement.classList.contains('acostado');
    const w = Math.max(1, turned ? window.innerHeight : window.innerWidth);
    const h = Math.max(1, turned ? window.innerWidth : window.innerHeight);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h);
    this.overlayCanvas.width = this.post.internalWidth;
    this.overlayCanvas.height = this.post.internalHeight;
    this.overlayCtx.imageSmoothingEnabled = false;
    this.onResize?.(w, h);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.renderer.setAnimationLoop((now) => this.frame(now));
  }

  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  private frame(now: number) {
    // Si la pestaña estuvo en segundo plano, no pegar un salto.
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    psxUniforms.uTime.value = this.time;
    this.post.time = this.time;
    this.onUpdate?.(this.time, dt);

    const { width, height } = this.overlayCanvas;
    if (this.onOverlay || this.overlayDirty) this.overlayCtx.clearRect(0, 0, width, height);
    this.overlayDirty = false;
    if (this.onOverlay) {
      this.onOverlay(this.overlayCtx, width, height, this.time);
      harden(this.overlayCtx, width, height);
      this.overlayDirty = true;
    }
    this.post.render(this.scene, this.camera);
    this.onAfterRender?.();
  }
}

/** Cada píxel del texto queda opaco o transparente (sin bordes suavizados), como en la PS1. */
function harden(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 128 ? 255 : 0;
  ctx.putImageData(img, 0, 0);
}
