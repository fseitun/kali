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

  STT: {
    /**
     * Delay before considering deepgram stream endpointing as final enough for command handoff.
     * Tuning knob for environments with brief pauses.
     */
    ENDPOINTING_MS: parsePositiveIntEnv(
      import.meta.env.VITE_STT_ENDPOINTING_MS as string | undefined,
      700,
      "VITE_STT_ENDPOINTING_MS",
    ),
    /**
     * Word-gap fallback for end-of-speech. Deepgram requires >= 1000ms because interim
     * results refresh once a second. Catches utterances where room noise keeps the VAD
     * busy and `speech_final` never arrives.
     */
    UTTERANCE_END_MS: parsePositiveIntEnv(
      import.meta.env.VITE_STT_UTTERANCE_END_MS as string | undefined,
      1_000,
      "VITE_STT_UTTERANCE_END_MS",
    ),
    /**
     * Temporarily suppress non-TTS audio (SFX + habitat ambient) while focusing on online STT.
     * Enabled by default for Deepgram sessions; set VITE_STT_MUTE_NON_TTS_AUDIO=false to re-enable.
     */
    MUTE_NON_TTS_AUDIO:
      (import.meta.env.VITE_STT_MUTE_NON_TTS_AUDIO ?? "true").toLowerCase() !== "false",
  },

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
  },

  DEEPINFRA: {
    API_URL: "https://api.deepinfra.com/v1/openai/chat/completions",
    API_KEY: import.meta.env.VITE_DEEPINFRA_API_KEY,
    MODEL: import.meta.env.VITE_DEEPINFRA_MODEL ?? "Qwen/Qwen2.5-72B-Instruct",
  },

  DEEPGRAM: {
    API_KEY: import.meta.env.VITE_DEEPGRAM_API_KEY,
    MODEL: import.meta.env.VITE_DEEPGRAM_MODEL ?? "nova-3",
    LANGUAGE: import.meta.env.VITE_DEEPGRAM_LANGUAGE ?? "es",
    WS_URL: import.meta.env.VITE_DEEPGRAM_WS_URL ?? "wss://api.deepgram.com/v1/listen",
  },

  AUDIO: {
    SAMPLE_RATE: 16000,
    CHANNEL_COUNT: 1,
    ECHO_CANCELLATION: true,
    NOISE_SUPPRESSION: true,
    WORKLET_PROCESSOR_NAME: "pcm-processor",
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
  },

  GAME: {
    DEFAULT_MODULE: "kalimba",
    MODULES_PATH: "/games",
  },
} as const;
