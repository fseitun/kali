import { parsePositiveIntEnv } from "./utils/parse-positive-int-env";

export const CONFIG = {
  BUILD_ID: import.meta.env.VITE_BUILD_ID ?? "dev",

  LLM: {
    RETRY_DELAY_MS: 1_500,
    /** Default timeout for LLM calls (extractName, analyzeResponse, etc.). Override via VITE_LLM_REQUEST_TIMEOUT_MS. */
    REQUEST_TIMEOUT_MS: parsePositiveIntEnv(
      import.meta.env.VITE_LLM_REQUEST_TIMEOUT_MS as string | undefined,
      60_000,
      "VITE_LLM_REQUEST_TIMEOUT_MS",
    ),
    /** Longer timeout for getActions (heavy prompts). Override via VITE_LLM_GET_ACTIONS_TIMEOUT_MS. */
    GET_ACTIONS_TIMEOUT_MS: parsePositiveIntEnv(
      import.meta.env.VITE_LLM_GET_ACTIONS_TIMEOUT_MS as string | undefined,
      90_000,
      "VITE_LLM_GET_ACTIONS_TIMEOUT_MS",
    ),
    /** Opt-in full prompt/response logging for deep debugging. */
    LOG_FULL_PROMPTS: import.meta.env.VITE_LLM_LOG_FULL_PROMPTS === "true",
  },

  LLM_PROVIDER: (import.meta.env.VITE_LLM_PROVIDER ?? "deepinfra") as "deepinfra" | "mock",

  /** Locale from env (VITE_LOCALE). Use "es", "es-AR", "en", "en-US"; default "es-AR". */
  LOCALE: (() => {
    const raw = import.meta.env.VITE_LOCALE ?? "es-AR";
    const s = String(raw).trim().toLowerCase();
    if (s === "es" || s === "es-ar") {
      return "es-AR";
    }
    if (s === "en" || s === "en-us") {
      return "en-US";
    }
    return raw as string as "es-AR" | "en-US";
  })(),

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

  /**
   * When true (set `VITE_DEBUG_POSITION_TELEPORT=true` at build time, e.g. local `.env` or staging CI),
   * the debug route may use `/pos <n>` to teleport the current player. Production builds should omit
   * the var or set it to false. Value is inlined at build time, not a runtime secret.
   */
  DEBUG_POSITION_TELEPORT: import.meta.env.VITE_DEBUG_POSITION_TELEPORT === "true",

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
