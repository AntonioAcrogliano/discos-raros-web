import type { Raro, SetInfo } from '../shared/look';
import { type PistaData, fetchPista, fetchSets } from './api';
import { createBoilerRoom } from './scenes/boiler';
import { openContacto } from './sections/contacto';
import { openCreador } from './sections/creador';
import { openJugar } from './sections/jugar';
import { askAtDoor } from './sections/puerta';
import { openSets } from './sections/sets';
import { PSXStage, fontsReady, makeLogoCanvas, setLogoSprite } from './style-kit';
import { isTouch, sinTildes } from './ui/dom';
import { type ActionButton, go, hudContador, mountStick, mountUi, pistaHint, player, setActions, setChrome, setRouteLabel, showCall, showHint } from './ui/shell';
import { showStartScreen } from './ui/startScreen';

/** Dibujitos de la barra: un disco, un raro, un joystick y un sobre. */
const ICONS = {
  disco: ['..XXXXX..', '.XXXXXXX.', 'XXXXXXXXX', 'XXXX.XXXX', 'XXX...XXX', 'XXXX.XXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..'],
  raro: ['...XXX...', '..XXXXX..', '..XXXXX..', '...XXX...', '.XXXXXXX.', 'XXXXXXXXX', 'X.XXXXX.X', '..XX.XX..', '..XX.XX..'],
  juegos: ['.........', '.XXXXXXX.', 'XXXXXXXXX', 'XX.XXX.XX', 'X...X.X.X', 'XX.XXX.XX', 'XXXXXXXXX', 'XXX...XXX', '.X.....X.'],
  sobre: ['.........', 'XXXXXXXXX', 'XX.....XX', 'X.X...X.X', 'X..X.X..X', 'X...X...X', 'X.......X', 'XXXXXXXXX', '.........'],
};

/** Lo que puede hacer tu raro en la pista. `kind` es el de `action` en dances.ts. */
const ACTIONS: ActionButton[] = [
  { kind: 1, label: 'PUCHO', icon: ['.........', '......X..', '.....X...', '......X..', '.........', 'XXXXXX.XX', 'XXXXXX.XX', '.........', '.........'] },
  { kind: 2, label: 'AGUA', icon: ['...XXX...', '...XXX...', '..XXXXX..', '..X...X..', '..X...X..', '..XXXXX..', '..XXXXX..', '..XXXXX..', '..XXXXX..'] },
  { kind: 3, label: 'HOLA', icon: ['..X.X.X..', '..X.X.X.X', '..X.X.X.X', 'X.XXXXXXX', 'X.XXXXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '..XXXXX..'] },
  { kind: 4, label: 'SALTO', icon: ['....X....', '...XXX...', '..XXXXX..', '.XXXXXXX.', '...XXX...', '...XXX...', '...XXX...', '.........', 'XXXXXXXXX'] },
  { kind: 5, label: 'PASTI', icon: ['.........', '.....XXX.', '....XXXXX', '...X.XXXX', '..X...XXX', '.X...X.X.', 'X...X....', 'X..X.....', '.XX......'] },
  // (No es un paso: va al sillón libre más cercano y se sienta; otra vez, se para.)
  { kind: 6, label: 'SENTARSE', icon: ['.X.......', '.X.......', '.X.......', '.X.......', '.XXXXXXX.', '.XXXXXXX.', '.X.....X.', '.X.....X.', '.X.....X.'] },
];

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
  // El último set se pone apenas llega la lista, en silencio (el navegador no deja otra cosa
  // antes del primer click): así al apretar PRESS START ya se lo escucha desde la vereda.
  void sets.then((list) => list[0] && room.play(list[0], list));

  // Solo en desarrollo: ?autostart saltea el PRESS START (para sacar capturas automáticas).
  if (import.meta.env.DEV && location.search.includes('autostart')) setTimeout(() => document.querySelector<HTMLElement>('.press-start')?.click(), 300);
  await showStartScreen(stage, () => room.unlockSound());
  stage.onOverlay = (ctx, w, h, t) => room.drawOverlay(ctx, w, h, t);
  // Se abren las puertas y se entra caminando; la interfaz aparece recién adentro.
  setChrome(false);
  // En la puerta el patova pide el nombre: con eso el raro ya queda creado y entra con vos.
  const adentro = room.enter(import.meta.env.DEV && location.search.includes('autostart') && !location.search.includes('puerta'), async () => {
    const d = await pista;
    return askAtDoor({ room, mine: d?.mine ?? null, onSaved: (raro, total) => onSaved(raro, total) });
  });

  const contador = (total: number) => {
    hudContador.textContent = total > 0 ? `${total.toLocaleString('es-AR')} ${total === 1 ? 'RARO' : 'RAROS'} EN LA PISTA` : 'LA PISTA ESTA VACIA. SE EL PRIMERO.';
  };
  // Reproductor del cartel: qué suena, anterior / pausa / siguiente y el link a YouTube.
  room.onNowPlaying = (s) => {
    player.set(sinTildes(`#${s.number} ${s.name}${s.genre ? ` [${s.genre}]` : ''}`.toUpperCase()), s.url);
    document.title = `#${s.number} ${s.name} · DISCOS RAROS`;
  };
  room.onPlayState = (playing) => player.setPlaying(playing);
  player.onToggle(() => room.toggle());
  // Volumen desde el cartel (en iPhone no: ahí solo lo maneja el teléfono). Se acuerda del que elegiste.
  if (room.canVolume) {
    const VOL_KEY = 'dr-vol';
    const remember = (v: number) => {
      try {
        localStorage.setItem(VOL_KEY, String(v));
      } catch {
        /* sin almacenamiento */
      }
    };
    let saved = NaN;
    try {
      saved = Number(localStorage.getItem(VOL_KEY) ?? NaN);
    } catch {
      /* sin almacenamiento */
    }
    if (saved >= 0 && saved <= 1) room.setVolume(saved);
    player.setVolume(room.volume());
    player.onVolume((v) => {
      room.setVolume(v);
      remember(v);
    });
    room.onVolume = (v) => {
      player.setVolume(v);
      remember(v);
    };
  }
  // La lista va del set más nuevo al más viejo: "siguiente" es el anterior en el tiempo.
  player.onNext(() => room.skip(1));
  player.onPrev(() => room.skip(-1));
  let data: PistaData = { total: 0, raros: [], mine: null };
  let loaded = false;
  const setPista = (d: PistaData) => {
    data = d;
    loaded = true;
    room.setPista(d);
    contador(d.total);
    setRouteLabel('crear', d.mine ? 'TU RARO' : d.total ? 'CREA TU RARO' : 'ENTRA A LA PISTA', !d.mine && d.total === 0);
    // Las acciones son del que tiene raro.
    setActions(d.mine ? ACTIONS : null, (kind) => room.act(kind));
  };
  void pista.then((d) => d && setPista(d));
  // Raro recién armado (en la puerta o en el creador): se invita a compartirlo, una vez adentro.
  let mounted = false, invite = false;
  const inviteToShare = () => showCall('TU RARO YA ESTA EN LA PISTA.', 'COMPARTILO', 'compartir');
  const onSaved = (raro: Raro, total: number) => {
    const isNew = !data.mine;
    setPista({ ...data, mine: raro, total });
    if (!isNew) return;
    if (mounted) inviteToShare();
    else invite = true;
  };
  contador(0);
  // El set ya puede estar puesto desde antes de entrar: se actualiza el cartel.
  const now = room.playing();
  if (now) room.onNowPlaying(now);
  room.onPlayState(room.isPlaying());

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

  await adentro;
  setChrome(true);
  mountUi([
    { path: 'sets', label: 'DISCOS', icon: ICONS.disco, open: () => openSets({ playing: () => room.playing()?.id ?? null, play: (s) => void sets.then((list) => room.play(s, list)) }) },
    {
      path: 'crear',
      label: 'CREA TU RARO',
      icon: ICONS.raro,
      open: () => openCreador({ room, mine: () => data.mine, onSaved }),
    },
    { path: 'jugar', label: 'PATIO DE JUEGOS', icon: ICONS.juegos, open: () => openJugar(room) },
    { path: 'contacto', label: 'CONTACTO', icon: ICONS.sobre, open: openContacto },
    // Los juegos se abren desde JUGAR (teclado o joystick en la compu; controles táctiles en el celular).
    { path: 'pelea', label: 'PELEA', nav: false, open: openPelea },
    { path: 'futbol', label: 'CABEZAZOS', nav: false, open: openFutbol },
    // La foto del raro se arma recién cuando se pide (trae su propio dibujante).
    { path: 'compartir', label: 'COMPARTIR', nav: false, open: () => void import('./sections/compartir').then((m) => m.openCompartir(data.mine)) },
  ]);
  // En el celu se camina con la palanca.
  if (isTouch()) mountStick((x, y) => room.steer(x, y));
  mounted = true;
  if (invite) inviteToShare();
  // La pista pudo llegar (o el raro crearse en la puerta) antes de que existiera la barra: se actualiza su cartel.
  if (loaded) setPista(data);
  // Recién llegado a la pista (no si entró directo a una sección): cómo se mira y se camina.
  if (!location.hash.replace(/^#\/?/, '')) showHint(pistaHint());
}

void main();