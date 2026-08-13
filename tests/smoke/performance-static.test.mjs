import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('benchmark harness emits a documented schema', () => {
  const source = fs.readFileSync('tests/performance/benchmark.mjs', 'utf8');
  assert.match(source, /schemaVersion: 1/);
  assert.match(source, /imageDigests/);
  assert.match(source, /hardware/);
  assert.doesNotMatch(source, /p95\s*:/);
});
