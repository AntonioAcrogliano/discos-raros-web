import { redesLinks } from '../redes';
import { DR, type PSXStage, drawLogo, drawPressStart, outlined, sfx, titleUnit, unlockAudio } from '../style-kit';

/**
 * Pantalla de entrada: logo + PRESS START titilando sobre la escena que esté corriendo.
 * El click (o Enter / Espacio / tocar la pantalla) desbloquea el audio del navegador,
 * que es lo que después deja sonar el set. Resuelve cuando el visitante entra.
 */
export function showStartScreen(stage: PSXStage): Promise<void> {
  return new Promise((resolve) => {
    const button = document.createElement('button');
    button.className = 'press-start';
    button.textContent = 'Press Start: entrar a Discos Raros';
    // Las redes van encima del botón gigante: se puede ir a YouTube sin entrar a la pista.
    const redes = redesLinks('redes en-inicio');
    document.body.append(button, redes);
    button.focus();

    stage.onOverlay = (ctx, w, h, t) => {
      drawLogo(ctx, w, h, t);
      drawPressStart(ctx, w, h, t);
    };

    let pressedAt = -1;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        press();
      }
    };
    const press = () => {
      if (pressedAt >= 0) return;
      unlockAudio();
      sfx.start();
      window.removeEventListener('keydown', onKey);
      button.remove();
      redes.remove();
      // Medio segundo de PRESS START titilando rápido, como cuando el juego toma el botón.
      stage.onOverlay = (ctx, w, h, t) => {
        if (pressedAt < 0) pressedAt = t;
        const e = t - pressedAt;
        drawLogo(ctx, w, h, t);
        if (Math.floor(e * 16) % 2 === 0) {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          outlined(ctx, 'PRESS START', w / 2, Math.round(h * 0.72), Math.round(titleUnit(w, h) * 1.5), DR.crema, DR.rojo);
        }
        if (e > 0.55) {
          stage.onOverlay = null;
          resolve();
        }
      };
    };
    button.addEventListener('click', press);
    // Por si el foco se fue del botón (click afuera de la ventana, por ejemplo).
    window.addEventListener('keydown', onKey);
  });
}
