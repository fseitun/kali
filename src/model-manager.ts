const MODEL_CACHE_NAME = 'kali-models-v1'
const MODEL_URL = 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip'
const MODEL_VERSION = '0.15'

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
      console.log('✅ Using cached Vosk model')
      return cachedModel
    }

    console.log('📥 Downloading Vosk model...')
    return await this.downloadAndCacheModel(onProgress)
  }

  private async getCachedModel(): Promise<string | null> {
    try {
      const cache = await caches.open(MODEL_CACHE_NAME)
      const response = await cache.match(MODEL_URL)

      if (!response) {
        return null
      }

      const versionHeader = response.headers.get('X-Model-Version')
      if (versionHeader !== MODEL_VERSION) {
        console.log('⚠️ Cached model version mismatch, will download new version')
        await cache.delete(MODEL_URL)
        return null
      }

      const blob = await response.blob()
      return URL.createObjectURL(blob)
    } catch (error) {
      console.error('Failed to retrieve cached model:', error)
      return null
    }
  }

  private async downloadAndCacheModel(onProgress?: (percent: number) => void): Promise<string> {
    try {
      const response = await fetch(MODEL_URL)

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
      console.log('✅ Model downloaded and cached successfully')

      return url
    } catch (error) {
      console.error('Failed to download model:', error)
      throw error
    }
  }

  private async cacheModel(blob: Blob): Promise<void> {
    try {
      const cache = await caches.open(MODEL_CACHE_NAME)

      const headers = new Headers({
        'Content-Type': 'application/zip',
        'X-Model-Version': MODEL_VERSION,
        'X-Cached-At': Date.now().toString()
      })

      const response = new Response(blob, { headers })
      await cache.put(MODEL_URL, response)

      console.log('✅ Model cached successfully')
    } catch (error) {
      console.error('Failed to cache model:', error)
    }
  }

  async clearCache(): Promise<void> {
    try {
      await caches.delete(MODEL_CACHE_NAME)
      console.log('✅ Model cache cleared')
    } catch (error) {
      console.error('Failed to clear model cache:', error)
    }
  }
}
