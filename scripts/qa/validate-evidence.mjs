import fs from 'node:fs';
import assert from 'node:assert/strict';

const path = process.argv[2] ?? 'artifacts/qa/release-candidate/manifest.json';
const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
assert.equal(manifest.schemaVersion, 1);
assert.ok(['PENDING_EXTERNAL_EVIDENCE', 'APPROVED'].includes(manifest.verdict));
assert.ok(Array.isArray(manifest.artifacts));
assert.ok(Array.isArray(manifest.externalGates));
if (manifest.verdict !== 'APPROVED') assert.equal(manifest.generatedAt, null);
console.log(`QA evidence structure valid: ${path}`);
