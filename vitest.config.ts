import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // All tested modules are Phaser-free, so the fast node environment is enough.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
