import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const requiredReports = {
  quick: ['tests'],
  pr: ['tests', 'backend-coverage', 'critical-coverage', 'frontend-coverage', 'traceability'],
  release: [
    'tests',
    'backend-coverage',
    'critical-coverage',
    'frontend-coverage',
    'mutation',
    'traceability',
    'qa-report'
  ],
  live: ['live-evidence']
};

const coverageThresholds = {
  'backend-coverage': { lines: 90, statements: 90, functions: 90, branches: 85 },
  'critical-coverage': { lines: 95, statements: 95, functions: 95, branches: 90 },
  'frontend-coverage': { lines: 85, statements: 85, functions: 85, branches: 80 }
};

export class QualityValidationError extends Error {
  constructor(diagnostics) {
    super(`Quality validation failed with ${diagnostics.length} violation(s)`);
    this.name = 'QualityValidationError';
    this.diagnostics = diagnostics;
  }
}

function diagnostic(code, detail) {
  return `[${code}] ${detail}`;
}

function parseJson(path, code, diagnostics) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    diagnostics.push(
      diagnostic(code, error instanceof Error ? error.message : 'invalid JSON content')
    );
    return undefined;
  }
}

function isPathInside(root, candidate) {
  const result = relative(root, candidate);
  return result !== '' && !result.startsWith('..') && !isAbsolute(result);
}

function validateArtifact(manifestDirectory, report, diagnostics) {
  if (typeof report.path !== 'string' || report.path.length === 0) {
    diagnostics.push(diagnostic('ARTIFACT_PATH_INVALID', `${report.kind}: path is required`));
    return;
  }

  const artifactPath = resolve(manifestDirectory, report.path);
  if (!isPathInside(manifestDirectory, artifactPath)) {
    diagnostics.push(
      diagnostic('ARTIFACT_PATH_INVALID', `${report.kind}: path leaves manifest root`)
    );
    return;
  }
  if (!existsSync(artifactPath)) {
    diagnostics.push(diagnostic('ARTIFACT_MISSING', `${report.kind}: ${report.path}`));
    return;
  }

  const realRoot = realpathSync(manifestDirectory);
  const realArtifact = realpathSync(artifactPath);
  if (!isPathInside(realRoot, realArtifact)) {
    diagnostics.push(diagnostic('ARTIFACT_PATH_INVALID', `${report.kind}: symlink leaves root`));
    return;
  }

  const artifactContent = readFileSync(realArtifact);
  if (typeof report.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(report.sha256)) {
    diagnostics.push(diagnostic('ARTIFACT_HASH_INVALID', `${report.kind}: SHA-256 is required`));
  } else {
    const actualHash = createHash('sha256').update(artifactContent).digest('hex');
    if (actualHash !== report.sha256) {
      diagnostics.push(diagnostic('ARTIFACT_HASH_MISMATCH', `${report.kind}: ${report.path}`));
    }
  }

  let artifactSummary;
  try {
    artifactSummary = JSON.parse(artifactContent.toString('utf8'));
  } catch (error) {
    diagnostics.push(
      diagnostic(
        'ARTIFACT_INVALID',
        `${report.kind}: ${error instanceof Error ? error.message : 'invalid JSON'}`
      )
    );
  }
  if (artifactSummary !== undefined && !isDeepStrictEqual(artifactSummary, report.summary)) {
    diagnostics.push(
      diagnostic(
        'REPORT_SUMMARY_MISMATCH',
        `${report.kind}: manifest summary differs from artifact`
      )
    );
  }

  if (report.sanitized !== true) {
    diagnostics.push(
      diagnostic('SANITIZATION_REQUIRED', `${report.kind}: sanitized=true required`)
    );
  }
}

function validateTestReport(summary, diagnostics) {
  const rules = [
    ['failed', 'TEST_FAILURES'],
    ['skipped', 'TEST_SKIPPED'],
    ['only', 'TEST_ONLY'],
    ['flaky', 'TEST_FLAKY'],
    ['warnings', 'WARNINGS']
  ];
  for (const [field, code] of rules) {
    if (summary?.[field] !== 0) {
      diagnostics.push(diagnostic(code, `tests.${field} must equal 0`));
    }
  }
}

function validateCoverage(kind, summary, diagnostics) {
  const thresholds = coverageThresholds[kind];
  const code = {
    'backend-coverage': 'BACKEND_COVERAGE',
    'critical-coverage': 'CRITICAL_COVERAGE',
    'frontend-coverage': 'FRONTEND_COVERAGE'
  }[kind];
  for (const [metric, minimum] of Object.entries(thresholds)) {
    if (typeof summary?.[metric] !== 'number' || summary[metric] < minimum) {
      diagnostics.push(diagnostic(code, `${kind}.${metric} must be >= ${minimum}`));
    }
  }
}

function validateReport(report, diagnostics) {
  const summary = report.summary;
  if (report.kind === 'tests') {
    validateTestReport(summary, diagnostics);
  } else if (coverageThresholds[report.kind]) {
    validateCoverage(report.kind, summary, diagnostics);
  } else if (report.kind === 'mutation') {
    if (typeof summary?.score !== 'number' || summary.score < 80) {
      diagnostics.push(diagnostic('MUTATION_SCORE', 'mutation.score must be >= 80'));
    }
    if (summary?.noCoverage !== 0) {
      diagnostics.push(diagnostic('MUTATION_NOCOVERAGE', 'mutation.noCoverage must equal 0'));
    }
  } else if (report.kind === 'traceability') {
    if (summary?.sourceCoveragePercent !== 100) {
      diagnostics.push(diagnostic('SOURCE_MAPPING', 'source coverage must equal 100'));
    }
    if (summary?.p1CoveragePercent !== 100) {
      diagnostics.push(diagnostic('P1_MAPPING', 'P1 coverage must equal 100'));
    }
  } else if (report.kind === 'qa-report') {
    if (summary?.verdict !== 'APPROVED') {
      diagnostics.push(diagnostic('QA_VERDICT', 'QA verdict must equal APPROVED'));
    }
    if (
      summary?.completedProcedures !== summary?.requiredProcedures ||
      summary?.requiredProcedures < 12
    ) {
      diagnostics.push(diagnostic('QA_PROCEDURES', 'all 12 required procedures must be complete'));
    }
    if (summary?.completedUat !== summary?.requiredUat || summary?.requiredUat < 8) {
      diagnostics.push(diagnostic('QA_UAT', 'all 8 required UAT cases must be complete'));
    }
    if (summary?.openSeverity1 !== 0 || summary?.openSeverity2 !== 0) {
      diagnostics.push(diagnostic('QA_SEVERE_DEFECT', 'open severity 1/2 defects must equal 0'));
    }
    if (summary?.verifierIndependent !== true) {
      diagnostics.push(
        diagnostic('VERIFIER_NOT_INDEPENDENT', 'independent verifier evidence is required')
      );
    }
  } else if (report.kind === 'live-evidence') {
    if (summary?.authorized !== true) {
      diagnostics.push(
        diagnostic('LIVE_AUTHORIZATION_REQUIRED', 'live run requires explicit authorization')
      );
    }
    if (summary?.sanitized !== true) {
      diagnostics.push(diagnostic('LIVE_EVIDENCE_UNSANITIZED', 'live evidence must be sanitized'));
    }
  }
}

export function validateQualityManifest(manifestPath) {
  if (!manifestPath || !existsSync(manifestPath)) {
    throw new QualityValidationError([
      diagnostic('MANIFEST_MISSING', manifestPath || 'manifest path is required')
    ]);
  }

  const diagnostics = [];
  const manifest = parseJson(manifestPath, 'MANIFEST_INVALID', diagnostics);
  if (!manifest) {
    throw new QualityValidationError(diagnostics);
  }

  const profileRequirements = requiredReports[manifest.profile];
  if (!profileRequirements) {
    diagnostics.push(diagnostic('PROFILE_INVALID', String(manifest.profile)));
  }
  if (manifest.version !== 1) {
    diagnostics.push(diagnostic('MANIFEST_VERSION', 'version must equal 1'));
  }
  if (typeof manifest.commitSha !== 'string' || !/^[a-f0-9]{40}$/u.test(manifest.commitSha)) {
    diagnostics.push(diagnostic('COMMIT_SHA_INVALID', 'commitSha must be a full 40-character SHA'));
  }
  if (!Array.isArray(manifest.reports)) {
    diagnostics.push(diagnostic('REPORTS_INVALID', 'reports must be an array'));
    throw new QualityValidationError(diagnostics);
  }

  const reportsByKind = new Map();
  for (const report of manifest.reports) {
    if (!report || typeof report.kind !== 'string') {
      diagnostics.push(diagnostic('REPORT_KIND_INVALID', 'every report requires kind'));
      continue;
    }
    if (reportsByKind.has(report.kind)) {
      diagnostics.push(diagnostic('REPORT_DUPLICATE', report.kind));
      continue;
    }
    reportsByKind.set(report.kind, report);
    validateArtifact(dirname(manifestPath), report, diagnostics);
    validateReport(report, diagnostics);
  }

  for (const requiredKind of profileRequirements ?? []) {
    if (!reportsByKind.has(requiredKind)) {
      diagnostics.push(diagnostic('REPORT_REQUIRED', requiredKind));
    }
  }

  if (diagnostics.length > 0) {
    throw new QualityValidationError(diagnostics);
  }

  return { profile: manifest.profile, reportCount: manifest.reports.length };
}

const invokedAsScript = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedAsScript) {
  try {
    const result = validateQualityManifest(process.argv[2]);
    process.stdout.write(
      `QUALITY_VALIDATION_OK profile=${result.profile} reports=${result.reportCount}\n`
    );
  } catch (error) {
    if (error instanceof QualityValidationError) {
      for (const item of error.diagnostics) {
        process.stderr.write(`${item}\n`);
      }
    } else {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    }
    process.exitCode = 1;
  }
}
