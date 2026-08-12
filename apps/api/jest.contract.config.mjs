export default {
  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/contract/**/*.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': [
      '@swc/jest',
      {
        jsc: { parser: { syntax: 'typescript' }, target: 'es2023' },
        module: { type: 'es6' }
      }
    ]
  }
};
