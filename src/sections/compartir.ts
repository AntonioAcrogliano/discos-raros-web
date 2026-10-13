import * as THREE from 'three';
import type { Raro } from '../../shared/look';
import { Crowd } from '../scenes/boiler/crowd';
import { DR, DR_CYCLE, FONT, fitSize, makeCanvas, makeLogoCanvas, outlined, psxUniforms, sfx } from '../style-kit';
import { el, sinTildes } from '../ui/dom';
import { go, openPanel } from '../ui/shell';

/**
 * Compartir tu raro: arma una imagen vertical (1080×1920, la medida de una historia) con el
 * personaje bailando en la pista, su nombre y la dirección del sitio. En el celular se manda
 * con el menú de compartir del teléfono; en la compu se baja.
 * Se dibuja a 270×480 y se agranda por 4 sin suavizar, con el mismo color de 15 bits y tramado
 * que el resto del sitio. Lo importante queda lejos de los bordes de arriba y de abajo, que es
 * donde Instagram pone sus botones.
 */

const W = 270, H = 480, SCALE = 4;
/** El cuadro del personaje (cuadrado) y dónde va. */
const FIG = 300, FIG_Y = 82;
/** Dónde el piso se junta con la pared. */
const HORIZON = 300;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const URL_TEXT = 'DISCOSRAROS.COM.AR';

/** El raro solo, bailando, sobre fondo transparente (con el mismo dibujo que en la pista). */
function renderRaro(raro: Raro): HTMLCanvasElement {
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(FIG, FIG, false);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const crowd = new Crowd(1);
  scene.add(crowd.group);
  crowd.setSolo(true);
  crowd.setDancers([{ id: 'foto', name: raro.name, look: raro.look }]);
  crowd.pin(0, 0, 0);
  crowd.spin = 0.3;
  crowd.update(2.5, 1, 0);
  // El cuadro va de los pies a un poco más arriba de la cabeza, sea petiso o gigante.
  const s = crowd.scaleOf(0);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  camera.position.set(0, 1.1 * s, 4.4 * s);
  camera.lookAt(0, 1.1 * s, 0);

  // La luz y la niebla son de todo el sitio: se prestan para la foto y se devuelven como estaban.
  const u = psxUniforms;
  const was = { fog: u.uFog.value, ambient: u.uAmbient.value.clone(), key: u.uLightColor.value.clone(), dir: u.uLightDir.value.clone(), res: u.uResolution.value.clone() };
  u.uFog.value = 0;
  u.uAmbient.value.setRGB(0.5, 0.5, 0.56);
  u.uLightColor.value.setRGB(0.6, 0.58, 0.54);
  u.uLightDir.value.set(0.35, 0.7, 0.9).normalize();
  u.uResolution.value.set(FIG, FIG);
  renderer.render(scene, camera);
  u.uFog.value = was.fog;
  u.uAmbient.value.copy(was.ambient);
  u.uLightColor.value.copy(was.key);
  u.uLightDir.value.copy(was.dir);
  u.uResolution.value.copy(was.res);

  const { canvas, ctx } = makeCanvas(FIG, FIG);
  ctx.drawImage(renderer.domElement, 0, 0);
  renderer.dispose();
  renderer.forceContextLoss();
  return canvas;
}

/** El boliche de fondo, dibujado a mano: pared violeta, haces de colores y baldosas. */
function drawClub(ctx: CanvasRenderingContext2D, seed: number) {
  const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  ctx.fillStyle = '#1b1426';
  ctx.fillRect(0, 0, W, HORIZON);
  ctx.fillStyle = '#0c0812';
  for (let y = 0, row = 0; y < HORIZON; y += 12, row++) {
    ctx.fillRect(0, y, W, 1);
    for (let x = row % 2 ? 12 : 0; x < W; x += 24) ctx.fillRect(x, y, 1, 12);
  }
  // Baldosas en perspectiva: las filas se agrandan hacia adelante y todo fuga al centro.
  ctx.fillStyle = '#08060c';
  ctx.fillRect(0, HORIZON, W, H - HORIZON);
  const rows = [0, 10, 23, 40, 62, 91, 130, 180].map((y) => HORIZON + y);
  const at = (col: number, y: number) => W / 2 + (col - 4) * (16 + (y - HORIZON) * 0.42);
  for (let row = 0; row + 1 < rows.length; row++) {
    for (let col = -4; col < 12; col++) {
      const lit = r() < 0.36;
      ctx.fillStyle = DR_CYCLE[Math.floor(r() * DR_CYCLE.length)];
      ctx.globalAlpha = lit ? 0.85 : 0.12;
      const y0 = rows[row] + 1, y1 = rows[row + 1] - 1;
      ctx.beginPath();
      ctx.moveTo(at(col, y0) + 1, y0);
      ctx.lineTo(at(col + 1, y0) - 1, y0);
      ctx.lineTo(at(col + 1, y1) - 1, y1);
      ctx.lineTo(at(col, y1) + 1, y1);
      ctx.fill();
    }
  }
  // Haces de luz que bajan del techo.
  const beams: [number, number, string][] = [[20, 70, DR.rojo], [95, 30, DR.amarillo], [180, 240, DR.verdeClaro], [250, 190, DR.rosa]];
  ctx.globalAlpha = 0.2;
  for (const [top, floor, color] of beams) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(top - 2, 0);
    ctx.lineTo(top + 2, 0);
    ctx.lineTo(floor + 34, HORIZON + 60);
    ctx.lineTo(floor - 34, HORIZON + 60);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** La imagen entera, ya agrandada a 1080×1920. */
export async function makeShareImage(raro: Raro): Promise<HTMLCanvasElement> {
  const [logo, figure] = [await makeLogoCanvas(130), renderRaro(raro)];
  const { canvas: small, ctx } = makeCanvas(W, H);
  // El fondo cambia con el nombre: cada raro tiene sus baldosas.
  let seed = 7;
  for (const c of raro.name) seed = (seed * 31 + c.charCodeAt(0)) % 2147483646;
  drawClub(ctx, seed + 1);

  // El logo arriba, la sombra en el piso y el raro por delante de todo.
  ctx.drawImage(logo, Math.round((W - logo.width) / 2), 62);
  ctx.fillStyle = '#000';
  ctx.globalAlpha = 0.45;
  ctx.fillRect(W / 2 - 40, FIG_Y + FIG - 16, 80, 8);
  ctx.globalAlpha = 1;
  ctx.drawImage(figure, (W - FIG) / 2, FIG_Y);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Su frase, en un globito al lado de la cabeza (como cuando lo tocan en la pista).
  const says = sinTildes((raro.phrase ?? '').toUpperCase());
  if (says) {
    const unit = 8, lines: string[] = [];
    for (const word of says.split(' ')) {
      const last = lines[lines.length - 1];
      if (last !== undefined && last.length + 1 + word.length <= 12) lines[lines.length - 1] = `${last} ${word}`;
      else lines.push(word);
    }
    const bw = Math.max(...lines.map((l) => l.length)) * unit + 10, bh = lines.length * (unit + 3) + 7;
    const x = W - bw - 8, y = 150;
    ctx.fillStyle = DR.negro;
    ctx.fillRect(x - 2, y - 2, bw + 4, bh + 4);
    for (let k = 0; k < 6; k++) ctx.fillRect(x + 4 - k, y + bh + 2 + k, 9 - k, 1);
    ctx.fillStyle = DR.crema;
    ctx.fillRect(x, y, bw, bh);
    for (let k = 0; k < 4; k++) ctx.fillRect(x + 5 - k, y + bh + k, 6 - k, 1);
    ctx.fillStyle = DR.negro;
    ctx.font = `${unit}px ${FONT}`;
    lines.forEach((l, n) => ctx.fillText(l, x + bw / 2, y + 5 + unit / 2 + n * (unit + 3)));
  }
  const name = sinTildes(raro.name.toUpperCase());
  outlined(ctx, name, W / 2, 390, fitSize(name, 18, W), DR.amarillo, DR.rojo);
  outlined(ctx, 'ESTA BAILANDO EN LA PISTA', W / 2, 407, 7, DR.crema);
  outlined(ctx, URL_TEXT, W / 2, 420, 9, DR.rosa);

  // Como en la Play: color de 15 bits con tramado.
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let y = 0, i = 0; y < H; y++) {
    for (let x = 0; x < W; x++, i += 4) {
      const t = (BAYER[(x & 3) + (y & 3) * 4] + 0.5) / 16;
      for (let c = 0; c < 3; c++) d[i + c] = Math.round((Math.min(31, Math.floor((d[i + c] / 255) * 31 + t)) / 31) * 255);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const out = makeCanvas(W * SCALE, H * SCALE);
  out.ctx.drawImage(small, 0, 0, W * SCALE, H * SCALE);
  return out.canvas;
}

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo armar la imagen.'))), 'image/png'));

export async function openCompartir(raro: Raro | null) {
  // Sin raro no hay nada que compartir: primero hay que armarlo.
  if (!raro) return go('crear');
  const p = openPanel({ title: 'COMPARTI TU RARO', narrow: true, hints: [['ENTER', 'ELEGIR'], ['ESC', 'VOLVER']] });
  const status = el('p', 'aviso', 'REVELANDO LA FOTO...');
  status.setAttribute('role', 'status');
  p.body.append(status);

  let image: HTMLCanvasElement, file: File;
  try {
    image = await makeShareImage(raro);
    file = new File([await toBlob(image)], `discos-raros-${raro.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'raro'}.png`, { type: 'image/png' });
  } catch (e) {
    status.className = 'error';
    status.textContent = sinTildes(`NO SALIO LA FOTO. ${(e as Error).message}`.toUpperCase());
    return;
  }
  if (!p.body.isConnected) return;

  const link = location.origin + location.pathname;
  const text = `Estoy bailando en la pista de Discos Raros. Armá tu raro y vení: ${link}`;
  const say = (msg: string, cls = 'ok') => {
    status.className = cls;
    status.textContent = msg;
  };
  const button = (label: string, cls: string, run: () => void | Promise<void>) => {
    const b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('focus', () => sfx.move());
    b.addEventListener('click', () => {
      sfx.select();
      void run();
    });
    return b;
  };

  const download = () => {
    const a = el('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    say('LISTO. SUBILA A TUS HISTORIAS Y ARROBANOS: @DISCOSRAROS.ARG');
  };
  // El menú de compartir del teléfono (con la imagen adentro), donde existe.
  const canShare = typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] });
  const share = async () => {
    try {
      await navigator.share({ files: [file], title: 'Discos Raros', text });
      say('GRACIAS POR HACER CORRER LA BOLA.');
    } catch (e) {
      // Cerrar el menú sin elegir nada no es un error.
      if ((e as Error).name !== 'AbortError') download();
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      say('LINK COPIADO.');
    } catch {
      say(link.replace(/^https?:\/\//, '').toUpperCase(), 'aviso');
    }
  };

  image.className = 'foto';
  image.setAttribute('role', 'img');
  image.setAttribute('aria-label', `${raro.name} bailando en la pista de Discos Raros`);
  say('UNA FOTO PARA TUS HISTORIAS. ARROBANOS: @DISCOSRAROS.ARG', 'aviso');
  p.body.append(
    el('div', 'compartir', [
      image,
      el('div', 'compartir-botones', [
        ...(canShare ? [button('COMPARTIR', 'btn rojo', share)] : []),
        button('BAJAR LA IMAGEN', canShare ? 'btn' : 'btn rojo', download),
        button('COPIAR EL LINK', 'btn', copy),
        status,
      ]),
    ]),
  );
  p.focusFirst();
}
