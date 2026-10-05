import { DR, PSXStage, fontsReady, outlined, titleUnit } from './style-kit';
import { buildTestCube } from './scenes/testCube';
import { showStartScreen } from './ui/startScreen';

async function main() {
  const stage = new PSXStage(document.querySelector<HTMLCanvasElement>('#stage')!);
  buildTestCube(stage);
  await fontsReady();
  stage.start();
  if (import.meta.env.DEV) (window as unknown as { dr: unknown }).dr = { stage };

  await showStartScreen(stage);

  // Fase 1: después de PRESS START queda la escena de prueba con un cartelito.
  // En la Fase 3 acá entra el boiler room.
  stage.onOverlay = (ctx, w, h) => {
    const unit = titleUnit(w, h);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    outlined(ctx, 'STYLE-KIT OK', unit, unit, unit, DR.amarillo, DR.rojo);
    outlined(ctx, `${w}x${h}`, unit, unit * 3, unit, DR.rosa);
  };
}

void main();
