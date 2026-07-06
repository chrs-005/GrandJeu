import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Use our hand-written service worker from src/sw.js
      // vite-plugin-pwa will inject the precache manifest and output dist/sw.js
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      // We register the SW manually in notifications.js, so disable auto-register
      injectRegister: null,
      manifest: {
        name: "L'Olympe — Le Grand Jeu des Dieux",
        short_name: "L'Olympe",
        description: 'Grand jeu scout sur le thème de la mythologie grecque',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: '#0b0f1d',
        background_color: '#0b0f1d',
        icons: [
          {
            src: '/icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
});
