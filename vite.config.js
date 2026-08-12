import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true, port: 5173, strictPort: true },
  build: { outDir: 'dist', target: 'es2020' },
});
