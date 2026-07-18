import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['public/**', 'node_modules/**', 'coverage/**', 'old version/**'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'unit/**/*.js', 'vite.config.js', 'vitest.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
