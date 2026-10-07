# Discos Raros — Web

Sitio oficial de **Discos Raros**, dúo de DJs argentino con estética bizarra. Dos integrantes: **Discos** y **Raros**.
Suben un set nuevo por semana en YouTube (@discosraros), cada uno de un estilo distinto (techno, house, DnB, psytrance, garage, UK garage…).
Redes: YouTube @discosraros · Instagram @discosraros.arg · Kick discosRaros.

## Qué es el sitio

1. **Home = Boiler Room 3D**: una pista low-poly estilo PS1 con Discos y Raros en la cabina. Suena el último set de YouTube. Los visitantes crean un personaje y queda bailando en la pista para siempre.
2. **Sets**: links a los sets (YouTube).
3. **Contacto**: formulario de contacto/booking.
4. **Discos vs Raros** (fase posterior): juego de pelea 3D estilo PS1 / Tekken 1, 1 jugador vs CPU, **solo PC** (teclado o joystick).

## Estética (regla de oro)

- Look **PlayStation 1**: low-poly, texturas de baja resolución con filtro *nearest*, vertex jitter (snap de vértices), affine texture warping, dithering, paleta limitada, niebla, resolución interna baja escalada hacia arriba.
- Bizarro, gracioso, un poco feo a propósito. Nada de UI "limpia y moderna": menús tipo juego de PS1, tipografías pixel, sonidos de menú.
- La fuente de verdad visual es la **app de PCX** (carpeta agregada con `/add-dir`). Antes de inventar un efecto, fijate si ya existe ahí y reutilizalo.
- Todo lo visual compartido vive en `src/style-kit/` (paleta, shaders, materiales, fuentes, post-procesado). Ninguna escena define su propio look por fuera del kit.

## Stack

- Vite + TypeScript + Three.js (sin framework pesado; si hace falta UI, algo liviano).
- Backend: Supabase (Postgres) para personajes y mensajes de contacto.
- Hosting: Vercel (las funciones están en `api/`). Dominio: discosraros.com.ar.
- Anti-spam sin registro: Cloudflare Turnstile + límite por IP + 1 personaje por dispositivo.

## Restricciones técnicas conocidas

- **Audio desde YouTube**: se usa el YouTube IFrame API. No se puede leer el audio, así que no hay audio-reactividad real: el baile se sincroniza a un BPM fijo o aproximado por set. El player tiene que quedar visible. Idea: mostrarlo como la "tele" o pantalla del club con CSS3DRenderer.
- **Autoplay**: los navegadores bloquean el sonido hasta que haya un click, así que la pantalla de entrada tiene un botón tipo "PRESS START".
- **Último set automático**: sale del feed RSS público del canal (`server/sets.ts`, sin clave de API, cacheado 15 min). Solo entran los títulos tipo `DISCOS RAROS #57 - NOMBRE [GÉNERO]`; el género entre corchetes define el BPM aproximado del baile.
- **Pista infinita**: nunca se renderizan todos los personajes. Se usa instancing y se muestran como máximo unos 150 a la vez (el tuyo siempre, más los recientes y una muestra aleatoria), con contador total ("1.234 raros en la pista").
- **Personaje del visitante**: menú de personalización (cuerpo, colores, ropa, accesorios) + nombre visible. **Sin foto de cara** (se descartó: mucho quilombo de moderación). Lo único a moderar es el nombre.
- **Mobile**: el boiler room tiene que andar en celular (con menos personajes y menos resolución). El juego de pelea es solo para desktop.

## Modelos 3D

- Discos y Raros ya existen en la app de PCX (`psx-viewer/characters/characters.json`), armados por código: **`persona1` = Discos**, **`persona2` = Raros**. Para el MVP van con los outfits que tienen ahí (más adelante pueden cambiar).
- Discos y Raros son el mismo modelo low-poly en la cabina y en el juego de pelea: se hacen una vez y se reutilizan.
- Están en `public/models/discos.glb` y `raros.glb`, exportados de la app de PCX con GLTFExporter (cabeza desde las fotos ya horneada en texturas de 64×64). No tienen skinning: son grupos anidados con nombre (`body`, `head`, `armL`, `foreL`, `legL`, `kneeL`…), los carga `src/characters/glbRig.ts` y se animan por código.
- Para re-exportarlos (outfit nuevo, etc.): trabajar sobre una **copia** de `psx-viewer` (nunca sobre la carpeta original), construir `Character` con la entrada de `characters.json`, `await loadPhotos()`, nombrar las articulaciones del rig, pasar los materiales a `MeshBasicMaterial` y exportar con `GLTFExporter` en binario.
- Si un GLB no carga, entra el personaje de cajas de `src/characters/rig.ts` (mismo esqueleto).

## Convenciones

- Hablar en español rioplatense en commits y comentarios de UI.
- Commits chicos, uno por feature.
- Probar siempre en Chrome desktop y en un celular de gama media.

## Cómo está armado

- `npm run dev` → http://localhost:5180 (el 5173 es del visor de PCX). `npm run build` chequea tipos y compila.
- `src/style-kit/`: paleta, material PSX, post-procesado, texturas, títulos, sonidos y `PSXStage` (renderer + post + capa de textos + loop). Todas las escenas pasan por ahí.
- `src/scenes/boiler/`: club, pista instanciada (`crowd.ts`: una malla instanciada por prenda/accesorio), pasos de baile (`dances.ts`: funciones del beat, sin animaciones guardadas), DJs, tele de YouTube.
- Juegos (solo PC, se cargan recién al entrar y usan el club de escenario con `room.takeover`): `src/pelea/` (Discos vs Raros) y `src/futbol/` (Cabezazos; la física y la CPU están en `game.ts`, sin Three.js, así se pueden simular partidos con Node para ajustar la dificultad).
- `src/ui/` y `src/sections/`: barra, ventanas y secciones (Sets, Crear tu raro, Contacto). Rutas por hash (`#/sets`…).
- `shared/look.ts`: opciones del personaje del visitante y validación de nombres; lo usan cliente y servidor. Agregar opciones **al final** de cada lista (los guardados usan el índice). Un campo nuevo va al final, con "nada" de primera opción, y se anota en `OPTIONAL` para que los guardados viejos sigan valiendo. Los conjuntos armados del creador están en `src/sections/outfits.ts`.
- `server/`: toda la API (`router.ts`). La corre Vite en desarrollo y las funciones de `api/` en Vercel. Sin las variables de Supabase guarda en `.data/db.json`.
- `admin.html`: moderación (personajes y mensajes de contacto), protegida con `ADMIN_PASSWORD`. Ahí también está el exportador del videoclip (`src/exportar.ts`): cada raro bailando su paso, solo, en secuencia de PNG con fondo transparente (una carpeta por personaje + un CSV con los nombres). Necesita Chrome o Edge de escritorio.
- Variables de entorno: ver `.env.example`. Tablas: `supabase/schema.sql`.
- La fuente pixelada dibuja mal las mayúsculas con tilde: los carteles van sin tilde (`sinTildes` en `src/ui/dom.ts`); la Ñ sí va.
