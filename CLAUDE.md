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
- Backend: Supabase (Postgres + Storage) para personajes y fotos.
- Hosting: Vercel o Cloudflare Pages. Dominio: discosraros.com.ar.
- Anti-spam sin registro: Cloudflare Turnstile + límite por IP + 1 personaje por dispositivo.

## Restricciones técnicas conocidas

- **Audio desde YouTube**: se usa el YouTube IFrame API. No se puede leer el audio, así que no hay audio-reactividad real: el baile se sincroniza a un BPM fijo o aproximado por set. El player tiene que quedar visible. Idea: mostrarlo como la "tele" o pantalla del club con CSS3DRenderer.
- **Autoplay**: los navegadores bloquean el sonido hasta que haya un click, así que la pantalla de entrada tiene un botón tipo "PRESS START".
- **Último set automático**: se busca el último video del canal (YouTube Data API desde una función serverless, cacheado). Hay que filtrar solo sets (por playlist o título).
- **Pista infinita**: nunca se renderizan todos los personajes. Se usa instancing y se muestran como máximo unos 150 a la vez (el tuyo siempre, más los recientes y una muestra aleatoria), con contador total ("1.234 raros en la pista").
- **Personaje del visitante**: menú de personalización (cuerpo, colores, ropa, accesorios) + nombre visible. **Sin foto de cara** (se descartó: mucho quilombo de moderación). Lo único a moderar es el nombre.
- **Mobile**: el boiler room tiene que andar en celular (con menos personajes y menos resolución). El juego de pelea es solo para desktop.

## Modelos 3D

- Discos y Raros ya existen en la app de PCX (`psx-viewer/characters/characters.json`), armados por código: **`persona1` = Discos**, **`persona2` = Raros**. Para el MVP van con los outfits que tienen ahí (más adelante pueden cambiar).
- Discos y Raros son el mismo modelo low-poly en la cabina y en el juego de pelea: se hacen una vez y se reutilizan.
- Se pueden armar en Blender (o generar con IA y bajarles polígonos), riggear y animar con Mixamo, exportar a glTF/GLB y guardar en `public/models/`.
- Mientras no estén, se usan placeholders hechos con primitivas.

## Convenciones

- Hablar en español rioplatense en commits y comentarios de UI.
- Commits chicos, uno por feature.
- Probar siempre en Chrome desktop y en un celular de gama media.
