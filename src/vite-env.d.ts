/// <reference types="vite/client" />

declare module "virtual:pwa-register" {
  export function registerSW(options?: {
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    immediate?: boolean;
  }): () => void;
}
