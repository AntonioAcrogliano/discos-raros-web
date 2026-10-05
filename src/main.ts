import type { SetInfo } from '../shared/look';
import { fetchPista, fetchSets } from './api';
import { createBoilerRoom } from './scenes/boiler';
import { openContacto } from './sections/contacto';
import { openSets } from './sections/sets';
import { PSXStage, fontsReady, makeLogoCanvas, setLogoSprite } from './style-kit';
import { sinTildes } from './ui/dom';
import { hudContador, hudSuena, mountUi } from './ui/shell';
import { showStartScreen } from './ui/startScreen';

async function main() {
  const stage = new PSXStage(document.querySelector<HTMLCanvasElement>('#stage')!);
  const room = createBoilerRoom(stage);
  if (import.meta.env.DEV) (window as unknown as { dr: unknown }).dr = { stage, room };

  // Mientras está el PRESS START se va pidiendo todo, así al entrar ya suena.
  const sets = fetchSets().catch((): SetInfo[] => []);
  const pista = fetchPista().catch(() => null);
  void makeLogoCanvas(160).then(setLogoSprite);
  await fontsReady();
  stage.start();

  await showStartScreen(stage);
  stage.onOverlay = (ctx, w, h, t) => room.drawOverlay(ctx, w, h, t);

  const contador = (total: number) => {
    hudContador.textContent = total > 0 ? `${total.toLocaleString('es-AR')} ${total === 1 ? 'RARO' : 'RAROS'} EN LA PISTA` : '';
  };
  room.onNowPlaying = (s) => (hudSuena.textContent = sinTildes(`♪ #${s.number} ${s.name}${s.genre ? ` [${s.genre}]` : ''}`.toUpperCase()));
  void pista.then((data) => {
    if (!data) return;
    room.setPista(data);
    contador(data.total);
  });
  // El último set arranca solo (el click de PRESS START es lo que habilita el sonido).
  void sets.then((list) => list[0] && room.play(list[0], list));

  mountUi([
    { path: '', label: 'LA PISTA' },
    { path: 'sets', label: 'SETS', open: () => openSets({ playing: () => room.playing()?.id ?? null, play: (s) => void sets.then((list) => room.play(s, list)) }) },
    { path: 'contacto', label: 'CONTACTO', open: openContacto },
  ]);
}

void main();
