const baseStages = [
  { name: 'format', script: 'format:check', enabled: true },
  { name: 'lint', script: 'lint', enabled: true },
  { name: 'types', script: 'typecheck', enabled: true },
  { name: 'quality-tests', script: 'test:quality', enabled: true },
  { name: 'web', script: 'test:web', enabled: true },
  { name: 'build', script: 'build', enabled: true }
];

const prStages = [
  ...baseStages,
  { name: 'unit', script: 'test:unit', enabled: true, ownerTask: 'T014' },
  { name: 'integration', script: 'test:integration', enabled: true },
  { name: 'contract', script: 'test:contract', enabled: true },
  { name: 'gherkin', script: 'test:gherkin', enabled: true, ownerTask: 'T016' },
  { name: 'e2e', script: 'test:e2e', enabled: true, ownerTask: 'T017' }
];

export const verificationProfiles = {
  quick: baseStages,
  pr: prStages,
  full: [
    ...prStages,
    { name: 'mutation', script: 'test:mutation', enabled: false, ownerTask: 'T045' },
    { name: 'smoke', script: 'test:smoke', enabled: true, ownerTask: 'T010' },
    {
      name: 'release-evidence',
      script: 'validate:release',
      enabled: false,
      ownerTask: 'T051'
    }
  ],
  live: [
    { name: 'live-contract', script: 'test:live', enabled: true, ownerTask: 'T011' },
    { name: 'live-evidence', script: 'validate:live', enabled: true, ownerTask: 'T011' }
  ]
};
