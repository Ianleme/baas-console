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
  { name: 'unit', script: 'test:unit', enabled: false, ownerTask: 'T014' },
  { name: 'integration', script: 'test:integration', enabled: true },
  { name: 'contract', script: 'test:contract', enabled: false, ownerTask: 'T005' },
  { name: 'gherkin', script: 'test:gherkin', enabled: false, ownerTask: 'T016' }
];

export const verificationProfiles = {
  quick: baseStages,
  pr: prStages,
  full: [
    ...prStages,
    { name: 'e2e', script: 'test:e2e', enabled: false, ownerTask: 'T017' },
    { name: 'mutation', script: 'test:mutation', enabled: false, ownerTask: 'T045' },
    { name: 'smoke', script: 'test:smoke', enabled: false, ownerTask: 'T010' },
    {
      name: 'release-evidence',
      script: 'validate:release',
      enabled: false,
      ownerTask: 'T051'
    }
  ],
  live: [
    { name: 'live-contract', script: 'test:live', enabled: false, ownerTask: 'T011' },
    { name: 'live-evidence', script: 'validate:live', enabled: false, ownerTask: 'T011' }
  ]
};
