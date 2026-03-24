/// <reference types="vitest/config" />
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import type { ManifestEntry } from "workbox-build";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
type ManifestTransformEntry = ManifestEntry & { size: number };

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  define: {
    ...(process.env.VITEST === "true"
      ? { "import.meta.env.VITE_LLM_PROVIDER": JSON.stringify("mock") }
      : {}),
    "import.meta.env.VITE_BUILD_ID": JSON.stringify("latest"),
  },
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
      registerType: "prompt",
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        navigateFallback: null,
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        manifestTransforms: [
          (entries: ManifestTransformEntry[]): { manifest: ManifestTransformEntry[] } => ({
            manifest: entries.filter((e) => {
              if (e.url.includes("/debug/")) {
                return false;
              }
              if (e.url.includes("/assets/") && /[-.]debug[-.]/.test(e.url)) {
                return false;
              }
              return true;
            }),
          }),
        ],
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
          {
            urlPattern: /^https:\/\/.*\.blob\.vercel-storage\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "kali-models-v1",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/debug"),
            handler: "NetworkFirst",
            options: {
              cacheName: "kali-debug-v1",
              expiration: {
                maxEntries: 5,
                maxAgeSeconds: 60 * 60 * 24,
              },
              cacheableResponse: { statuses: [0, 200] },
              networkTimeoutSeconds: 10,
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
    // Vosk chunk is ~6 MB (WASM/speech); loaded on demand when user uses voice, not in debug.
    chunkSizeWarningLimit: 6144,
    rollupOptions: {
      input: {
        main: "./index.html",
        debug: "./debug/index.html",
      },
      output: {
        manualChunks(id) {
          // Intentionally large; loaded on demand via dynamic import in kali-app-core (voice only).
          if (id.includes("vosk-browser")) {
            return "vosk";
          }
          if (
            id.includes("debug.ts") ||
            id.includes("debug/") ||
            id.includes("debug-ui-service") ||
            id.includes("debug-options") ||
            id.includes("styles/debug.css")
          ) {
            return "debug";
          }
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
    include: ["src/**/*.test.ts", "integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts", "src/audio-worklet/**"],
    },
  },
});
