import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist',
      '**/coverage/**',
      '**/node_modules/**',
      'artifacts/**',
      'packages/api-client/src/generated/**',
      'playwright-report/**',
      'test-results/**'
    ]
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'off'
    }
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
    files: ['**/*.spec.ts', '**/*.test.ts', '**/*.test.tsx', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off'
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
