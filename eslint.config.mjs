import nextPlugin from '@next/eslint-plugin-next'
import tsParser from '@typescript-eslint/parser'

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'supabase/.temp/**'],
  },
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
]
