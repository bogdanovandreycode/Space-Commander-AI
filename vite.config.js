import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  base: '/',
  publicDir: false,
  build: {
    outDir: '../public',
    emptyOutDir: true,
    sourcemap: true,
  },
});
