import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Test runner config — kept separate from vite.config.ts because the dev
 * server's vite config sets `root: client/` (so the React app builds from
 * the right place) which would hide our server/shared test files from
 * vitest. Here we point vitest at the repo root and let it discover all
 * `**\/*.test.ts` regardless of which workspace they live in.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  test: {
    include: ['{server,shared,client,extension}/**/*.test.ts'],
    environment: 'node',
  },
});
