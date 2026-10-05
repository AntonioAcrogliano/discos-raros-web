import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import type { PSXStage } from '../../style-kit';
import { CLUB } from './club';

/**
 * La tele del club: el player de YouTube (IFrame API) ubicado en 3D con CSS3DRenderer, encima
 * del canvas. YouTube exige que el player se vea y no deja leer el audio, así que la tele es
 * el player de verdad: se puede pausar, adelantar o cambiar el volumen desde ahí.
 */

interface YTPlayer {
  loadVideoById(id: string): void;
  playVideo(): void;
  getPlayerState(): number;
}
interface YTNamespace {
  Player: new (el: HTMLElement, o: Record<string, unknown>) => YTPlayer;
}

let apiPromise: Promise<YTNamespace> | null = null;
function loadApi(): Promise<YTNamespace> {
  apiPromise ??= new Promise((resolve, reject) => {
    const w = window as unknown as { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };
    w.onYouTubeIframeAPIReady = () => resolve(w.YT!);
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => reject(new Error('No cargó YouTube'));
    document.head.append(s);
  });
  return apiPromise;
}

/** Resolución del player en píxeles CSS (16:9); se escala al tamaño de la tele en la escena. */
const PX_W = 640, PX_H = 360;

export class Tele {
  /** true mientras el video está sonando. */
  playing = false;
  videoId: string | null = null;
  onEnded: (() => void) | null = null;

  private css = new CSS3DRenderer();
  private holder = document.createElement('div');
  private player: YTPlayer | null = null;
  private pending: string | null = null;

  constructor(private stage: PSXStage) {
    const dom = this.css.domElement;
    dom.className = 'tele-layer';
    Object.assign(dom.style, { position: 'fixed', inset: '0', zIndex: '5', pointerEvents: 'none' });
    document.body.append(dom);

    this.holder.style.cssText = `width:${PX_W}px;height:${PX_H}px;background:#000;pointer-events:auto;`;
    const { tele } = CLUB;
    const obj = new CSS3DObject(this.holder);
    obj.position.set(tele.x, tele.y, tele.z + 0.06);
    obj.scale.setScalar(tele.w / PX_W);
    obj.visible = false;
    this.object = obj;
    this.setSize(window.innerWidth, window.innerHeight);
  }

  readonly object: CSS3DObject;

  setSize(w: number, h: number) {
    this.css.setSize(w, h);
  }

  /** Llamar después de cada frame: acomoda el iframe a donde quedó la cámara. */
  render() {
    if (this.object.visible) this.css.render(this.stage.scene, this.stage.camera);
  }

  /** Pone un video. Tiene que llamarse después de un click (PRESS START) para que suene. */
  async play(videoId: string) {
    this.videoId = videoId;
    this.object.visible = true;
    if (this.player) return this.player.loadVideoById(videoId);
    if (this.pending) return void (this.pending = videoId);
    this.pending = videoId;
    let YT: YTNamespace;
    try {
      YT = await loadApi();
    } catch {
      // Sin YouTube (bloqueador, sin conexión): la tele queda con el logo y la pista baila igual.
      this.object.visible = false;
      this.pending = null;
      return;
    }
    const target = document.createElement('div');
    this.holder.append(target);
    new YT.Player(target, {
      width: String(PX_W),
      height: String(PX_H),
      videoId: this.pending,
      playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
      events: {
        onReady: (e: { target: YTPlayer }) => {
          this.player = e.target;
          if (this.pending && this.pending !== videoId) e.target.loadVideoById(this.pending);
          else e.target.playVideo();
          this.pending = null;
        },
        onStateChange: (e: { data: number }) => {
          // 1 = reproduciendo, 0 = terminó.
          this.playing = e.data === 1;
          if (e.data === 0) this.onEnded?.();
        },
      },
    });
  }
}
