/**
 * @file vitest.config.ts
 * @description Vitest configuration for Kandypack test suites.
 *
 * Configures Vitest for:
 * - TypeScript path alias `@/*` mapping to project root
 * - Node environment for backend business logic & integration tests
 * - Automated test discovery under tests/
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
