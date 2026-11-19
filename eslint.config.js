import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  // experiment/ is scratch space.
  { ignores: ['dist', 'electron/out', 'experiment', 'node_modules'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  react.configs.flat.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
    },
    settings: { react: { version: 'detect' } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      'react/jsx-filename-extension': ['error', { extensions: ['.tsx', '.jsx'] }],
      'react/no-unstable-nested-components': ['error', { allowAsProps: true }],
      'react/display-name': 'off',
      'react/require-default-props': 'off',
      'react/jsx-props-no-spreading': 'off',

      'no-shadow': 'off',
      'jsx-a11y/no-autofocus': ['error', { ignoreNonDOM: true }],

      '@typescript-eslint/no-shadow': 'error',
      // A leading underscore marks a parameter a callback must accept but does not use.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Electron main process and build scripts run in Node.
    files: ['electron/**/*.cjs', 'scripts/**', '*.config.{js,ts}', 'tests/**'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  }
);
