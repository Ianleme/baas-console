import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
const script = fs.readFileSync('scripts/deploy/remote-deploy.sh', 'utf8');

test('deploy workflow has approval, serialization and digest inputs', () => {
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
  assert.match(workflow, /@sha256:/);
  assert.match(script, /StrictHostKeyChecking=yes/);
  assert.match(script, /rollback/);
  assert.doesNotMatch(script, /docker compose down/);
});
