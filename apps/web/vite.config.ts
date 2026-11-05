import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // caminhos relativos: o build funciona em qualquer subpasta do servidor (ou GitHub Pages)
  base: './',
  server: { port: 5174 },
  test: { environment: 'jsdom' },
});
