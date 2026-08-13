import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('observability is opt-in and private', () => {
  const compose = fs.readFileSync('docker-compose.prod.yml', 'utf8');
  assert.match(compose, /profiles: \[observability\]/);
  assert.match(compose, /ops: \{internal: true\}/);
  assert.doesNotMatch(compose, /prometheus:\n(?:.|\n)*?ports:/);
  const dashboard = JSON.parse(fs.readFileSync('observability/grafana/dashboards/baas-overview.json', 'utf8'));
  assert.ok(dashboard.panels.length >= 5);
});
