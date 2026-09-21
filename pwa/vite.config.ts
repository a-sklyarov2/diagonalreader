import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Diagonal Reader',
        short_name: 'Diagonal',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        // Policy pages are real server routes (Worker serves them
        // before assets). Without this, an installed PWA with a
        // cached shell serves index.html for them when offline or
        // when the precache wins — the "links don't work" bug.
        navigateFallbackDenylist: [/^\/privacy-policy/, /^\/data-deletion/],
        runtimeCaching: [
          {
            urlPattern: /^(\/summarize|\/quota|\/stripe\/)/,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/quota': 'http://127.0.0.1:8787',
      '/summarize': 'http://127.0.0.1:8787',
      '/stripe': 'http://127.0.0.1:8787',
    },
  },
});
