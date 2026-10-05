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
  // En la compu, el doble de resolución interna (640×480); en el celular, la de la Play (320×240).
  stage.post.settings.resolution = isTouch() ? '320×240' : '640×480';
  stage.resize();
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
    hudContador.textContent = total > 0 ? `${total.toLocaleString('es-AR')} ${total === 1 ? 'RARO' : 'RAROS'} EN LA PISTA` : 'LA PISTA ESTA VACIA. SE EL PRIMERO.';
  };
  room.onNowPlaying = (s) => (hudSuena.textContent = sinTildes(`♪ #${s.number} ${s.name}${s.genre ? ` [${s.genre}]` : ''}`.toUpperCase()));
  let data: PistaData = { total: 0, raros: [], mine: null };
  const setPista = (d: PistaData) => {
    data = d;
    room.setPista(d);
    contador(d.total);
    setRouteLabel('crear', d.mine ? 'TU RARO' : d.total ? 'CREA TU RARO' : 'ENTRA A LA PISTA', !d.mine && d.total === 0);
  };
  void pista.then((d) => d && setPista(d));
  contador(0);
  // El último set arranca solo (el click de PRESS START es lo que habilita el sonido).
  void sets.then((list) => list[0] && room.play(list[0], list));

  /** Entra a un juego (el código se baja recién acá) y devuelve cómo salir. */
  const openGame = (load: () => Promise<{ stop(): void }>) => () => {
    let stopped = false;
    let stop = () => {};
    setChrome(false);
    void load().then((game) => {
      if (stopped) game.stop();
      else stop = () => game.stop();
    });
    return () => {
      stopped = true;
      stop();
      setChrome(true);
    };
  };
  const exit = () => go('');
  const openPelea = openGame(() => import('./pelea').then((m) => m.startPelea(stage, room, exit)));
  const openFutbol = openGame(() => import('./futbol').then((m) => m.startFutbol(stage, room, exit)));

  mountUi([
    { path: '', label: 'LA PISTA' },
    { path: 'sets', label: 'SETS', open: () => openSets({ playing: () => room.playing()?.id ?? null, play: (s) => void sets.then((list) => room.play(s, list)) }) },
    {
      path: 'crear',
      label: 'CREA TU RARO',
      open: () => openCreador({ room, mine: () => data.mine, onSaved: (raro, total) => setPista({ ...data, mine: raro, total }) }),
    },
    { path: 'contacto', label: 'CONTACTO', open: openContacto },
    // Los juegos son solo para PC (teclado o joystick).
    ...(isTouch()
      ? []
      : [
          { path: 'pelea', label: 'PELEA', open: openPelea },
          { path: 'futbol', label: 'CABEZAZOS', open: openFutbol },
        ]),
  ]);
}

void main();
