import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  publicDir: false,
  build: {
    outDir: 'public',
    emptyOutDir: true,
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
