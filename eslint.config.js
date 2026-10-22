import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Reglas de dinero y seguridad del proyecto (CLAUDE.md). */
const reglasKapital = {
  'no-restricted-globals': [
    'error',
    { name: 'parseFloat', message: 'Prohibido con importes: usa parsearImporte / aCentimos (shared/lib/dinero).' },
  ],
  'no-restricted-properties': [
    'error',
    {
      object: 'Number',
      property: 'parseFloat',
      message: 'Prohibido con importes: usa parsearImporte / aCentimos (shared/lib/dinero).',
    },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
      message: 'Prohibido: riesgo de XSS (la sesión vive en el navegador).',
    },
    {
      selector: "Property[key.name='dangerouslySetInnerHTML']",
      message: 'Prohibido: riesgo de XSS (la sesión vive en el navegador).',
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'supabase/.temp/**',
      'apps/web/dev-dist/**',
      'supabase/types/database.types.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: {
      ...reglasKapital,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    ignores: ['apps/web/*.config.ts'],
    ...reactHooks.configs.flat['recommended-latest'],
    ...jsxA11y.flatConfigs.recommended,
    plugins: { ...reactHooks.configs.flat['recommended-latest'].plugins, ...jsxA11y.flatConfigs.recommended.plugins },
    languageOptions: {
      ...jsxA11y.flatConfigs.recommended.languageOptions,
      globals: { ...globals.browser },
    },
    rules: {
      ...reglasKapital,
      ...reactHooks.configs.flat['recommended-latest'].rules,
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },
  {
    // Deno (Edge Functions): globals de Deno.
    files: ['supabase/functions/**/*.ts'],
    languageOptions: { globals: { Deno: 'readonly' } },
  },
);
