module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  globals: {
    wx: 'readonly',
    App: 'readonly',
    Page: 'readonly',
    Component: 'readonly',
    Behavior: 'readonly',
    getApp: 'readonly',
    getCurrentPages: 'readonly',
    requirePlugin: 'readonly',
    requireMiniProgram: 'readonly',
  },
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  rules: {
    'no-undef': 'error',
    'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
    'no-console': 'off',
    'no-constant-condition': 'warn',
    'no-debugger': 'warn',
    'no-dupe-keys': 'error',
    'no-duplicate-case': 'error',
    'no-empty': ['warn', { allowEmptyCatch: true }],
    'no-redeclare': 'error',
    'no-unreachable': 'warn',
    'eqeqeq': ['warn', 'always', { null: 'ignore' }],
    'no-var': 'warn',
    'prefer-const': ['warn', { destructuring: 'all' }],
  },
  overrides: [
    {
      files: ['cloudfunctions/**/*.js'],
      env: { node: true },
      globals: { wx: 'off', App: 'off', Page: 'off', Component: 'off' },
    },
    {
      files: ['pc-admin/**/*.{js,vue}'],
      env: { browser: true },
      globals: { wx: 'off', App: 'off', Page: 'off', Component: 'off' },
    },
  ],
}
