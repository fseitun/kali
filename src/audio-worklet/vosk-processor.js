const AUDIO_SAMPLE_RATE = 16000;
const WORKLET_BUFFER_SIZE = 2048;
const INT16_MAX = 32768;

class VoskAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.isRecording = false;
    this.resampleRatio = sampleRate / AUDIO_SAMPLE_RATE;
    this.resampleCounter = 0;

    this.port.onmessage = (event) => {
      if (event.data.type === "start") {
        this.isRecording = true;
        this.buffer = [];
        this.resampleCounter = 0;
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
      this.resampleCounter += 1;

      if (this.resampleCounter >= this.resampleRatio) {
        this.resampleCounter -= this.resampleRatio;
        const sample = Math.max(
          -INT16_MAX,
          Math.min(INT16_MAX - 1, channelData[i] * INT16_MAX),
        );
        this.buffer.push(sample);
      }
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

registerProcessor("vosk-audio-processor", VoskAudioProcessor);
