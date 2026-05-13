import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
// import react from "@vitejs/plugin-react";
// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react({
      babel: {
        plugins: [['module:@preact/signals-react-transform']],
      },
    }),
    svgr({
      svgrOptions: {},
    }),
  ],
  resolve: {
    alias: [
      { find: '@', replacement: '/src' },
      { find: '@components', replacement: '/src/components' },
      { find: '@assets', replacement: '/src/assets' },
      { find: '@public', replacement: '/public' },
      { find: '@styles', replacement: '/src/styles' },
      { find: '@services', replacement: '/src/services' },
      { find: '@utils', replacement: '/src/utils' },
      { find: '@hooks', replacement: '/src/hooks' },
      { find: '@/BasicSearchbar', replacement: '/src/components/Objects/BasicSearchbar' },
    ],
  },
  build: {
    // Emit into the shared root-level dist/ (alongside the chatgpt-app build)
    // so the chatgpt-app's "Open in Canva" button can link to ./canva-app/.
    outDir: '../dist/canva-app',
    emptyOutDir: true,
    assetsInlineLimit: 1024 * 1024, // 1 Mb
    minify: false,
    sourcemap: false,
  },
});
