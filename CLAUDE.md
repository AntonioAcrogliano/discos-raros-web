# Discos Raros — Web

Sitio oficial de **Discos Raros**, dúo de DJs argentino con estética bizarra. Dos integrantes: **Discos** y **Raros**.
Suben un set nuevo por semana en YouTube (@discosraros), cada uno de un estilo distinto (techno, house, DnB, psytrance, garage, UK garage…).
Redes: YouTube @discosraros · Instagram @discosraros.arg · Kick discosRaros.

## Qué es el sitio

1. **Home = Boiler Room 3D**: una pista low-poly estilo PS1 con Discos y Raros en la cabina. Suena el último set de YouTube. Los visitantes crean un personaje y queda bailando en la pista para siempre.
2. **Sets**: links a los sets (YouTube).
3. **Chat** (`#/chat`): el chat de la pista, con lo último que se escribió y lo nuevo al instante. Para escribir hay que tener raro, y lo que escribís sale en un globito arriba de tu raro.
4. **Contacto**: por ahora manda al Instagram (mensaje directo). El formulario con aviso por mail queda para más adelante; la API `/api/contact` y los mensajes del admin siguen estando.
5. **Juegos** (Discos vs Raros: pelea 3D estilo PS1 / Tekken 1; Cabezazos: fútbol de cabezones), 1 jugador vs CPU. En la compu con teclado o joystick; en el celular con controles táctiles, acostado.

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

- **Audio desde YouTube**: se usa el YouTube IFrame API. El audio no se puede leer en el navegador, así que cada set se analiza aparte, una vez: `npm run luces` (`scripts/luces.mjs`, necesita yt-dlp y ffmpeg) baja el audio y deja `public/luces/<id>.bin` con el volumen de graves, medios y agudos y el momento de cada beat. El sitio lo sigue con el reloj del player (`src/scenes/boiler/luces.ts`): las luces laten con el bombo de verdad, la pista afloja en los cortes y el baile cae en el beat. **Cada set nuevo hay que analizarlo** (correr `npm run luces` y subir el archivo); el que no tiene archivo baila a un BPM aproximado por género, como antes. El player tiene que quedar visible: es la tele del club (CSS3DRenderer).
- **Autoplay**: los navegadores bloquean el sonido hasta que haya un click, así que la pantalla de entrada tiene un botón tipo "PRESS START".
- **Entrada**: el sitio arranca en la vereda del boliche (`src/scenes/boiler/afuera.ts`). El set se pone apenas carga la página, mudo (es lo único que deja el navegador antes del primer click). Al apretar PRESS START se le da sonido bajito (se lo escucha "de afuera") y se camina a la puerta; el patova te mira, revisa la lista, te hace pasar y abre él las hojas, y el volumen sube mientras se entra a la pista (un segundo toque saltea la espera de la lista). Si el visitante todavía no tiene raro, ahí tiene que armarlo: se abre el creador completo (el mismo de TU RARO, en modo `door`, sin forma de cerrarlo) con el personaje parado en la vereda frente al patova, y no se entra hasta guardarlo; después entra caminando (`src/sections/puerta.ts`). El que ya tiene raro pasa directo. En iPhone el volumen del player no se maneja (suena a volumen normal desde que se aprieta) y el sonido solo se puede prender adentro del mismo toque: por eso PRESS START llama a `room.unlockSound()` en el click, sin esperar a la animación.
- **Patio de juegos**: al abrir el menú de juegos la cámara sale al patio (mismo archivo) y el set baja al 40%. Los dos juegos se juegan ahí: están armados alrededor del origen y su `group` se muda entero a `PATIO`. De la línea de la cancha (`PATIO.gameZ`) hacia la cámara no puede haber muebles.
- **Pista infinita**: nunca se renderizan todos los personajes. Se usa instancing y se muestran como máximo 260 a la vez en la compu y 90 en el celu (el tuyo siempre, más los recientes y una muestra aleatoria), con contador total ("1.234 raros en la pista"). Con poca gente no se desparraman: se quedan cerca de la cabina, y ocupan el fondo y los palcos a medida que se llena.
- **Personaje del visitante**: menú de personalización (cuerpo, colores, ropa, accesorios) + nombre visible + una frase opcional (hasta 40 letras) que el raro dice en un globito cuando alguien lo toca en la pista. **Sin foto de cara** (se descartó: mucho quilombo de moderación). Lo que hay que moderar es el nombre y la frase: los dos pasan por el mismo filtro de insultos (`shared/look.ts`) y se ven en el admin.
- **Mobile**: el boiler room tiene que andar en celular (con menos personajes y menos resolución). Los juegos también: stick y botones en pantalla (`src/juegos/touch.ts`), que "aprietan teclas" de mentira, así usan los mismos controles que el teclado. Se juega acostado. Con el celu parado (iPhone con el giro trabado: la página no gira nunca) el juego se dibuja acostado igual y se gira por CSS (`html.acostado`, lo pone `touch.ts`), así se juega girando el celu a mano; los toques sobre la capa de textos pasan por `layerPoint`.

## Modelos 3D

- Discos y Raros ya existen en la app de PCX (`psx-viewer/characters/characters.json`), armados por código: **`persona1` = Discos**, **`persona2` = Raros**. Van con outfits del guardarropa de la app (`src/wardrobe.ts`): Discos con `deportivo` y Raros con `rockero`, más sus accesorios de siempre (piluso, anteojos).
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
- El boliche (`club.ts`) mantiene su look de siempre: paredes violetas, baldosas que cambian con el beat, haces de colores de la marca y bola de espejos. `club.light` es esa misma luz latiendo con el bombo (la aplica `index.ts`). Nada de fogonazos a pantalla completa.
- El que tiene raro lo maneja en la pista (en la compu, WASD o un clic en el piso o en otro raro; en el celu, con la palanca de abajo a la izquierda, `mountStick` en `shell.ts`, y no tocando el piso): `crowd.walkTo` / `steer`, y la cámara lo sigue (`follow` en `index.ts`). El que no tiene, mueve la cámara sola.
- Compartir (`src/sections/compartir.ts`, ruta `#/compartir`, se carga recién al pedirla): arma la foto vertical de 1080×1920 del raro para historias. Lo importante va entre el 13% y el 87% del alto, que es lo que Instagram deja libre.
- La frase del raro se guarda adentro de la columna `look` (JSON), como `frase`, para no tocar las tablas de Supabase; `server/store.ts` la separa y de ahí para afuera viaja como `phrase`.
- El boliche tiene dos alturas (`floorAt` en `club.ts`): la pista y los palcos (`PALCO`, una U de 4,2 m contra el fondo y los costados, con una escalera a la pista en cada punta). Hubo un segundo piso y se sacó (quedaba tosco): no volver a ponerlo sin que lo pidan. Todo es macizo: la altura del piso depende solo de (x, z); nadie cambia de nivel de un salto (`keepLevel` en `crowd.ts`), así que los bordes hacen de pared, y nadie se arrima a menos de `EDGE` de un borde (si no, la baranda le atraviesa el cuerpo), y para ir de un nivel a otro se arma un camino por las escaleras (`route`). De un costado al otro se cruza por atrás de la cabina, nunca por adelante (ahí está la cámara).
- Las medidas salen todas de `CLUB` y `PALCO`: para agrandar el boliche se tocan ahí.
- Lugares del boliche (todo en `club.ts`, con sus medidas en `BARRA`, `PASILLO`, `BANO` y `LOUNGE`): la **barra** en el palco del fondo, a la derecha de la tele (los dos barmans son un `Crowd` aparte, con el paso `BARMAN`); el **pasillo** que sale por la pared del fondo, a la izquierda de la tele, y termina en el **baño** (a la altura del palco, no se ve desde la pista: hay que ir); **sillones y mesas altas** en los brazos del palco (los sillones contra la pared, entre las pilastras); y **leds** en el filo de cada escalón, que suben con el bombo. Los muebles son macizos (`BLOCKS` en `crowd.ts`) y el pasillo y el baño tienen paredes (`inWalls`); la cámara no sale de la caja en la que está el raro (`roomAt`). Todo lo quieto del club y de la cabina se junta por material al final (`bake`): una pieza nueva que se mueva o se prenda y apague hay que anotarla en `keep`, si no queda pegada. Las paredes de ladrillo comparten material (`wallMat`) para juntarse. En `crowd.ts`, las mallas de prendas que no lleva nadie se apagan (`visible`): vacías igual costaban una llamada cada una.
- **Sótano** (`src/scenes/boiler/sotano.ts`, medidas en `SOTANO` y `ESCALERA` de `club.ts`): se baja por un túnel con escalera que sale de la pared derecha del pasillo; es un cuarto bajo con luz roja y dos caños. En cada caño baila uno armado a mano con cilindros y esferas de pocos lados (como el patova, no son raros; las piezas de cada articulación se juntan con `bake`): una parodia de hombre araña en sunga y una de pelado amarillo y panzón en calzones. Son parodias: sin logos ni nombres. Caminando, atrás de la pared del fondo hay tres zonas en fila (baño, pasillo, sótano: `zone` y `backPath` en `crowd.ts`), y lo que se pisa son rectángulos que se tocan solo en las puertas (`BACK_AREAS`).
- Lugares para uno solo (`Place` en `crowd.ts`): un asiento de sillón, un lugar en la barra o en una mesa alta, el espejo del baño, la pared del pasillo, al lado de los caños del sótano. A los que pasean les pinta ir a uno libre; al llegar miran para donde corresponde y hacen lo suyo (en la barra y las mesas toman algo, en el pasillo fuman, en el espejo se saludan solos). Los sentados no se empujan. La fachada de la vereda y el patio se acomodan solos al ancho.
- Grupitos (`mingle` en `crowd.ts`): cada tanto un raro junta a los 2 a 5 que tiene más cerca en su mismo nivel y bailan en ronda, mirándose; a los 18 a 40 segundos la ronda se desarma y se arman otras. Como mucho un tercio de la pista anda en rondas (`GROUPED`). El raro del visitante no entra: lo maneja él.
- Acciones del raro (`action` en `dances.ts`: pucho, agua, saludo, salto, pasti): teclas 1 a 5 o los botones de la derecha (`setActions` en `shell.ts`). La 6 es SENTARSE (`Crowd.sit`): va solo al sillón libre más cercano (siempre llega por adelante del asiento) y se sienta, y la cámara se pone de frente (`faceSeat` en `index.ts`); otra vez, o caminando, se para. Los sillones son macizos para los demás (`SOFAS` en `crowd.ts`). A los demás les pinta cada tanto, y el más cercano devuelve el saludo. No es en vivo: cada visitante ve solo las suyas.
- La pasti le pone la pantalla rara al que la toma, unos 30 segundos y solo en la pista: `post.trip` ondula la imagen y da vuelta los colores despacio (sin fogonazos), y la tele acompaña con un filtro de CSS porque el video va por atrás del dibujo.
- Del otro lado de una pared la música llega más baja (`muffle` en `index.ts`): un poco en el pasillo y bastante en el baño y en el sótano. Ahogada de verdad (sin agudos) no se puede: el audio es del player de YouTube y el navegador no deja meterle filtros.
- El volumen se maneja desde el cartel del reproductor (`tele.level`, el mismo tope que mueve el control de YouTube) y se recuerda en `localStorage`. En iPhone no se muestra: ahí manda el teléfono.
- Cada tanto un raro cercano dice su frase solo (`chat` en `index.ts`). Los carteles de nombres y el globito no se pisan (`fit`).
- La versión "antro de Berlín" (hormigón, luces por escenas, láseres) quedó guardada en la rama `antro-berlin` para más adelante: no está en uso. No cambiar la estética del sitio sin que lo pidan.
- Juegos (se cargan recién al entrar, se juegan en el patio y manejan la cámara con `room.takeover`): `src/pelea/` (Discos vs Raros) y `src/futbol/` (Cabezazos; la física y la CPU están en `game.ts`, sin Three.js, así se pueden simular partidos con Node para ajustar la dificultad).
- `src/ui/` y `src/sections/`: barra, ventanas y secciones (Sets, Crear tu raro, Contacto). Rutas por hash (`#/sets`…).
- `shared/look.ts`: opciones del personaje del visitante y validación de nombres; lo usan cliente y servidor. Agregar opciones **al final** de cada lista (los guardados usan el índice). Un campo nuevo va al final, con "nada" de primera opción, y se anota en `OPTIONAL` para que los guardados viejos sigan valiendo. Los conjuntos armados del creador están en `src/sections/outfits.ts`.
- Chat (`src/chat.ts`, ventana en `src/sections/chat.ts`, tabla `chat` en `supabase/schema.sql`): los mensajes se guardan y se leen por la API (`/api/chat`, mismo filtro de insultos que nombres y frases: `cleanChat` en `shared/look.ts`; deja emojis pero no `:` ni `/`, así no entran links; 6 por minuto por IP; se borran solos a la semana). Lo en vivo es un canal de Supabase Realtime (`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`) que hace solo de timbre: avisa que hay algo nuevo y cada uno se lo pide a la API; lo que viaja por el canal nunca se muestra. El mismo canal cuenta los conectados (presence). Sin esas variables, con el chat abierto se pregunta cada 8 segundos. Los mensajes nuevos salen en el globito arriba del raro que los escribió (`room.say`). En el admin se ven y se borran.
- `server/`: toda la API (`router.ts`). La corre Vite en desarrollo y las funciones de `api/` en Vercel. Sin las variables de Supabase guarda en `.data/db.json`.
- `admin.html`: moderación (personajes y mensajes de contacto), protegida con `ADMIN_PASSWORD`. Ahí también está el exportador del videoclip (`src/exportar.ts`): cada raro bailando su paso, solo, en secuencia de PNG con fondo transparente (una carpeta por personaje + un CSV con los nombres). Necesita Chrome o Edge de escritorio.
- Variables de entorno: ver `.env.example`. Tablas: `supabase/schema.sql`.
- La fuente pixelada dibuja mal las mayúsculas con tilde: los carteles van sin tilde (`sinTildes` en `src/ui/dom.ts`); la Ñ sí va.
