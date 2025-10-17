import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024 // 10 MB limit
      },
      manifest: {
        name: 'Kali - Voice Game Moderator',
        short_name: 'Kali',
        description: 'Voice-first game moderator',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        icons: [
          {
            src: 'icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ],
  build: {
    target: 'esnext'
  },
  server: {
    hmr: {
      overlay: true
    }
  },
})
