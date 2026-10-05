// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import eslintReact from '@eslint-react/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y-x';
import tseslint from 'typescript-eslint';
import vitestPlugin from '@vitest/eslint-plugin';

const paddingLines = [
  'error',
  { blankLine: 'always', prev: '*', next: 'block-like' },
  { blankLine: 'always', prev: 'block-like', next: '*' },
  { blankLine: 'always', prev: '*', next: 'return' },
];

/** Raises every rule in a preset that is a warning to an error. */
const asErrors = (rules) =>
  Object.fromEntries(
    Object.entries(rules).map(([name, setting]) => [
      name,
      Array.isArray(setting)
        ? ['error', ...setting.slice(1)]
        : setting === 'off'
          ? 'off'
          : 'error',
    ]),
  );

// eslint-plugin-react-hooks (the React team's, backed by the React Compiler)
// is the authority on hooks. @eslint-react has its own copies of those rules;
// switch them off so each problem is reported once.
const duplicatedHookRules = Object.fromEntries(
  Object.keys(
    eslintReact.configs['disable-conflict-eslint-plugin-react-hooks'].rules,
  ).map((name) => [name.replace('react-hooks/', '@eslint-react/'), 'off']),
);

const reactStrict = eslintReact.configs['strict-type-checked'];

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/test-reports/**',
      '.claude/**',
    ],
  },
  {
    // An eslint-disable comment that no longer suppresses anything must go.
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  prettierConfig,
  {
    files: ['*.{js,mjs,cjs}'],
    plugins: { prettier: prettierPlugin },
    rules: {
      'prettier/prettier': 'error',
      'padding-line-between-statements': paddingLines,
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', '*.ts'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      prettier: prettierPlugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 'latest',
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'prettier/prettier': 'error',
      'padding-line-between-statements': paddingLines,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': 'allow-with-description',
          minimumDescriptionLength: 10,
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // Serial I/O is async throughout, so dropped promises and misused async
      // callbacks (event handlers especially) are the likeliest bugs.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
    },
  },
  {
    // React: every rule in the strict presets is an error, including
    // exhaustive-deps. Disable a rule inline only with a comment saying why.
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      ...reactStrict.plugins,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    settings: reactStrict.settings,
    rules: {
      ...asErrors(reactStrict.rules),
      ...duplicatedHookRules,
      ...asErrors(reactHooks.configs['recommended-latest'].rules),
      ...reactRefresh.configs.vite.rules,
    },
  },
  {
    // Accessibility: the strict preset as errors, plus the rules it leaves
    // out. Only the deprecated label-has-for (replaced by
    // label-has-associated-control) stays off.
    files: ['src/**/*.tsx'],
    plugins: { 'jsx-a11y-x': jsxA11y },
    rules: {
      ...asErrors(jsxA11y.configs.strict.rules),
      'jsx-a11y-x/label-has-for': 'off',
      // This rule cannot follow <label htmlFor> to an <input>, so form fields
      // are left to label-has-associated-control (and to the axe tests, which
      // check the rendered DOM).
      'jsx-a11y-x/control-has-associated-label': [
        'error',
        { ignoreElements: ['input', 'textarea'] },
      ],
      'jsx-a11y-x/anchor-ambiguous-text': 'error',
      'jsx-a11y-x/lang': 'error',
      'jsx-a11y-x/no-aria-hidden-on-focusable': 'error',
      'jsx-a11y-x/prefer-tag-over-role': 'error',
    },
  },
  {
    // Tests render ad-hoc components and export nothing to hot-reload.
    files: ['src/**/*.test.{ts,tsx}'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['src/**/*.test.{ts,tsx}'],
    plugins: { vitest: vitestPlugin },
    languageOptions: {
      globals: { ...vitestPlugin.environments.env.globals },
    },
    rules: {
      ...vitestPlugin.configs.recommended.rules,
      'vitest/expect-expect': [
        'error',
        { assertFunctionNames: ['expect', 'expectNoAxeViolations'] },
      ],
      'vitest/no-disabled-tests': 'warn',
      'vitest/no-focused-tests': 'error',
      'vitest/prefer-to-be': 'error',
      'vitest/prefer-to-have-length': 'error',
    },
  },
];
