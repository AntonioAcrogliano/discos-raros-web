import type { SetInfo } from '../shared/look';
import { type PistaData, fetchPista, fetchSets } from './api';
import { createBoilerRoom } from './scenes/boiler';
import { openContacto } from './sections/contacto';
import { openCreador } from './sections/creador';
import { openSets } from './sections/sets';
import { PSXStage, fontsReady, makeLogoCanvas, setLogoSprite } from './style-kit';
import { isTouch, sinTildes } from './ui/dom';
import { go, hudContador, hudSuena, mountUi, setChrome, setRouteLabel } from './ui/shell';
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
  let data: PistaData = { total: 0, raros: [], mine: null };
  const setPista = (d: PistaData) => {
    data = d;
    room.setPista(d);
    contador(d.total);
    setRouteLabel('crear', d.mine ? 'TU RARO' : 'CREA TU RARO');
  };
  void pista.then((d) => d && setPista(d));
  // El último set arranca solo (el click de PRESS START es lo que habilita el sonido).
  void sets.then((list) => list[0] && room.play(list[0], list));

  /** Entra a la pelea (el código se baja recién acá) y devuelve cómo salir. */
  const openPelea = () => {
    let stopped = false;
    let stop = () => {};
    setChrome(false);
    void import('./pelea').then(async ({ startPelea }) => {
      const pelea = await startPelea(stage, room, () => go(''));
      if (stopped) pelea.stop();
      else stop = () => pelea.stop();
    });
    return () => {
      stopped = true;
      stop();
      setChrome(true);
    };
  };

  mountUi([
    { path: '', label: 'LA PISTA' },
    { path: 'sets', label: 'SETS', open: () => openSets({ playing: () => room.playing()?.id ?? null, play: (s) => void sets.then((list) => room.play(s, list)) }) },
    {
      path: 'crear',
      label: 'CREA TU RARO',
      open: () => openCreador({ room, mine: () => data.mine, onSaved: (raro, total) => setPista({ ...data, mine: raro, total }) }),
    },
    { path: 'contacto', label: 'CONTACTO', open: openContacto },
    // El juego de pelea es solo para PC (teclado o joystick).
    ...(isTouch() ? [] : [{ path: 'pelea', label: 'DISCOS VS RAROS', open: openPelea }]),
  ]);
}

void main();
