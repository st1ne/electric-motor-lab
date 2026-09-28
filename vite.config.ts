import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // three + the maps are one chunk on purpose: the first frame needs both (§14 budget: 550 KB gz)
  build: { target: 'es2022', chunkSizeWarningLimit: 2400 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
