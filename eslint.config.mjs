// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import i18next from 'eslint-plugin-i18next';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/dist/',
    '**/dist-openapi/',
    '**/dist-e2e/',
    '**/build/',
    '**/coverage/',
    '**/playwright-report/',
    '**/test-results/',
    'apps/api/src/generated/',
    'apps/web/src/shared/api/schema.d.ts',
  ]),

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Config files are not part of any tsconfig project.
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  {
    // UI strings in JSX markup go through i18n keys only (AGENTS.md → Definition of Done).
    // Strings built outside JSX (toasts, variables) are not covered and stay a review item.
    files: ['apps/web/src/**/*.tsx'],
    ignores: ['**/*.test.tsx'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-only',
          'should-validate-template': true,
          'jsx-attributes': {
            include: ['alt', 'aria-label', 'aria-description', 'label', 'placeholder', 'title'],
          },
        },
      ],
      // The plugin skips every attribute on <a>/<svg>/<text> and only knows a fixed
      // attribute list on native tags; these selectors close both gaps.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "JSXOpeningElement[name.name=/^(a|svg|text)$/] > JSXAttribute[name.name=/^(alt|aria-label|placeholder|title)$/]:matches([value.type='Literal'], [value.expression.type=/^(Literal|TemplateLiteral)$/])",
          message: 'Use an i18n key instead of a literal string in a user-visible attribute.',
        },
        {
          selector:
            "JSXOpeningElement[name.name=/^[a-z]/] > JSXAttribute[name.name=/^(label|aria-description)$/]:matches([value.type='Literal'], [value.expression.type=/^(Literal|TemplateLiteral)$/])",
          message: 'Use an i18n key instead of a literal string in a user-visible attribute.',
        },
      ],
    },
  },

  prettier,
);
