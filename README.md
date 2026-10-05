# Discos Raros — Web

Sitio de Discos Raros: boiler room 3D estilo PS1 con el último set sonando, sets, contacto,
personajes de los visitantes bailando en la pista y el juego de pelea Discos vs Raros.

```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # chequea tipos y compila a dist/
```

Sin configurar nada funciona todo en local: los personajes y los mensajes se guardan en
`.data/db.json`. El panel de moderación está en `/admin.html` (clave: `ADMIN_PASSWORD` de `.env.local`).

## Publicarlo

1. **Supabase**: crear un proyecto, abrir *SQL Editor*, pegar `supabase/schema.sql` y correrlo.
   De *Project Settings → API* salen `SUPABASE_URL` y la *service role key* (`SUPABASE_SERVICE_KEY`).
2. **Vercel**: importar el repo (detecta Vite solo; la carpeta `api/` son las funciones).
   Cargar en *Settings → Environment Variables* las de `.env.example`.
3. **Dominio**: en Vercel → *Domains* agregar `discosraros.com.ar` y poner en NIC/el DNS los registros que indica.
4. **Turnstile** (opcional, anti-robots): crear un widget en Cloudflare para el dominio y cargar
   `VITE_TURNSTILE_SITEKEY` y `TURNSTILE_SECRET`.

La estructura del código y las reglas de estética están en `CLAUDE.md`.
