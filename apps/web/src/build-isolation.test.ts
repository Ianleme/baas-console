import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { build, mergeConfig } from 'vite';

import baseConfiguration from '../vite.config.js';

describe('Vite surfaces', () => {
  test('builds app and pay as distinct entry chunks', async () => {
    const outDirectory = mkdtempSync(join(tmpdir(), 'baas-web-build-'));
    try {
      await build(
        mergeConfig(baseConfiguration, {
          build: { emptyOutDir: true, outDir: outDirectory },
          logLevel: 'silent'
        })
      );
      const appHtml = readFileSync(join(outDirectory, 'app.html'), 'utf8');
      const payHtml = readFileSync(join(outDirectory, 'pay.html'), 'utf8');
      const appEntry = /src="([^"]+\.js)"/u.exec(appHtml)?.[1];
      const payEntry = /src="([^"]+\.js)"/u.exec(payHtml)?.[1];
      expect(appEntry).toBeTruthy();
      expect(payEntry).toBeTruthy();
      expect(appEntry).not.toBe(payEntry);
      expect(appHtml).not.toContain('src/pay/main');
      expect(payHtml).not.toContain('src/app/main');
    } finally {
      rmSync(outDirectory, { force: true, recursive: true });
    }
  }, 30_000);
});
