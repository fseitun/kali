export const CONFIG = {
  BUILD_ID: import.meta.env.VITE_BUILD_ID ?? "dev",

  LLM: {
    RETRY_DELAY_MS: 1_500,
    REQUEST_TIMEOUT_MS: 20_000,
  },

  LLM_PROVIDER: (import.meta.env.VITE_LLM_PROVIDER ?? "gemini") as
    | "ollama"
    | "gemini"
    | "groq"
    | "openrouter"
    | "deepinfra"
    | "mock",

  LOCALE: (import.meta.env.VITE_LOCALE ?? "es-AR") as "es-AR" | "en-US",

  WAKE_WORD: {
    /** Canonical spellings and common ASR misrecognitions (kali/calli/callie etc.) */
    TEXT: ["kali", "cali", "calli", "kaly", "caly", "callie", "callee", "kari"],
    TRANSCRIPTION_TIMEOUT_MS: 5000,
    /** Max Levenshtein distance for per-word fuzzy match (e.g. "callie" -> "kali") */
    FUZZY_MAX_EDIT_DISTANCE: 1,
  },

  MODEL: {
    CACHE_NAME: "kali-models-v1",
    URL:
      import.meta.env.VITE_VOSK_MODEL_URL ??
      "https://alphacephei.com/vosk/models/vosk-model-small-es-0.42.zip",
    VERSION: "0.42",
  },

  OLLAMA: {
    API_URL: "http://localhost:11434/api/chat",
    MODEL: import.meta.env.VITE_OLLAMA_MODEL ?? "llama3.2:latest",
  },

  GEMINI: {
    API_URL:
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    CACHED_CONTENTS_URL: "https://generativelanguage.googleapis.com/v1beta/cachedContents",
    MODEL: "models/gemini-2.0-flash",
    API_KEY: import.meta.env.VITE_GEMINI_API_KEY,
  },

  GROQ: {
    API_URL: "https://api.groq.com/openai/v1/chat/completions",
    API_KEY: import.meta.env.VITE_GROQ_API_KEY,
    MODEL: "llama-3.3-70b-versatile",
  },

  OPENROUTER: {
    API_URL: "https://openrouter.ai/api/v1/chat/completions",
    API_KEY: import.meta.env.VITE_OPENROUTER_API_KEY,
    MODEL: import.meta.env.VITE_OPENROUTER_MODEL ?? "google/gemini-2.0-flash-001",
  },

  DEEPINFRA: {
    API_URL: "https://api.deepinfra.com/v1/openai/chat/completions",
    API_KEY: import.meta.env.VITE_DEEPINFRA_API_KEY,
    MODEL: import.meta.env.VITE_DEEPINFRA_MODEL ?? "Qwen/Qwen2.5-72B-Instruct",
  },

  AUDIO: {
    SAMPLE_RATE: 16000,
    CHANNEL_COUNT: 1,
    ECHO_CANCELLATION: true,
    NOISE_SUPPRESSION: true,
    WORKLET_BUFFER_SIZE: 2048,
    WORKLET_PROCESSOR_NAME: "vosk-audio-processor",
  },

  UI: {
    SHOW_EXPORT_BUTTON: import.meta.env.VITE_SHOW_EXPORT_BUTTON === "true",
  },

  TTS: {
    RATE: 1.0,
    PITCH: 1.0,
    VOICE_LANG: "es-AR",
  },

  GAME: {
    DEFAULT_MODULE: "kalimba",
    MODULES_PATH: "/games",
  },

  MOBILE_DEVICE_PATTERN: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i,
} as const;
