import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = process.cwd();

export default defineConfig({
  plugins: [react()],
  root,
  build: {
    manifest: true,
    rollupOptions: {
      input: {
        app: resolve(root, 'app.html'),
        pay: resolve(root, 'pay.html')
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js'
      }
    },
    sourcemap: false,
    target: 'es2023'
  }
});
