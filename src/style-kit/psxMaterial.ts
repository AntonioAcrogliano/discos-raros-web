import * as THREE from 'three';

// Sin gestión de color: los hex se usan tal cual, como en la consola original
// (no hay espacio lineal ni conversión sRGB).
THREE.ColorManagement.enabled = false;

/**
 * Uniforms compartidos por todos los materiales PSX. Cada material referencia
 * estos mismos objetos, así que cambiar un valor acá afecta a toda la escena.
 */
export const psxUniforms = {
  uResolution: { value: new THREE.Vector2(320, 240) },
  uSnap: { value: 1 },
  uJitter: { value: 1 },
  uAffine: { value: 1 },
  uFlat: { value: 0 },
  uLightDir: { value: new THREE.Vector3(0.45, 0.8, 0.6).normalize() },
  // Ambiente + directional ≈ 1 de frente: las texturas no se queman.
  uLightColor: { value: new THREE.Color(0.7, 0.68, 0.64) },
  uAmbient: { value: new THREE.Color(0.36, 0.36, 0.42) },
  uFog: { value: 0 },
  uFogColor: { value: new THREE.Color(0, 0, 0) },
  uFogNear: { value: 3 },
  uFogFar: { value: 10 },
  uTime: { value: 0 },
};

const VERTEX = /* glsl */ `
uniform vec2 uResolution;
uniform float uSnap;
uniform float uJitter;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uAmbient;
uniform float uLit;
uniform float uGlitch;
uniform float uTime;

float hash(float n) { return fract(sin(n) * 43758.5453); }

varying vec2 vUv;
varying vec3 vAffine;
varying vec3 vLight;
varying vec3 vTint;
varying vec3 vWorldPos;
varying float vFogDepth;

void main() {
  vUv = uv;
  // Con InstancedMesh (la pista llena de gente) cada instancia trae su matriz y su color.
  mat4 model = modelMatrix;
  #ifdef USE_INSTANCING
    model = modelMatrix * instanceMatrix;
  #endif
  vTint = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #endif

  vec4 worldPos = model * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  vec4 mvPos = viewMatrix * worldPos;
  vFogDepth = -mvPos.z;
  vec4 clip = projectionMatrix * mvPos;

  // Glitch: franjas horizontales que se desplazan.
  if (uGlitch > 0.0) {
    float r = hash(floor(worldPos.y * 16.0) + floor(uTime * 30.0) * 7.13);
    clip.x += (r - 0.5) * uGlitch * 0.4 * clip.w;
    clip.y += (hash(r * 91.7) - 0.5) * uGlitch * 0.05 * clip.w;
  }

  // Vertex snapping: redondear a la grilla de píxeles de la resolución interna.
  // uJitter = 1 -> grilla de 1 píxel; valores mayores agrandan la grilla.
  if (uSnap > 0.5 && uJitter > 0.0 && clip.w > 0.0) {
    vec2 grid = uResolution * 0.5 / uJitter;
    clip.xy = floor(clip.xy / clip.w * grid + 0.5) / grid * clip.w;
  }
  gl_Position = clip;

  // Affine mapping: UV * w acá, / w en el fragment -> interpolación lineal en pantalla.
  vAffine = vec3(uv * clip.w, clip.w);

  // Gouraud: iluminación por vértice (una direccional + ambiente).
  vec3 n = normalize(mat3(model) * normal);
  float d = max(dot(n, normalize(uLightDir)), 0.0);
  vLight = mix(vec3(1.0), uAmbient + uLightColor * d, uLit);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform sampler2D map;
uniform float uHasMap;
uniform float uDecal;
uniform float uAffine;
uniform float uFlat;
uniform float uLit;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uAmbient;
uniform float uFog;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uOpacity;

varying vec2 vUv;
varying vec3 vAffine;
varying vec3 vLight;
varying vec3 vTint;
varying vec3 vWorldPos;
varying float vFogDepth;

void main() {
  vec2 uv = mix(vUv, vAffine.xy / vAffine.z, uAffine);
  vec4 base = vec4(uColor * vTint, 1.0);
  if (uHasMap > 0.5) {
    vec4 tex = texture2D(map, uv);
    // Detalle: los píxeles opacos son colores fijos (suela blanca, lente negro) y los
    // transparentes oscurecen el color de la pieza (mechones, pliegues).
    if (uDecal > 1.5) base.rgb = tex.a > 0.5 ? tex.rgb : base.rgb * tex.rgb;
    // Estampa: la textura se pega arriba del color donde es opaca (no se tiñe ni recorta).
    else if (uDecal > 0.5) base.rgb = mix(base.rgb, tex.rgb, step(0.5, tex.a));
    else base *= tex;
  }
  if (base.a < 0.5) discard;

  vec3 light = vLight;
  if (uFlat > 0.5 && uLit > 0.5) {
    // Flat: normal de la cara a partir de las derivadas de la posición.
    vec3 n = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
    light = uAmbient + uLightColor * max(dot(n, normalize(uLightDir)), 0.0);
  }

  vec3 col = base.rgb * light;
  if (uFog > 0.5) col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, vFogDepth));
  gl_FragColor = vec4(col, uOpacity);
}
`;

export interface PSXMaterialOptions {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  /** La textura es una estampa sobre el color (remeras): donde es transparente se ve el color. */
  decal?: boolean;
  /** La textura es una paleta de detalle (ver makeDetailTexture): tonos del color y colores fijos. */
  detail?: boolean;
  /** false = sin iluminación (sombras falsas, fondos, neones). */
  lit?: boolean;
  side?: THREE.Side;
  /** Uniform de glitch compartido por todas las mallas de un personaje. */
  glitch?: { value: number };
  /** < 1 = material transparente (sombra falsa, haces de luz). */
  opacity?: number;
}

export type PSXMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uColor: { value: THREE.Color };
    map: { value: THREE.Texture | null };
    uHasMap: { value: number };
    uOpacity: { value: number };
  };
};

export function makePSXMaterial(opts: PSXMaterialOptions = {}): PSXMaterial {
  const transparent = opts.opacity !== undefined && opts.opacity < 1;
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: opts.side ?? THREE.FrontSide,
    transparent,
    depthWrite: !transparent,
    uniforms: {
      ...psxUniforms,
      uColor: { value: new THREE.Color(opts.color ?? 0xffffff) },
      map: { value: opts.map ?? null },
      uHasMap: { value: opts.map ? 1 : 0 },
      uDecal: { value: opts.detail ? 2 : opts.decal ? 1 : 0 },
      uLit: { value: opts.lit === false ? 0 : 1 },
      uGlitch: opts.glitch ?? { value: 0 },
      uOpacity: { value: opts.opacity ?? 1 },
    },
  });
  return mat as PSXMaterial;
}

export function setPSXMap(mat: PSXMaterial, map: THREE.Texture | null) {
  mat.uniforms.map.value = map;
  mat.uniforms.uHasMap.value = map ? 1 : 0;
}
