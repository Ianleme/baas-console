import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { QualityValidationError, validateQualityManifest } from './validate-quality.mjs';
import { verificationProfiles } from './verification.config.mjs';
import { resolveProfileStages } from './run-verification.mjs';

const validReports = {
  tests: {
    failed: 0,
    skipped: 0,
    only: 0,
    flaky: 0,
    warnings: 0
  },
  'backend-coverage': {
    lines: 90,
    statements: 90,
    functions: 90,
    branches: 85
  },
  'critical-coverage': {
    lines: 95,
    statements: 95,
    functions: 95,
    branches: 90
  },
  'frontend-coverage': {
    lines: 85,
    statements: 85,
    functions: 85,
    branches: 80
  },
  mutation: {
    score: 80,
    noCoverage: 0
  },
  traceability: {
    sourceCoveragePercent: 100,
    p1CoveragePercent: 100
  },
  'qa-report': {
    verdict: 'APPROVED',
    openSeverity1: 0,
    openSeverity2: 0,
    completedProcedures: 12,
    requiredProcedures: 12,
    completedUat: 8,
    requiredUat: 8,
    verifierIndependent: true
  },
  'live-evidence': {
    authorized: true,
    sanitized: true
  }
};

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function createFixture(profile = 'release') {
  const root = mkdtempSync(join(tmpdir(), 'baas-quality-'));
  const reportsDirectory = join(root, 'reports');
  mkdirSync(reportsDirectory);

  const requiredKinds = {
    quick: ['tests'],
    pr: ['tests', 'backend-coverage', 'critical-coverage', 'frontend-coverage', 'traceability'],
    release: Object.keys(validReports).filter((kind) => kind !== 'live-evidence'),
    live: ['live-evidence']
  }[profile];

  const reports = requiredKinds.map((kind) => {
    const relativePath = `reports/${kind}.json`;
    const content = `${JSON.stringify(validReports[kind])}\n`;
    writeFileSync(join(root, relativePath), content, 'utf8');
    return {
      kind,
      path: relativePath,
      sha256: sha256(content),
      sanitized: true,
      summary: structuredClone(validReports[kind])
    };
  });

  const manifest = {
    version: 1,
    profile,
    commitSha: '0123456789abcdef0123456789abcdef01234567',
    reports
  };
  const manifestPath = join(root, 'manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  return {
    manifest,
    manifestPath,
    rewrite() {
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    },
    root
  };
}

function expectDiagnostic(profile, mutate, code) {
  const fixture = createFixture(profile);
  mutate(fixture);
  fixture.rewrite();
  assert.throws(
    () => validateQualityManifest(fixture.manifestPath),
    (error) =>
      error instanceof QualityValidationError &&
      error.diagnostics.some((diagnostic) => diagnostic.startsWith(`[${code}]`))
  );
}

test('accepts a complete release artifact manifest', () => {
  const fixture = createFixture('release');
  const result = validateQualityManifest(fixture.manifestPath);
  assert.equal(result.profile, 'release');
  assert.equal(result.reportCount, 7);
});

test('rejects a missing manifest', () => {
  assert.throws(
    () => validateQualityManifest(join(tmpdir(), 'missing-baas-quality-manifest.json')),
    (error) =>
      error instanceof QualityValidationError &&
      error.diagnostics.some((item) => item.startsWith('[MANIFEST_MISSING]'))
  );
});

test('rejects invalid manifest JSON', () => {
  const fixture = createFixture('quick');
  writeFileSync(fixture.manifestPath, '{', 'utf8');
  assert.throws(
    () => validateQualityManifest(fixture.manifestPath),
    (error) =>
      error instanceof QualityValidationError &&
      error.diagnostics.some((item) => item.startsWith('[MANIFEST_INVALID]'))
  );
});

for (const [mutate, code, label] of [
  [(manifest) => (manifest.profile = 'unknown'), 'PROFILE_INVALID', 'unknown profile'],
  [(manifest) => (manifest.version = 2), 'MANIFEST_VERSION', 'unknown version'],
  [(manifest) => (manifest.commitSha = 'short'), 'COMMIT_SHA_INVALID', 'short commit SHA'],
  [(manifest) => (manifest.reports = null), 'REPORTS_INVALID', 'non-array reports']
]) {
  test(`rejects malformed manifest metadata: ${label}`, () => {
    const fixture = createFixture('quick');
    mutate(fixture.manifest);
    fixture.rewrite();
    assert.throws(
      () => validateQualityManifest(fixture.manifestPath),
      (error) =>
        error instanceof QualityValidationError &&
        error.diagnostics.some((item) => item.startsWith(`[${code}]`))
    );
  });
}

test('rejects a report without a kind', () => {
  expectDiagnostic(
    'quick',
    ({ manifest }) => {
      delete manifest.reports[0].kind;
    },
    'REPORT_KIND_INVALID'
  );
});

test('rejects duplicate report kinds', () => {
  expectDiagnostic(
    'quick',
    ({ manifest }) => {
      manifest.reports.push(structuredClone(manifest.reports[0]));
    },
    'REPORT_DUPLICATE'
  );
});

test('rejects a missing required report', () => {
  expectDiagnostic(
    'release',
    ({ manifest }) => {
      manifest.reports = manifest.reports.filter((report) => report.kind !== 'mutation');
    },
    'REPORT_REQUIRED'
  );
});

test('rejects a report whose artifact file is missing', () => {
  expectDiagnostic(
    'quick',
    ({ manifest }) => {
      manifest.reports[0].path = 'reports/missing.json';
    },
    'ARTIFACT_MISSING'
  );
});

test('rejects an artifact path outside the manifest root', () => {
  expectDiagnostic(
    'quick',
    ({ manifest }) => {
      manifest.reports[0].path = '../outside.json';
    },
    'ARTIFACT_PATH_INVALID'
  );
});

test('rejects a malformed artifact hash', () => {
  expectDiagnostic(
    'quick',
    ({ manifest }) => {
      manifest.reports[0].sha256 = 'not-a-sha';
    },
    'ARTIFACT_HASH_INVALID'
  );
});

test('rejects an artifact hash mismatch', () => {
  expectDiagnostic(
    'quick',
    ({ manifest }) => {
      manifest.reports[0].sha256 = 'f'.repeat(64);
    },
    'ARTIFACT_HASH_MISMATCH'
  );
});

test('rejects artifact JSON that cannot be parsed', () => {
  const fixture = createFixture('quick');
  const report = fixture.manifest.reports[0];
  const artifactPath = join(fixture.root, report.path);
  writeFileSync(artifactPath, '{', 'utf8');
  report.sha256 = sha256('{');
  fixture.rewrite();
  assert.throws(
    () => validateQualityManifest(fixture.manifestPath),
    (error) =>
      error instanceof QualityValidationError &&
      error.diagnostics.some((item) => item.startsWith('[ARTIFACT_INVALID]'))
  );
});

test('rejects a manifest summary that differs from the hashed artifact', () => {
  expectDiagnostic(
    'quick',
    ({ manifest }) => {
      manifest.reports[0].summary.unverified = true;
    },
    'REPORT_SUMMARY_MISMATCH'
  );
});

test('rejects unsanitized evidence', () => {
  expectDiagnostic(
    'quick',
    ({ manifest }) => {
      manifest.reports[0].sanitized = false;
    },
    'SANITIZATION_REQUIRED'
  );
});

for (const [field, code] of [
  ['failed', 'TEST_FAILURES'],
  ['skipped', 'TEST_SKIPPED'],
  ['only', 'TEST_ONLY'],
  ['flaky', 'TEST_FLAKY'],
  ['warnings', 'WARNINGS']
]) {
  test(`rejects test report violation: ${field}`, () => {
    expectDiagnostic(
      'quick',
      ({ manifest }) => {
        manifest.reports[0].summary[field] = 1;
      },
      code
    );
  });
}

for (const [kind, field, value, code] of [
  ['backend-coverage', 'lines', 89.99, 'BACKEND_COVERAGE'],
  ['critical-coverage', 'branches', 89.99, 'CRITICAL_COVERAGE'],
  ['frontend-coverage', 'functions', 84.99, 'FRONTEND_COVERAGE']
]) {
  test(`rejects threshold violation: ${kind}.${field}`, () => {
    expectDiagnostic(
      'pr',
      ({ manifest }) => {
        const report = manifest.reports.find((candidate) => candidate.kind === kind);
        report.summary[field] = value;
      },
      code
    );
  });
}

test('rejects mutation score below 80 percent', () => {
  expectDiagnostic(
    'release',
    ({ manifest }) => {
      manifest.reports.find((report) => report.kind === 'mutation').summary.score = 79.99;
    },
    'MUTATION_SCORE'
  );
});

test('rejects mutation NoCoverage above zero', () => {
  expectDiagnostic(
    'release',
    ({ manifest }) => {
      manifest.reports.find((report) => report.kind === 'mutation').summary.noCoverage = 1;
    },
    'MUTATION_NOCOVERAGE'
  );
});

test('rejects incomplete source mapping', () => {
  expectDiagnostic(
    'pr',
    ({ manifest }) => {
      manifest.reports.find(
        (report) => report.kind === 'traceability'
      ).summary.sourceCoveragePercent = 99.99;
    },
    'SOURCE_MAPPING'
  );
});

test('rejects incomplete P1 mapping', () => {
  expectDiagnostic(
    'pr',
    ({ manifest }) => {
      manifest.reports.find((report) => report.kind === 'traceability').summary.p1CoveragePercent =
        99.99;
    },
    'P1_MAPPING'
  );
});

for (const [mutate, code, label] of [
  [
    (summary) => {
      summary.verdict = 'BLOCKED';
    },
    'QA_VERDICT',
    'blocked verdict'
  ],
  [
    (summary) => {
      summary.completedProcedures = 11;
    },
    'QA_PROCEDURES',
    'incomplete procedures'
  ],
  [
    (summary) => {
      summary.completedUat = 7;
    },
    'QA_UAT',
    'incomplete UAT'
  ],
  [
    (summary) => {
      summary.openSeverity2 = 1;
    },
    'QA_SEVERE_DEFECT',
    'open severe defect'
  ],
  [
    (summary) => {
      summary.verifierIndependent = false;
    },
    'VERIFIER_NOT_INDEPENDENT',
    'self-verification'
  ]
]) {
  test(`rejects QA evidence violation: ${label}`, () => {
    expectDiagnostic(
      'release',
      ({ manifest }) => {
        mutate(manifest.reports.find((report) => report.kind === 'qa-report').summary);
      },
      code
    );
  });
}

test('rejects live evidence without explicit authorization', () => {
  expectDiagnostic(
    'live',
    ({ manifest }) => {
      manifest.reports[0].summary.authorized = false;
    },
    'LIVE_AUTHORIZATION_REQUIRED'
  );
});

test('rejects unsanitized live evidence summary', () => {
  expectDiagnostic(
    'live',
    ({ manifest }) => {
      manifest.reports[0].summary.sanitized = false;
    },
    'LIVE_EVIDENCE_UNSANITIZED'
  );
});

test('defines all four verification profiles and exposes deferred stages', () => {
  assert.deepEqual(Object.keys(verificationProfiles), ['quick', 'pr', 'full', 'live']);
  const fullStages = resolveProfileStages('full');
  assert.ok(fullStages.some((stage) => stage.name === 'mutation' && !stage.enabled));
  // Authorized T010 transition: container smoke is now an enforced release gate.
  assert.ok(
    fullStages.some(
      (stage) => stage.name === 'smoke' && stage.enabled && stage.script === 'test:smoke'
    )
  );
});

test('fails explicitly when an enabled verification stage has no npm script', () => {
  assert.throws(
    () =>
      resolveProfileStages('quick', {
        availableScripts: new Set(['format:check']),
        requireAvailableScripts: true
      }),
    /VERIFICATION_SCRIPT_MISSING/
  );
});
