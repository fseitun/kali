export const CONFIG = {
  LLM_PROVIDER: (import.meta.env.VITE_LLM_PROVIDER || 'gemini') as 'ollama' | 'gemini',

  LOCALE: 'es-AR' as 'es-AR' | 'en-US',

  WAKE_WORD: {
    TEXT: ['kali', 'cali', 'calli', 'kaly', 'caly'],
    TRANSCRIPTION_TIMEOUT_MS: 5000,
  },

  MODEL: {
    CACHE_NAME: 'kali-models-v1',
    URL: '/vosk-model-small-es-0.42.zip',
    VERSION: '0.42',
  },

  OLLAMA: {
    API_URL: 'http://localhost:11434/api/chat',
    MODEL: 'llama3.2:latest',
  },

  GEMINI: {
    API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    API_KEY: import.meta.env.VITE_GEMINI_API_KEY || '',
  },

  AUDIO: {
    SAMPLE_RATE: 16000,
    CHANNEL_COUNT: 1,
    ECHO_CANCELLATION: true,
    NOISE_SUPPRESSION: true,
    WORKLET_BUFFER_SIZE: 2048,
    WORKLET_PROCESSOR_NAME: 'vosk-audio-processor',
  },

  STATE: {
    DB_NAME: 'kali-db',
    STORE_NAME: 'gameState',
    STATE_KEY: 'current',
  },

  UI: {
    MAX_TRANSCRIPTION_ENTRIES: 10,
  },

  TTS: {
    RATE: 1.0,
    PITCH: 1.0,
    VOICE_LANG: 'es-AR',
  },

  GAME: {
    DEFAULT_MODULE: 'kalimba',
    MODULES_PATH: '/games',
  },

  MOBILE_DEVICE_PATTERN: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i,
} as const
