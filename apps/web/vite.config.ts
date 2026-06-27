import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@pobd/schemas': path.resolve(__dirname, '../../packages/schemas/src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
    open: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
