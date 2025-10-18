// TODO: Migrate to S3 or CORS-enabled CDN for production
// Current: Loading from local /public/ directory due to CORS restrictions on alphacephei.com
// Future: Upload model to AWS S3 with CORS policy configured:
//   - Bucket policy: Allow s3:GetObject from your domain
//   - CORS config: Add Access-Control-Allow-Origin header
//   - Update MODEL_URL to S3 endpoint (e.g., https://your-bucket.s3.amazonaws.com/vosk-model-small-en-us-0.15.zip)
// The caching infrastructure below is ready for S3 migration

import { CONFIG } from './config'
import { Logger } from './utils/logger'

export class ModelManager {
  private static instance: ModelManager | null = null

  private constructor() {}

  static getInstance(): ModelManager {
    if (!ModelManager.instance) {
      ModelManager.instance = new ModelManager()
    }
    return ModelManager.instance
  }

  async getModel(onProgress?: (percent: number) => void): Promise<string> {
    const cachedModel = await this.getCachedModel()

    if (cachedModel) {
      Logger.info('Using cached Vosk model')
      return cachedModel
    }

    Logger.download('Downloading Vosk model...')
    return await this.downloadAndCacheModel(onProgress)
  }

  private async getCachedModel(): Promise<string | null> {
    try {
      const cache = await caches.open(CONFIG.MODEL.CACHE_NAME)
      const response = await cache.match(CONFIG.MODEL.URL)

      if (!response) {
        return null
      }

      const versionHeader = response.headers.get('X-Model-Version')
      if (versionHeader !== CONFIG.MODEL.VERSION) {
        Logger.warn('Cached model version mismatch, will download new version')
        await cache.delete(CONFIG.MODEL.URL)
        return null
      }

      const blob = await response.blob()
      return URL.createObjectURL(blob)
    } catch (error) {
      Logger.error('Failed to retrieve cached model:', error)
      return null
    }
  }

  private async downloadAndCacheModel(onProgress?: (percent: number) => void): Promise<string> {
    try {
      const response = await fetch(CONFIG.MODEL.URL)

      if (!response.ok) {
        throw new Error(`Failed to download model: ${response.statusText}`)
      }

      const contentLength = response.headers.get('Content-Length')
      const total = contentLength ? parseInt(contentLength, 10) : 0

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Response body is not readable')
      }

      const chunks: BlobPart[] = []
      let receivedLength = 0

      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        chunks.push(value)
        receivedLength += value.length

        if (total && onProgress) {
          const percent = Math.round((receivedLength / total) * 100)
          onProgress(percent)
        }
      }

      const blob = new Blob(chunks)

      await this.cacheModel(blob)

      const url = URL.createObjectURL(blob)
      Logger.info('Model downloaded and cached successfully')

      return url
    } catch (error) {
      Logger.error('Failed to download model:', error)
      throw error
    }
  }

  private async cacheModel(blob: Blob): Promise<void> {
    try {
      const cache = await caches.open(CONFIG.MODEL.CACHE_NAME)

      const headers = new Headers({
        'Content-Type': 'application/zip',
        'X-Model-Version': CONFIG.MODEL.VERSION,
        'X-Cached-At': Date.now().toString()
      })

      const response = new Response(blob, { headers })
      await cache.put(CONFIG.MODEL.URL, response)

      Logger.info('Model cached successfully')
    } catch (error) {
      Logger.error('Failed to cache model:', error)
    }
  }

  async clearCache(): Promise<void> {
    try {
      await caches.delete(CONFIG.MODEL.CACHE_NAME)
      Logger.info('Model cache cleared')
    } catch (error) {
      Logger.error('Failed to clear model cache:', error)
    }
  }
}
