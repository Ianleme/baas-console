import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfiguration from './vite.config.js';

export default mergeConfig(
  viteConfiguration,
  defineConfig({
    test: {
      css: true,
      environment: 'jsdom',
      globals: true,
      pool: 'threads',
      maxWorkers: 1,
      setupFiles: ['./src/test/setup.ts']
    }
  })
);
