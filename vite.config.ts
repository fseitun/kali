/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    {
      name: "debug-route-rewrite",
      configureServer(server) {
        server.middlewares.use((req: { url?: string }, _res, next) => {
          if (req.url === "/debug") {
            req.url = "/debug/";
          }
          next();
        });
      },
    },
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        navigateFallback: null,
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/alphacephei\.com\/vosk\/models\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "kali-models-v1",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      manifest: {
        name: "Kali - Voice Game Moderator",
        short_name: "Kali",
        description: "Voice-first game moderator for kids",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "icon-192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
          },
          {
            src: "icon-512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
          },
        ],
      },
    }),
  ],
  build: {
    target: "esnext",
    rollupOptions: {
      input: {
        main: "./index.html",
        debug: "./debug/index.html",
      },
      output: {
        manualChunks: {
          vosk: ["vosk-browser"],
        },
      },
    },
  },
  server: {
    hmr: {
      overlay: true,
    },
  },
  test: {
    globals: true,
    include: ["src/**/*.test.ts", "e2e/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts", "src/audio-worklet/**"],
    },
  },
});
