import * as THREE from 'three';
import { psxUniforms } from './psxMaterial';

export const RESOLUTIONS = {
  '256×224': [256, 224],
  '320×240': [320, 240],
  '480×360': [480, 360],
  '640×480': [640, 480],
} as const;
export type ResolutionKey = keyof typeof RESOLUTIONS;

export interface PostSettings {
  resolution: ResolutionKey;
  /** fill: lado corto fijo, el otro según la ventana. exact: resolución exacta con bandas negras. */
  aspect: 'fill' | 'exact';
  colorDepth: boolean;
  dither: boolean;
}

/** Filtros de época (todos 0 = apagado). */
export interface FilterSettings {
  /** VHS: ruido, líneas de tracking, color corrido y un poco de desaturación. */
  vhs: number;
  /** CRT: curvatura, líneas de barrido, máscara RGB y viñeta. */
  crt: number;
  /** Aberración cromática (canales separados). */
  chroma: number;
  /** Cuánto se intensifican los filtros con cada beat. */
  react: number;
}

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Salida: filtros de época + 15 bits con dithering Bayer 4×4 (en píxeles de la
// resolución interna, no de la pantalla).
const FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uDepth;
uniform float uDither;
uniform float uTime;
uniform float uVhs;
uniform float uCrt;
uniform float uChroma;
uniform float uPulse;
uniform sampler2D tOverlay;
uniform float uOverlayOn;
varying vec2 vUv;

const float BAYER[16] = float[16](
   0.0,  8.0,  2.0, 10.0,
  12.0,  4.0, 14.0,  6.0,
   3.0, 11.0,  1.0,  9.0,
  15.0,  7.0, 13.0,  5.0);

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = vUv;

  // CRT: pantalla curva.
  if (uCrt > 0.0) {
    vec2 c = uv * 2.0 - 1.0;
    c *= 1.0 + dot(c, c) * 0.08 * uCrt;
    uv = c * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  }

  // Textos (títulos, HUD): se leen en la pantalla ya curvada, sin el corrimiento del VHS.
  vec2 screenUv = uv;

  // VHS: filas que se corren y una banda de tracking que baja.
  float vhs = uVhs * (1.0 + uPulse);
  if (vhs > 0.0) {
    float row = floor(uv.y * uRes.y);
    float t = floor(uTime * 24.0);
    uv.x += (hash(vec2(row, t)) - 0.5) * 0.004 * vhs;
    float band = fract(uTime * 0.13);
    float d = abs(uv.y - (1.0 - band));
    uv.x += smoothstep(0.03, 0.0, d) * 0.02 * vhs * (hash(vec2(row, t + 3.0)) - 0.3);
  }

  // Aberración cromática (y el color corrido del VHS).
  float ca = (uChroma * 0.006 + vhs * 0.002) * (1.0 + 2.0 * uPulse);
  vec2 dir = vec2(1.0, 0.0);
  vec4 base = texture2D(tDiffuse, uv);
  vec3 col = vec3(
    texture2D(tDiffuse, uv + dir * ca).r,
    base.g,
    texture2D(tDiffuse, uv - dir * ca).b);
  if (vhs > 0.0) {
    // Crominancia borroneada hacia la izquierda, luma nítida.
    vec3 smear = (texture2D(tDiffuse, uv - vec2(1.5 / uRes.x, 0.0)).rgb + texture2D(tDiffuse, uv - vec2(3.0 / uRes.x, 0.0)).rgb) * 0.5;
    float l = dot(col, vec3(0.3, 0.59, 0.11));
    vec3 chroma = mix(col, smear, 0.5 * vhs) - dot(mix(col, smear, 0.5 * vhs), vec3(0.3, 0.59, 0.11));
    col = l + chroma * (1.0 - 0.25 * vhs);
    col += (hash(uv * uRes + floor(uTime * 30.0)) - 0.5) * 0.12 * vhs;
    col *= vec3(1.0, 0.97, 1.02);
  }

  vec4 c = vec4(clamp(col, 0.0, 1.0), 1.0);
  if (uOverlayOn > 0.5) {
    vec4 ov = texture2D(tOverlay, screenUv);
    c.rgb = mix(c.rgb, ov.rgb, ov.a);
  }
  ivec2 p = ivec2(floor(uv * uRes));
  if (uDepth > 0.5) {
    float t = uDither > 0.5 ? (BAYER[(p.x & 3) + (p.y & 3) * 4] + 0.5) / 16.0 : 0.5;
    c.rgb = floor(c.rgb * 31.0 + t) / 31.0;
  }

  // CRT: líneas de barrido por fila interna, máscara RGB y viñeta.
  if (uCrt > 0.0) {
    float f = fract(uv.y * uRes.y);
    c.rgb *= 1.0 - uCrt * 0.35 * (1.0 - sin(f * 3.14159));
    int m = int(mod(gl_FragCoord.x, 3.0));
    vec3 mask = m == 0 ? vec3(1.0, 0.85, 0.85) : m == 1 ? vec3(0.85, 1.0, 0.85) : vec3(0.85, 0.85, 1.0);
    c.rgb *= mix(vec3(1.0), mask, uCrt * 0.6);
    vec2 v = vUv * 2.0 - 1.0;
    c.rgb *= 1.0 - uCrt * 0.35 * dot(v, v) * 0.5;
    c.rgb *= 1.0 + uCrt * 0.15;
  }
  gl_FragColor = c;
}
`;

/** Renderiza la escena a baja resolución, aplica filtros y la escala a pantalla con NearestFilter. */
export class PSXPost {
  readonly settings: PostSettings = {
    resolution: '320×240',
    aspect: 'fill',
    colorDepth: true,
    dither: true,
  };
  readonly filters: FilterSettings = { vhs: 0, crt: 0, chroma: 0, react: 0.5 };
  /** Golpe del beat en este frame (0–1). */
  pulse = 0;
  /** Tiempo para el ruido del VHS. */
  time = 0;
  /** Color de fondo con el que se limpia el render target. */
  clearColor = new THREE.Color(0, 0, 0);
  /** Capa de textos (títulos, HUD) del tamaño de la resolución interna; null = nada. */
  overlay: THREE.Texture | null = null;

  readonly target: THREE.WebGLRenderTarget;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  private viewW = 1;
  private viewH = 1;
  private rect = { x: 0, y: 0, w: 1, h: 1 };

  constructor(private renderer: THREE.WebGLRenderer) {
    this.target = new THREE.WebGLRenderTarget(320, 240, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
    });
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        tDiffuse: { value: this.target.texture },
        uRes: { value: new THREE.Vector2(320, 240) },
        uDepth: { value: 1 },
        uDither: { value: 1 },
        uTime: { value: 0 },
        uVhs: { value: 0 },
        uCrt: { value: 0 },
        uChroma: { value: 0 },
        uPulse: { value: 0 },
        tOverlay: { value: null },
        uOverlayOn: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  get internalWidth() {
    return this.target.width;
  }
  get internalHeight() {
    return this.target.height;
  }

  /** Tamaño de la salida (canvas). Recalcula la resolución interna. */
  setSize(viewW: number, viewH: number) {
    this.viewW = viewW;
    this.viewH = viewH;
    const [bw, bh] = RESOLUTIONS[this.settings.resolution];
    let w: number = bw;
    let h: number = bh;
    if (this.settings.aspect === 'fill') {
      // El lado corto mantiene la resolución de la consola (240 px en 320×240).
      if (viewW >= viewH) w = Math.max(1, Math.round((bh * viewW) / viewH));
      else {
        w = bh;
        h = Math.max(1, Math.round((bh * viewH) / viewW));
      }
      this.rect = { x: 0, y: 0, w: viewW, h: viewH };
    } else {
      const s = Math.min(viewW / bw, viewH / bh);
      const rw = Math.round(bw * s);
      const rh = Math.round(bh * s);
      this.rect = { x: Math.floor((viewW - rw) / 2), y: Math.floor((viewH - rh) / 2), w: rw, h: rh };
    }
    this.target.setSize(w, h);
    this.material.uniforms.uRes.value.set(w, h);
    psxUniforms.uResolution.value.set(w, h);
  }

  /** Reaplica la configuración actual (cambio de resolución o aspecto). */
  refresh() {
    this.setSize(this.viewW, this.viewH);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const r = this.renderer;
    const f = this.filters;
    const aspect = this.target.width / this.target.height;
    if (camera.aspect !== aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
    const u = this.material.uniforms;
    u.uDepth.value = this.settings.colorDepth ? 1 : 0;
    u.uDither.value = this.settings.dither ? 1 : 0;
    u.uTime.value = this.time;
    u.uVhs.value = f.vhs;
    u.uCrt.value = f.crt;
    u.uChroma.value = f.chroma;
    u.uPulse.value = this.pulse * f.react;
    u.tOverlay.value = this.overlay;
    u.uOverlayOn.value = this.overlay ? 1 : 0;

    r.setRenderTarget(this.target);
    r.setClearColor(this.clearColor, 1);
    r.render(scene, camera);

    r.setRenderTarget(null);
    r.setClearColor(0x000000, 1);
    r.clear();
    r.setViewport(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
    r.render(this.quadScene, this.quadCam);
    r.setViewport(0, 0, this.viewW, this.viewH);
  }
}
