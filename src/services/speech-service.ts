import { CONFIG } from "@/config";
import { getTtsLang } from "@/i18n/locale-manager";
import { Logger } from "@/utils/logger";

/**
 * Upper bound on how long one utterance may take before {@link SpeechService.speak} gives up on
 * it. Generous on purpose: cutting a line short would lift the microphone gate while Kali is still
 * audible, which is the failure this whole mechanism exists to prevent. Speech runs at roughly
 * 12 characters per second, so 150 ms per character leaves better than a 1.5x margin, and the
 * floor covers very short lines where startup latency dominates.
 */
function speechWatchdogMs(text: string): number {
  return Math.max(5_000, text.length * 150);
}

export interface ISpeechService {
  prime(): void;
  speak(text: string): Promise<void>;
  loadSound(name: string, url: string): Promise<void>;
  playSound(name: string): void;
  startLoopingSound(name: string): void;
  stopLoopingSound(): void;
  setAmbientCaptureMuted(muted: boolean): void;
}

/**
 * Manages text-to-speech narration and sound effect playback for voice-only interaction.
 */
export class SpeechService implements ISpeechService {
  private audioContext?: AudioContext;
  private sounds: Map<string, AudioBuffer> = new Map();
  private primed = false;
  private loopingSource: AudioBufferSourceNode | null = null;
  private activeLoopName: string | null = null;
  private sfxGainNode: GainNode | null = null;
  private ambientGainNode: GainNode | null = null;
  private ambientCaptureMuted = false;
  private mutedNonTtsAudioLogged = false;

  private isNonTtsAudioMuted(): boolean {
    return CONFIG.STT.MUTE_NON_TTS_AUDIO;
  }

  private maybeLogMutedNonTtsAudio(): void {
    if (this.mutedNonTtsAudioLogged) {
      return;
    }
    this.mutedNonTtsAudioLogged = true;
    Logger.info("Non-TTS audio muted for Deepgram STT focus mode");
  }

  private ensureAudioRouting(): void {
    this.audioContext ??= new AudioContext();
    if (!this.sfxGainNode || !this.ambientGainNode) {
      this.sfxGainNode = this.audioContext.createGain();
      this.ambientGainNode = this.audioContext.createGain();
      this.sfxGainNode.connect(this.audioContext.destination);
      this.ambientGainNode.connect(this.audioContext.destination);
      this.applyAmbientGain();
    }
  }

  private applyAmbientGain(): void {
    if (this.ambientGainNode) {
      this.ambientGainNode.gain.value = this.ambientCaptureMuted ? 0 : 1;
    }
  }

  private getReadyAudioContext(): AudioContext | null {
    this.ensureAudioRouting();
    if (!this.audioContext) {
      Logger.warn("Audio context unavailable");
      return null;
    }
    return this.audioContext;
  }

  /**
   * Primes the speech synthesis API for immediate use.
   * Required on some browsers to avoid delays on first TTS call.
   */
  prime(): void {
    if (!window.speechSynthesis || this.primed) {
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance("");
    window.speechSynthesis.speak(utterance);
    this.primed = true;
    Logger.info("Speech synthesis primed");
  }

  /**
   * Speaks the provided text using browser TTS.
   * Cancels any currently playing speech before speaking.
   * @param text - The text to speak aloud
   * @returns Promise that resolves when speech finishes
   */
  speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) {
        Logger.error("TTS not supported");
        resolve();
        return;
      }

      if (!this.primed) {
        this.prime();
      }

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = CONFIG.TTS.RATE;
      utterance.pitch = CONFIG.TTS.PITCH;
      utterance.lang = getTtsLang();

      let settled = false;
      const finish = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(watchdog);
        resolve();
      };

      // speechSynthesis can drop an utterance without ever firing onend or onerror. Nothing else
      // would then settle this promise, and MeteredSpeechService keeps the microphone gated for as
      // long as a speak() is outstanding — so a single hung utterance would leave Kali deaf for the
      // rest of the session with no way back. Bound the wait instead.
      const watchdog = setTimeout(() => {
        Logger.error(`Speech synthesis never reported completion; giving up on: "${text}"`);
        window.speechSynthesis.cancel();
        finish();
      }, speechWatchdogMs(text));

      utterance.onend = () => {
        finish();
      };

      utterance.onerror = (event) => {
        if (event.error === "interrupted") {
          Logger.debug("Speech synthesis interrupted (expected when a new line cancels this one)");
        } else {
          Logger.error("Speech synthesis error:", {
            error: event.error,
            type: event.type,
            charIndex: event.charIndex,
            elapsedTime: event.elapsedTime,
          });
        }
        finish();
      };

      window.speechSynthesis.speak(utterance);
      Logger.narration(`Kali: "${text}"`);
    });
  }

  /**
   * Loads a sound effect from URL and caches it in memory.
   * @param name - Identifier for the sound (e.g., "ladder_up")
   * @param url - URL to fetch the sound file from
   */
  async loadSound(name: string, url: string): Promise<void> {
    if (this.isNonTtsAudioMuted()) {
      this.maybeLogMutedNonTtsAudio();
      return;
    }
    const audioContext = this.getReadyAudioContext();
    if (!audioContext) {
      return;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        // A 404 returns an HTML body that decodeAudioData would choke on.
        Logger.warn(`Failed to load sound ${name} from ${url}: HTTP ${response.status}`);
        return;
      }
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      this.sounds.set(name, audioBuffer);
      Logger.info(`Loaded sound: ${name}`);
    } catch (error) {
      Logger.warn(`Failed to load sound ${name} from ${url}:`, error);
    }
  }

  /**
   * Plays a previously loaded sound effect.
   * Gracefully handles missing sounds by logging a warning.
   * @param name - Identifier of the sound to play
   */
  playSound(name: string): void {
    if (this.isNonTtsAudioMuted()) {
      this.maybeLogMutedNonTtsAudio();
      return;
    }
    if (!this.sounds.has(name)) {
      Logger.warn(`Sound effect "${name}" not found, continuing without sound`);
      return;
    }

    const audioContext = this.getReadyAudioContext();
    if (!audioContext) {
      return;
    }

    try {
      const buffer = this.sounds.get(name);
      if (!buffer) {
        Logger.warn(`Sound not found: ${name}`);
        return;
      }
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      if (!this.sfxGainNode) {
        Logger.warn("SFX gain node unavailable, skipping sound");
        return;
      }
      source.connect(this.sfxGainNode);
      source.start(0);
      Logger.info(`Playing sound: ${name}`);
    } catch (error) {
      Logger.warn(`Failed to play sound ${name}:`, error);
    }
  }

  /**
   * Starts a looping sound by name. Replaces any currently active loop.
   * @param name - Identifier of the looping sound to play
   */
  startLoopingSound(name: string): void {
    if (this.isNonTtsAudioMuted()) {
      this.stopLoopingSound();
      this.maybeLogMutedNonTtsAudio();
      return;
    }
    if (this.activeLoopName === name && this.loopingSource !== null) {
      return;
    }
    this.stopLoopingSound();

    if (!this.sounds.has(name)) {
      Logger.warn(`Looping sound "${name}" not found, continuing without loop`);
      return;
    }

    const audioContext = this.getReadyAudioContext();
    if (!audioContext) {
      return;
    }
    const buffer = this.sounds.get(name);
    if (!buffer) {
      Logger.warn(`Looping sound buffer not found: ${name}`);
      return;
    }

    try {
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      if (!this.ambientGainNode) {
        Logger.warn("Ambient gain node unavailable, skipping loop");
        return;
      }
      source.connect(this.ambientGainNode);
      source.start(0);
      this.loopingSource = source;
      this.activeLoopName = name;
      Logger.info(`Looping sound started: ${name}`);
    } catch (error) {
      Logger.warn(`Failed to start looping sound ${name}:`, error);
      this.loopingSource = null;
      this.activeLoopName = null;
    }
  }

  /**
   * Stops the currently active looping sound, if any.
   */
  stopLoopingSound(): void {
    if (this.loopingSource === null) {
      this.activeLoopName = null;
      return;
    }
    try {
      this.loopingSource.stop();
      this.loopingSource.disconnect();
    } catch (error) {
      Logger.warn("Failed to stop looping sound:", error);
    } finally {
      this.loopingSource = null;
      this.activeLoopName = null;
    }
  }

  /**
   * Mutes/unmutes ambient looping audio while speech capture is active.
   * @param muted - True to mute ambient loop during capture windows
   */
  setAmbientCaptureMuted(muted: boolean): void {
    this.ambientCaptureMuted = muted;
    this.applyAmbientGain();
  }
}
