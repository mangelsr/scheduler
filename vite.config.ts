import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        planner: resolve(__dirname, 'planner.html'),
        popup: resolve(__dirname, 'popup.html'),
      },
    },
  },
});
