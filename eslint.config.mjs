// ESLint v9 flat config — single root config for the whole monorepo (P6-4).
//
// Replaces `next lint` (deprecated in Next 15) and the empty turbo lint task.
// Run from any directory with `pnpm lint` or `pnpm lint:fix`.
//
// Scopes:
//   - Web app (Next.js 15 + React 19): React + hooks + next/core-web-vitals
//   - Node services (api, workers, ws-gateway): TS-only rules
//   - Shared packages (packages/*): TS-only rules
//
// Style choices:
//   - Errors only for genuine correctness/safety issues (unused vars,
//     no-undef, react-hooks). Style issues handled by Prettier separately.
//   - `@typescript-eslint/no-explicit-any` warns rather than errors —
//     existing code uses any in a handful of well-justified places
//     (Prisma JSON columns, third-party untyped libs).

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  // Ignore generated / vendored / build output trees globally so no file in
  // them ever reaches a plugin (avoids slow recursive walks too).
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/.claude/**',                // Claude agent worktrees
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.next-cache/**',
      '**/public/**',                 // Service workers + static assets
      '**/next-env.d.ts',
      '**/*.config.js',               // postcss / tailwind configs (CJS)
      '**/*.config.mjs',
      '**/*.config.cjs',
      'scripts/**',                   // tsx one-shots, not part of the app build
      'apps/orderflow-workers/**',    // Python project
      'packages/db/prisma/migrations/**',
    ],
  },

  // Baseline JS recommendations.
  js.configs.recommended,

  // TypeScript recommendations (flat). The tseslint helper unrolls a sane
  // default ruleset for all .ts/.tsx files.
  ...tseslint.configs.recommended,

  // Common settings for every TS file across the monorepo.
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      // The recommended set marks all unused vars; allow underscore-prefixed
      // for "intentionally ignored" intent and let `args: 'after-used'` keep
      // function-signature parity readable.
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-constant-condition': ['error', { checkLoops: false }],
      // The system prompt is one giant template literal with `\$50k` and
      // friends — redundant but harmless escapes. Demote to warn.
      'no-useless-escape': 'warn',
    },
  },

  // Web app: Next.js + React + react-hooks.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: {
      '@next/next':  nextPlugin,
      react:         reactPlugin,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // Anchor on the curated Next.js + React preset bundles.
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactPlugin.configs.recommended.rules,
      // react-hooks v5 ships flat-config-aware configs under .configs.flat;
      // fall back to .recommended.rules if the flat shape isn't present
      // (covers both react-hooks 5.x and the older 4.x layout).
      ...(reactHooks.configs.flat?.recommended?.rules ?? reactHooks.configs.recommended.rules),
      // React 17+ JSX transform — `import React from 'react'` is not required.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types':         'off',
      'react/no-unescaped-entities': 'warn',
      // App router uses <Link>; the pages-link rule misfires + emits a
      // config warning. Disable until the rule is app-router-aware.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
];
