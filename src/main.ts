import { PSXStage, fontsReady } from './style-kit';
import { buildTestCube } from './scenes/testCube';
import { openContacto } from './sections/contacto';
import { openSets } from './sections/sets';
import { mountUi } from './ui/shell';
import { showStartScreen } from './ui/startScreen';

async function main() {
  const stage = new PSXStage(document.querySelector<HTMLCanvasElement>('#stage')!);
  buildTestCube(stage);
  await fontsReady();
  stage.start();
  if (import.meta.env.DEV) (window as unknown as { dr: unknown }).dr = { stage };

  await showStartScreen(stage);

  mountUi([
    { path: '', label: 'LA PISTA' },
    { path: 'sets', label: 'SETS', open: () => openSets({ playing: () => null, play: (s) => window.open(s.url, '_blank', 'noopener') }) },
    { path: 'contacto', label: 'CONTACTO', open: openContacto },
  ]);
}

void main();
