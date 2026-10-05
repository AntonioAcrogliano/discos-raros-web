# Discos Raros — Roadmap y prompts para Claude Code

Setup inicial:

```bash
mkdir discos-raros-web && cd discos-raros-web
# copiá CLAUDE.md acá
claude --add-dir ../RUTA-A-TU-APP-PCX
```

Antes de cada fase, conviene entrar en modo plan (Shift+Tab) para que primero te proponga el plan y lo aprobés.

---

## Fase 0 — Entender la app de PCX

> Leé CLAUDE.md. Después explorá la carpeta de la app de PCX (solo lectura, no la modifiques) y contame: en qué está hecha, cómo resuelve el look PS1 (shaders, post-procesado, paleta, resolución), qué animaciones, fondos y assets tiene, y qué se puede reutilizar en la web. Armá una lista de lo que conviene portar al style-kit.

## Fase 1 — Esqueleto y style-kit

> Creá el proyecto con Vite + TypeScript + Three.js. Portá a `src/style-kit/` lo reutilizable de la app de PCX (paleta, shaders de vertex jitter, affine y dithering, render a baja resolución, fuentes). Armá una escena de prueba con un cubo texturizado que se vea 100% PS1, más una pantalla de entrada "PRESS START".

## Fase 2 — Web básica

> Armá las secciones Sets (últimos sets de YouTube con thumbnails) y Contacto (formulario). Todo con menús estilo juego de PS1, navegables con mouse y teclado. Usá la estética del style-kit.

## Fase 3 — Boiler room (sin backend)

> Armá la escena del boiler room: un club low-poly, cabina con dos DJs placeholder (Discos y Raros), luces, niebla y una tele que muestre el player de YouTube con el último set (CSS3DRenderer). Bailarines placeholder con instancing que bailen a un BPM configurable. Que ande bien en celular.

## Fase 4 — Crear tu personaje + Supabase

> Agregá el creador de personaje: nombre visible, algunas opciones (cuerpo, color, ropa, accesorio) y foto de cara opcional (recorte, pixelado a 32×32, textura en la cabeza). Guardá en Supabase, con 1 personaje por dispositivo, Turnstile y rate limit. Las fotos quedan pendientes de moderación. Sumá un panel admin simple, protegido, para aprobar o borrar. La pista muestra unos 150 personajes (el tuyo + recientes + aleatorios) y un contador total.

## Fase 5 — Modelos reales de Discos y Raros

> Reemplazá los placeholders por los GLB de `public/models/` (Discos y Raros), con animaciones de DJ en la cabina.

## Fase 6 — Discos vs Raros (proyecto grande, aparte)

Hacelo en una sección `/pelea` o en una carpeta propia que reutilice el style-kit y los modelos. Arrancá por un prototipo con cubos:

> Prototipo de juego de pelea 3D estilo Tekken 1, solo desktop: dos luchadores con cajas como placeholder, movimiento en el eje, golpe alto/bajo, patada, bloqueo, barra de vida, rounds y una IA simple. Recién cuando se sienta bien, metemos los modelos y la estética.
