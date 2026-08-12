import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { verificationProfiles } from './verification.config.mjs';

export function resolveProfileStages(
  profile,
  { availableScripts, requireAvailableScripts = false } = {}
) {
  const configuredStages = verificationProfiles[profile];
  if (!configuredStages) {
    throw new Error(`VERIFICATION_PROFILE_UNKNOWN: ${profile}`);
  }

  if (requireAvailableScripts && availableScripts) {
    for (const stage of configuredStages) {
      if (stage.enabled && !availableScripts.has(stage.script)) {
        throw new Error(`VERIFICATION_SCRIPT_MISSING: ${stage.script}`);
      }
    }
  }

  return configuredStages.map((stage) => ({ ...stage }));
}

function readAvailableScripts() {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  return new Set(Object.keys(packageJson.scripts ?? {}));
}

export function runVerification(profile) {
  const stages = resolveProfileStages(profile, {
    availableScripts: readAvailableScripts(),
    requireAvailableScripts: true
  });

  for (const stage of stages) {
    if (!stage.enabled) {
      process.stdout.write(`DEFERRED ${stage.name} until ${stage.ownerTask}\n`);
      continue;
    }

    process.stdout.write(`RUN ${stage.name}: npm run ${stage.script}\n`);
    const npmCli = process.env.npm_execpath;
    if (!npmCli) {
      throw new Error('VERIFICATION_NPM_CLI_MISSING: invoke the profile through an npm script');
    }
    const result = spawnSync(process.execPath, [npmCli, 'run', stage.script], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      encoding: 'utf8',
      stdio: 'inherit'
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`VERIFICATION_STAGE_FAILED: ${stage.name} exited ${result.status}`);
    }
  }
}

const invokedAsScript = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedAsScript) {
  try {
    runVerification(process.argv[2]);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
