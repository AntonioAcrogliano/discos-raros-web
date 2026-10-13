/**
 * Analiza el audio de los sets para que las luces del boliche sigan la música de verdad.
 * YouTube no deja leer el audio del player en el navegador, así que se hace acá, una vez por
 * set: queda public/luces/<id>.bin con el volumen de graves, medios y agudos 25 veces por
 * segundo y el momento de cada beat. El sitio lo lee en src/scenes/boiler/luces.ts.
 *
 *   npm run luces                       los sets de la lista que todavía no tienen archivo
 *   npm run luces -- <id o link>…       esos sets (los rehace si ya estaban)
 *   npm run luces -- <id> --archivo set.wav   desde un archivo de audio, sin bajar nada
 *   --bpm 140                           tempo aproximado, si el del género no le pega
 *
 * Necesita ffmpeg, y yt-dlp para bajar el audio de YouTube.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSets } from '../server/sets.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'luces');
/** Audio de trabajo: mono a 24 kHz, y una medida cada 10 ms. */
const SR = 24000, HOP = 240, RATE = SR / HOP;
/** Lo que se guarda: 25 medidas por segundo. */
const FPS = 25, STEP = RATE / FPS;

// --- Audio → volumen por banda -------------------------------------------------------------

/** Filtro de segundo orden (pasa bajos o pasa altos). */
function biquad(high, hz) {
  const w = (2 * Math.PI * hz) / SR, cos = Math.cos(w), alpha = Math.sin(w) / Math.SQRT2;
  const b1 = (high ? -(1 + cos) : 1 - cos) / (1 + alpha), b0 = Math.abs(b1) / 2;
  const a1 = (-2 * cos) / (1 + alpha), a2 = (1 - alpha) / (1 + alpha);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1, x1 = x, y2 = y1, y1 = y;
    return y;
  };
}

/** Pasa el audio por ffmpeg y devuelve el volumen de graves, medios y agudos cada 10 ms. */
function bands(file) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
    const low = biquad(false, 150), midA = biquad(true, 300), midB = biquad(false, 3000), top = biquad(true, 5000);
    // Bombo y bajo · voces, sintes y redoblante · platillos.
    const out = [[], [], []], env = [0, 0, 0];
    const K = [1 / (0.02 * SR), 1 / (0.008 * SR), 1 / (0.008 * SR)];
    let rest = Buffer.alloc(0), n = 0;
    ff.stdout.on('data', (chunk) => {
      const buf = rest.length ? Buffer.concat([rest, chunk]) : chunk;
      const count = buf.length >> 2;
      for (let i = 0; i < count; i++) {
        const x = buf.readFloatLE(i * 4);
        const b = low(x), m = midB(midA(x)), h = top(x);
        env[0] += (b * b - env[0]) * K[0];
        env[1] += (m * m - env[1]) * K[1];
        env[2] += (h * h - env[2]) * K[2];
        if (++n % HOP === 0) for (let k = 0; k < 3; k++) out[k].push(Math.sqrt(env[k]));
      }
      rest = buf.subarray(count * 4);
    });
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 && out[0].length > RATE ? resolve(out.map((a) => Float32Array.from(a))) : reject(new Error('ffmpeg no pudo leer el audio'))));
  });
}

function percentile(a, q) {
  const s = Float32Array.from(a).sort();
  return s[Math.min(s.length - 1, Math.floor(s.length * q))] || 1e-9;
}

// --- Beats ---------------------------------------------------------------------------------

/** Dónde arranca cada golpe: lo que sube el volumen de un momento al siguiente, sumando las tres bandas. */
function onsets(env) {
  const n = env[0].length, o = new Float32Array(n);
  [1, 0.6, 0.4].forEach((w, k) => {
    const ref = percentile(env[k], 0.95);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const v = Math.log1p((20 * env[k][i]) / ref);
      if (v > last) o[i] += w * (v - last);
      last = v;
    }
  });
  // Se le saca el promedio del segundo de alrededor, y queda todo en la misma escala.
  const half = RATE / 2, sum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) sum[i + 1] = sum[i] + o[i];
  let sq = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half), b = Math.min(n, i + half);
    o[i] = Math.max(0, o[i] - (sum[b] - sum[a]) / (b - a));
    sq += o[i] * o[i];
  }
  const std = Math.sqrt(sq / n) || 1;
  for (let i = 0; i < n; i++) o[i] /= std;
  return o;
}

/**
 * El tempo a lo largo del set (en medidas por beat, una por cada medida). Mira de a 10
 * segundos cada cuánto se repiten los golpes, cerca del BPM del género, y arma el recorrido
 * que mejor explica todo el set sin pegar saltos porque sí (los DJs cambian de a poco).
 */
function tempo(o, bpm) {
  const n = o.length, W = 10 * RATE, H = 2 * RATE;
  const periods = [];
  for (let p = (60 * RATE) / (bpm * 1.33); p <= (60 * RATE) / (bpm * 0.75); p += 0.125) periods.push(p);
  const N = periods.length, maxLag = Math.ceil(periods[N - 1] * 4) + 1;
  const wins = Math.max(1, Math.floor((n - W) / H) + 1);
  const ac = new Float64Array(maxLag + 1), emit = new Float32Array(wins * N);
  for (let w = 0; w < wins; w++) {
    const s = w * H, e = Math.min(n, s + W);
    for (let l = 0; l <= maxLag; l++) {
      let a = 0;
      for (let i = s; i < e - l; i++) a += o[i] * o[i + l];
      ac[l] = a / Math.max(1, e - s - l);
    }
    for (let j = 0; j < N; j++) {
      // El golpe se repite a un beat, a dos, a tres y a cuatro.
      let score = 0;
      for (let k = 1; k <= 4; k++) {
        const x = periods[j] * k, i = Math.floor(x);
        score += ac[i] + (ac[i + 1] - ac[i]) * (x - i);
      }
      const far = Math.log2((periods[j] * bpm) / (60 * RATE));
      emit[w * N + j] = score / 4 / (ac[0] + 0.05) - 0.3 * far * far;
    }
  }
  const JUMP = 4, cost = new Float32Array(N * N);
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) cost[a * N + b] = JUMP * Math.abs(Math.log2(periods[a] / periods[b]));
  let best = Float32Array.from(emit.subarray(0, N));
  const from = new Int16Array(wins * N);
  for (let w = 1; w < wins; w++) {
    const next = new Float32Array(N);
    for (let j = 0; j < N; j++) {
      let top = -Infinity, arg = 0;
      for (let i = 0; i < N; i++) {
        const v = best[i] - cost[i * N + j];
        if (v > top) (top = v), (arg = i);
      }
      next[j] = top + emit[w * N + j];
      from[w * N + j] = arg;
    }
    best = next;
  }
  const path = new Float32Array(wins);
  let j = best.indexOf(Math.max(...best));
  for (let w = wins - 1; w >= 0; w--) {
    path[w] = periods[j];
    j = from[w * N + j];
  }
  const period = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = Math.max(0, Math.min(wins - 1, (i - W / 2) / H)), w = Math.min(wins - 2, Math.floor(x));
    period[i] = wins < 2 ? path[0] : path[w] + (path[w + 1] - path[w]) * (x - w);
  }
  return period;
}

/** Los beats: la fila de golpes fuertes que mejor respeta el tempo (el método de Ellis). Devuelve segundos. */
function beats(o, period) {
  const n = o.length, TIGHT = 100;
  const score = new Float32Array(n), prev = new Int32Array(n).fill(-1);
  for (let t = 0; t < n; t++) {
    const p = period[t];
    let top = -Infinity, arg = -1;
    for (let i = Math.max(0, Math.round(t - 2 * p)); i <= Math.round(t - p / 2); i++) {
      const l = Math.log((t - i) / p), v = score[i] - TIGHT * l * l;
      if (v > top) (top = v), (arg = i);
    }
    score[t] = o[t] + (arg < 0 ? 0 : top);
    prev[t] = arg;
  }
  let t = n - 1;
  for (let i = Math.max(0, Math.round(n - 2 * period[n - 1])); i < n; i++) if (score[i] > score[t]) t = i;
  const out = [];
  for (; t >= 0; t = prev[t]) out.push(t / RATE);
  return out.reverse();
}

// --- Archivo -------------------------------------------------------------------------------

/**
 * "DRL1" · medidas por segundo (u16) · bandas (u16) · cuántas medidas (u32) · cuántos beats (u32)
 * · los beats en milisegundos (u32 cada uno) · las medidas (un byte por banda: graves, medios, agudos).
 */
function pack(env, beatTimes) {
  const frames = Math.ceil(env[0].length / STEP);
  const buf = Buffer.alloc(16 + beatTimes.length * 4 + frames * 3);
  buf.write('DRL1', 0, 'latin1');
  buf.writeUInt16LE(FPS, 4);
  buf.writeUInt16LE(3, 6);
  buf.writeUInt32LE(frames, 8);
  buf.writeUInt32LE(beatTimes.length, 12);
  beatTimes.forEach((s, i) => buf.writeUInt32LE(Math.round(s * 1000), 16 + i * 4));
  const at = 16 + beatTimes.length * 4;
  env.forEach((band, k) => {
    // El tope es lo fuerte de verdad del set: en los drops la banda llega a 255.
    const ref = percentile(band, 0.97);
    for (let f = 0; f < frames; f++) {
      let peak = 0;
      for (let i = f * STEP; i < Math.min(band.length, (f + 1) * STEP); i++) peak = Math.max(peak, band[i]);
      buf[at + f * 3 + k] = Math.round(255 * Math.min(1, peak / ref));
    }
  });
  return buf;
}

export async function analyze(file, bpm) {
  const env = await bands(file);
  const o = onsets(env);
  const period = tempo(o, bpm);
  const times = beats(o, period);
  const sorted = Float32Array.from(period).sort();
  const at = (q) => ((60 * RATE) / sorted[Math.floor((sorted.length - 1) * q)]).toFixed(1);
  return { buf: pack(env, times), seconds: env[0].length / RATE, times, info: `${at(0.5)} BPM (entre ${at(0.98)} y ${at(0.02)}), ${times.length} beats` };
}

// --- Línea de comandos ---------------------------------------------------------------------

function download(id, dir) {
  const r = spawnSync('yt-dlp', ['-f', 'bestaudio', '--no-playlist', '-o', join(dir, `${id}.%(ext)s`), `https://www.youtube.com/watch?v=${id}`], { stdio: 'inherit' });
  const file = readdirSync(dir).find((f) => f.startsWith(`${id}.`));
  if (r.status !== 0 || !file) throw new Error('yt-dlp no pudo bajar el audio');
  return join(dir, file);
}

async function main() {
  const args = process.argv.slice(2), ids = [];
  let file = null, bpm = 0;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--archivo') file = args[++i];
    else if (args[i] === '--bpm') bpm = Number(args[++i]);
    else {
      const id = /(?:v=|youtu\.be\/|^)([\w-]{11})(?:[&?#]|$)/.exec(args[i])?.[1];
      if (!id) throw new Error(`No entiendo "${args[i]}": va el id o el link del video`);
      ids.push(id);
    }
  }
  if (file && ids.length !== 1) throw new Error('Con --archivo va un solo id: el del video al que corresponde el audio');
  mkdirSync(OUT, { recursive: true });
  const sets = await getSets();
  // Sin ids: todos los de la lista a los que les falte el archivo.
  const todo = ids.length ? ids : sets.map((s) => s.id).filter((id) => !existsSync(join(OUT, `${id}.bin`)));
  if (!todo.length) return console.log('Todos los sets ya tienen sus luces.');
  const dir = mkdtempSync(join(tmpdir(), 'luces-'));
  let failed = 0;
  try {
    for (const id of todo) {
      const set = sets.find((s) => s.id === id);
      console.log(`\n${set?.title ?? id}`);
      try {
        const audio = file ?? download(id, dir);
        const { buf, seconds, info } = await analyze(audio, bpm || set?.bpm || 126);
        writeFileSync(join(OUT, `${id}.bin`), buf);
        console.log(`  ${Math.round(seconds / 60)} min · ${info} · ${Math.round(buf.length / 1024)} KB`);
        if (!file) rmSync(audio);
      } catch (e) {
        failed++;
        console.error(`  No se pudo: ${e.message}`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
