import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.{test,spec}.{ts,js}', 'apps/**/*.{test,spec}.{ts,js}', 'tests/**/*.{test,spec}.{ts,js}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
    },
  },
});
