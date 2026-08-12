import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'artifacts/**',
      'packages/api-client/src/generated/**',
      'playwright-report/**',
      'test-results/**'
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx']
  })),
  ...tseslint.configs.stylisticTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx']
  })),
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error'
    }
  },
  {
    files: ['apps/api/test/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./apps/api/tsconfig.test.json'],
        projectService: false,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    files: ['packages/api-client/test/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./packages/api-client/tsconfig.consumer.json'],
        projectService: false,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    files: ['apps/web/src/**/*.ts', 'apps/web/src/**/*.tsx'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message: 'Use @baas/api-client instead of a feature-level handwritten HTTP call.'
        }
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'axios',
              message: 'Use @baas/api-client instead of a feature-level handwritten HTTP client.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: globals.node
    }
  },
  eslintConfigPrettier
);
