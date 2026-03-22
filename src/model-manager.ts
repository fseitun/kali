// Model URL is configurable via VITE_VOSK_MODEL_URL (see config.ts). Use a CDN in production
// to avoid shipping the model with your build. Cache key is the URL itself.

import { CONFIG } from "./config";
import { Logger } from "./utils/logger";

/**
 * Singleton manager for downloading and caching the Vosk speech recognition model.
 * Handles offline-first model caching using the browser Cache API.
 */
export class ModelManager {
  private static instance: ModelManager | null = null;

  /** Shared promise for in-flight download; deduplicates concurrent getModel() calls. */
  private inFlight: Promise<string> | null = null;

  private constructor() {}

  /**
   * Gets the singleton instance of ModelManager.
   */
  static getInstance(): ModelManager {
    ModelManager.instance ??= new ModelManager();
    return ModelManager.instance;
  }

  /**
   * Gets the Vosk model, either from cache or by downloading.
   * @param onProgress - Optional callback for download progress (0-100)
   * @returns Blob URL for the cached or downloaded model
   * @throws Error if download fails
   */
  async getModel(onProgress?: (percent: number) => void): Promise<string> {
    const cachedModel = await this.getCachedModel();

    if (cachedModel) {
      Logger.info("Using cached Vosk model");
      return cachedModel;
    }

    if (!this.inFlight) {
      Logger.download("Downloading Vosk model...");
      const promise = this.downloadAndCacheModel(onProgress);
      this.inFlight = promise.finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  private async getCachedModel(): Promise<string | null> {
    try {
      const cache = await caches.open(CONFIG.MODEL.CACHE_NAME);
      const response = await cache.match(CONFIG.MODEL.URL);

      if (!response) {
        return null;
      }

      const versionHeader = response.headers.get("X-Model-Version");
      if (versionHeader !== CONFIG.MODEL.VERSION) {
        Logger.warn("Cached model version mismatch, will download new version");
        await cache.delete(CONFIG.MODEL.URL);
        return null;
      }

      const blob = await response.blob();
      return URL.createObjectURL(blob);
    } catch (error) {
      Logger.error("Failed to retrieve cached model:", error);
      return null;
    }
  }

  private async downloadAndCacheModel(onProgress?: (percent: number) => void): Promise<string> {
    try {
      const response = await fetch(CONFIG.MODEL.URL);

      if (!response.ok) {
        throw new Error(`Failed to download model: ${response.statusText}`);
      }

      const contentLength = response.headers.get("Content-Length");
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Response body is not readable");
      }

      const chunks: BlobPart[] = [];
      let receivedLength = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        chunks.push(value);
        receivedLength += value.length;

        if (total && onProgress) {
          const percent = Math.round((receivedLength / total) * 100);
          onProgress(percent);
        }
      }

      const blob = new Blob(chunks);

      await this.cacheModel(blob);

      const url = URL.createObjectURL(blob);
      Logger.info("Model downloaded and cached successfully");

      return url;
    } catch (error) {
      Logger.error("Failed to download model:", error);
      throw error;
    }
  }

  private async cacheModel(blob: Blob): Promise<void> {
    try {
      const cache = await caches.open(CONFIG.MODEL.CACHE_NAME);

      const headers = new Headers({
        "Content-Type": "application/zip",
        "X-Model-Version": CONFIG.MODEL.VERSION,
        "X-Cached-At": Date.now().toString(),
      });

      const response = new Response(blob, { headers });
      await cache.put(CONFIG.MODEL.URL, response);

      Logger.info("Model cached successfully");
    } catch (error) {
      Logger.error("Failed to cache model:", error);
    }
  }

  /**
   * Clears the cached Vosk model from browser cache.
   */
  async clearCache(): Promise<void> {
    try {
      await caches.delete(CONFIG.MODEL.CACHE_NAME);
      Logger.info("Model cache cleared");
    } catch (error) {
      Logger.error("Failed to clear model cache:", error);
    }
  }
}
