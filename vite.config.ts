import { defineConfig } from 'vite';

export default defineConfig({
  // 5173 lo usa el visor de PCX: la web va en otro puerto para poder tener los dos abiertos.
  server: { port: 5180, host: true },
});
