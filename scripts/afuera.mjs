// Arma el audio "de afuera" de un set: los primeros minutos, livianos, en public/audio/<número>.mp3.
// Es lo que se escucha tapado desde la vereda antes de entrar (el player de YouTube no se puede filtrar).
//
//   npm run afuera -- "C:\ruta\al\set.wav" 58
//
// Necesita ffmpeg. Sirve cualquier formato de audio o video.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const [input, number] = process.argv.slice(2);
if (!input || !/^\d+$/.test(number ?? '')) {
  console.error('Uso: npm run afuera -- <archivo del set> <número del set>');
  process.exit(1);
}
mkdirSync('public/audio', { recursive: true });
const out = `public/audio/${number}.mp3`;
// 2 minutos y medio alcanzan: si alguien se queda más que eso en la puerta, el video vuelve a empezar.
const r = spawnSync('ffmpeg', ['-y', '-i', input, '-t', '150', '-vn', '-ac', '2', '-ar', '44100', '-b:a', '64k', out], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`\nListo: ${out}. Subilo con un commit y ya se escucha desde la vereda.`);
