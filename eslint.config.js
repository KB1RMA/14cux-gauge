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
import playwright from 'eslint-plugin-playwright';

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
const playwrightRecommended = playwright.configs['flat/recommended'];

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
    files: ['src/**/*.{ts,tsx}', 'build/**/*.ts', 'e2e/**/*.ts', '*.ts'],
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
    // State and data boundaries (AGENTS.md > State and data). The type-aware
    // rule is used because several boundaries still allow type imports.
    // Each directory has one object listing all its restrictions: a later
    // object setting the same rule for the same files would replace this one.
    files: ['src/components/**/*.{ts,tsx}'],
    ignores: ['src/components/**/*.test.{ts,tsx}'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@kb1rma/libcomm14cux-ts'],
              message:
                'Views never import the ECU library. Read with useEcuRead and write through useEcuWrite; see AGENTS.md > State and data.',
            },
            {
              group: ['**/storage/*'],
              allowTypeImports: true,
              message:
                'Use useSessions, useRoms or useSetting instead of reaching storage directly; see AGENTS.md > State and data.',
            },
            {
              group: ['**/settings/settingStore'],
              message:
                'Read settings with useSetting; see AGENTS.md > State and data.',
            },
            {
              group: ['**/history/sampleHistory', '**/history/pushSnapshot'],
              allowTypeImports: true,
              message:
                'Read the history with useHistory and a recording with useRecordedSeries; see AGENTS.md > State and data.',
            },
            {
              group: ['**/ecu/session'],
              allowTypeImports: true,
              message:
                'Use the useEcu and useEcuRead hooks instead of the session class; see AGENTS.md > State and data.',
            },
          ],
        },
      ],
    },
  },
  {
    // `model/` is the bottom layer: it imports nothing from the app above it.
    files: ['src/model/**/*.ts'],
    ignores: ['src/model/**/*.test.ts'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*'],
              message:
                'model/ imports nothing above it; move the dependency down or the code up. See AGENTS.md > State and data.',
            },
          ],
        },
      ],
    },
  },
  {
    // `storage/` sits just above `model/`: it imports nothing from the
    // services, hooks, components or platform above it.
    files: ['src/storage/**/*.{ts,tsx}'],
    ignores: ['src/storage/**/*.test.{ts,tsx}'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../*',
                '!../model',
                '!../model/**',
                '!../storage',
                '!../storage/**',
              ],
              message:
                'storage/ imports only model/ and itself; services, hooks, components and the platform sit above it. See AGENTS.md > State and data.',
            },
            {
              group: ['@kb1rma/libcomm14cux-ts'],
              message:
                'storage/ never touches the ECU library; only the controllers do. See AGENTS.md > State and data.',
            },
          ],
        },
      ],
    },
  },
  {
    // `settings/` is as low as `storage/`: it imports `model/`, `storage/`,
    // the metric and unit definitions and itself, and only the types of the
    // platform's settings backend. Nothing above it.
    files: ['src/settings/**/*.{ts,tsx}'],
    ignores: ['src/settings/**/*.test.{ts,tsx}'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../*',
                '!../model',
                '!../model/**',
                '!../storage',
                '!../storage/**',
                '!../settings',
                '!../settings/**',
                '!../metrics',
                '!../units',
                '!../platform',
                '!../platform/**',
              ],
              message:
                'settings/ imports only model/, storage/, metrics, units and itself; services, hooks and components sit above it. See AGENTS.md > State and data.',
            },
            {
              group: ['**/platform/*'],
              allowTypeImports: true,
              message:
                'settings/ may only import types from the platform; the platform passes what it provides in. See AGENTS.md > State and data.',
            },
            {
              group: ['@kb1rma/libcomm14cux-ts'],
              message:
                'settings/ never touches the ECU library; only the controllers do. See AGENTS.md > State and data.',
            },
          ],
        },
      ],
    },
  },
  {
    // `history/` and `replay/` hold the series model, which live graphs and
    // replay share. Below the hooks and components that read it, they import
    // only `model/`, the metric and unit definitions and themselves. Their
    // hooks (`use*.ts`) are the adapters and may import the services above.
    files: ['src/history/**/*.ts', 'src/replay/**/*.ts'],
    ignores: ['src/history/use*.ts', 'src/replay/use*.ts', 'src/**/*.test.ts'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../*',
                '!../model',
                '!../model/**',
                '!../metrics',
                '!../units',
                '!../history',
                '!../history/**',
                '!../replay',
                '!../replay/**',
              ],
              message:
                'history/ and replay/ import only model/, metrics, units and themselves; hooks, services and components sit above them. See AGENTS.md > State and data.',
            },
            {
              group: ['@kb1rma/libcomm14cux-ts'],
              message:
                'history/ and replay/ never touch the ECU library; only the controllers do. See AGENTS.md > State and data.',
            },
          ],
        },
      ],
    },
  },
  {
    // Browser globals are read only in `src/platform/`; anything else the
    // app needs from where it runs becomes a part of `Platform`. `document`
    // stays allowed for rendering, and `crypto.subtle` is standard in
    // Electron too. The ignored files read them today and are moved by the
    // issue named beside each; remove the entry in that issue's PR.
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/platform/**',
      'src/**/*.test.{ts,tsx}',
      'src/test-support/**',
      'src/test-setup.ts',
      // The offline and update checks and usage counting stay as they are
      // until a desktop build starts (#81).
      'src/pwa/**',
      'src/usage/**',
    ],
    rules: {
      'no-restricted-globals': [
        'error',
        ...[
          'localStorage',
          'sessionStorage',
          'indexedDB',
          'navigator',
          'location',
        ].map((name) => ({
          name,
          message: `Read ${name} only in src/platform/; add what you need to Platform. See AGENTS.md > State and data.`,
        })),
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'window',
          property: 'location',
          message:
            'Navigate with React Router, not window.location. See AGENTS.md > State and data.',
        },
      ],
    },
  },
  {
    // Hooks and providers adapt the controllers for React. Only the
    // controllers (src/ecu, src/ecuWrite/ecuWrites.ts, src/roms/romReader.ts)
    // call `Ecu` methods or hold a `Lease`.
    files: ['src/**/use*.{ts,tsx}', 'src/**/*Provider.tsx'],
    ignores: [
      'src/components/**',
      // Has its own object above, which a later one would replace.
      'src/storage/**',
      'src/**/*.test.{ts,tsx}',
      'src/test-support/**',
    ],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@kb1rma/libcomm14cux-ts'],
              message:
                'Hooks and providers never touch the ECU library; ask a controller (EcuWrites, RomReader, EcuSession). See AGENTS.md > State and data.',
            },
            {
              group: ['**/ecu/session'],
              importNames: ['Lease'],
              message:
                'Only controllers hold a Lease; see AGENTS.md > State and data.',
            },
          ],
        },
      ],
    },
  },
  {
    // Tests render ad-hoc components and export nothing to hot-reload.
    files: ['src/**/*.test.{ts,tsx}'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['src/**/*.test.{ts,tsx}', 'build/**/*.test.ts'],
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
  {
    // Acceptance suite: Playwright's recommended preset as errors, plus
    // role-based locators (see AGENTS.md). A CSS or XPath locator needs a
    // one-line disable saying why no role fits.
    files: ['e2e/**/*.ts'],
    plugins: playwrightRecommended.plugins,
    languageOptions: { globals: playwrightRecommended.languageOptions.globals },
    rules: {
      ...asErrors(playwrightRecommended.rules),
      'playwright/expect-expect': [
        'error',
        { assertFunctionNames: ['expectNoAxeViolations'] },
      ],
      'playwright/no-raw-locators': 'error',
    },
  },
];
