import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('sanitized QA template validates without approval claim', () => {
  execFileSync(process.execPath, ['scripts/qa/validate-evidence.mjs'], { stdio: 'pipe' });
});
