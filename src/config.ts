export const CONFIG = {
  WAKE_WORD: {
    TEXT: ['zookeeper', 'zoo keeper'],
    TRANSCRIPTION_TIMEOUT_MS: 5000,
  },

  MODEL: {
    CACHE_NAME: 'kali-models-v1',
    URL: '/vosk-model-small-en-us-0.15.zip',
    VERSION: '0.15',
  },

  OLLAMA: {
    API_URL: 'http://localhost:11434/api/chat',
    MODEL: 'llama3.2:latest',
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
  },

  GAME: {
    DEFAULT_MODULE: 'snakes-and-ladders',
    MODULES_PATH: '/games',
  },

  MOBILE_DEVICE_PATTERN: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i,
} as const
