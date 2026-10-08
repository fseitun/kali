const WORKLET_BUFFER_SIZE = 2048;
const INT16_MAX = 32768;

/**
 * Converts mic frames to the Int16 PCM chunks Deepgram expects.
 * No resampling here: the AudioContext is created at the target sample rate, so the browser
 * resamples with a proper anti-alias filter before the audio ever reaches this processor.
 */
class PcmAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.isRecording = false;

    this.port.onmessage = (event) => {
      if (event.data.type === "start") {
        this.isRecording = true;
        this.buffer = [];
      } else if (event.data.type === "stop") {
        this.isRecording = false;
        if (this.buffer.length > 0) {
          this.port.postMessage({
            type: "audioData",
            data: new Int16Array(this.buffer),
          });
          this.buffer = [];
        }
      }
    };
  }

  process(inputs, outputs) {
    void outputs;

    if (!this.isRecording) return true;

    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0];

    for (let i = 0; i < channelData.length; i++) {
      const sample = Math.max(-INT16_MAX, Math.min(INT16_MAX - 1, channelData[i] * INT16_MAX));
      this.buffer.push(sample);
    }

    if (this.buffer.length >= WORKLET_BUFFER_SIZE) {
      this.port.postMessage({
        type: "audioData",
        data: new Int16Array(this.buffer),
      });
      this.buffer = [];
    }

    return true;
  }
}

registerProcessor("pcm-processor", PcmAudioProcessor);
