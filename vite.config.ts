import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * En desarrollo, /api/* lo atiende el mismo código que en producción corren las funciones
 * de Vercel (server/router.ts). Así no hace falta `vercel dev` para probar.
 */
function devApi(): Plugin {
  return {
    name: 'dr-dev-api',
    configureServer(server) {
      Object.assign(process.env, loadEnv(server.config.mode, process.cwd(), ''));
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        try {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
          const request = new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers,
            body: hasBody ? Buffer.concat(chunks) : undefined,
          });
          const { handleApi } = (await server.ssrLoadModule('/server/router.ts')) as typeof import('./server/router');
          const out = await handleApi(request, req.socket.remoteAddress ?? 'local');
          res.statusCode = out.status;
          out.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await out.arrayBuffer()));
        } catch (e) {
          server.ssrFixStacktrace(e as Error);
          console.error(e);
          res.statusCode = 500;
          res.end('{"error":"dev api"}');
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [devApi()],
  // 5173 lo usa el visor de PCX: la web va en otro puerto para poder tener los dos abiertos.
  server: { port: Number(process.env.PORT) || 5180, host: true },
  build: {
    rolldownOptions: { input: { main: 'index.html', admin: 'admin.html' } },
  },
});
