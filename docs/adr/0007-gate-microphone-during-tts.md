# ADR 0007: Gate the microphone while Kali speaks

## Status

Accepted.

## Context

Kali talks and listens through the same room. `DeepgramStream` streams the microphone continuously, and browser echo cancellation does **not** remove desktop `speechSynthesis` output — so every line she speaks comes back as a transcript she can then obey.

The obvious fix is to recognise her own words after the fact and discard them. We tried that four times, and it was wrong four ways:

1. A 1700 ms time window after `onend` swallowed children who answered promptly.
2. Shrinking it to 300 ms let her transcribe and obey herself: Deepgram finalizes her speech about `ENDPOINTING_MS` (700 ms) after it ends, i.e. always **after** the tail.
3. Exact-substring content matching missed her long lines, because ASR output drifts from the TTS source text ("casilla cero" for "casilla 0").
4. Coverage-based matching then over-convicted **real** answers — and that drop site had no audible recovery, so the child was stuck forever.

Step 4 is not a tuning failure, it is the shape of the problem. Kali's words and the child's correct answer are drawn from the same small vocabulary **by design**, because she just read them the four options aloud. "quiero ir al 97" against "¿Querés ir al 97 o al 99?" is 0.7 word coverage. No content heuristic can separate the two, because there is nothing to separate.

## Decision

Stop transcribing her voice instead of trying to recognise it afterwards.

`MeteredSpeechService.isSelfAudible()` is true from the moment `speak` is called until a short tail (200 ms) after the last utterance ends. `DeepgramStream` takes that predicate and, while it holds, sends a **zero-filled buffer of the same length** in place of the microphone PCM.

Silence rather than dropped frames is load-bearing: dropping would splice the words before her line onto the words after it as one utterance, stall Deepgram's audio clock, and starve the socket toward its idle close. Substituting silence keeps the clock running, and the injected silence trips the 700 ms endpointing exactly when she starts talking — which is the boundary we want anyway.

All content-based detection is deleted (`echoWords`, `isRenditionOf`, `isEchoOfRecentSpeech`, the `ECHO_*` constants, both transcript-side guards and the whole re-ask recovery path). Every transcript that now arrives was said by a person, so the app's only silent drop site is gone.

`SpeechService.speak` carries a watchdog. It previously resolved only from `onend` / `onerror`, and `speechSynthesis` can drop an utterance without firing either — which, now that the gate reads "a speak is outstanding", would leave the microphone closed for the rest of the session.

## Consequences

- **Barge-in is impossible, deliberately.** A child talking while Kali speaks is not heard at all: their audio is replaced with silence, so no transcript exists and nothing can re-ask. This is acceptable here — her lines are a few seconds long, and the alternative is her obeying her own fork question while the child is stuck forever. It is also not a regression: barge-in was already inaudible, since the old guard returned true whenever a `speak` was active. The gate implements the same product behaviour at the layer that can actually enforce it.
- The gate is enforced at the consumer, not at capture, so a chunk straddling the moment it lifts can carry up to ~128 ms of her tail. The 200 ms tail covers it.
- A hung utterance now costs one bounded wait instead of the microphone.
- Do not "simplify" the zero-filled buffer into skipping the `send`. That is the version that breaks the audio clock.

## Links

- Rules: [`CLAUDE.md`](../../CLAUDE.md) (Voice UX invariants)
- Code: [`src/voice/metered-speech-service.ts`](../../src/voice/metered-speech-service.ts) (`isSelfAudible`), [`src/voice-recognition/deepgram-stream.ts`](../../src/voice-recognition/deepgram-stream.ts) (audio pump), [`src/services/speech-service.ts`](../../src/services/speech-service.ts) (watchdog)
- Tests: [`src/voice-recognition/deepgram-stream.test.ts`](../../src/voice-recognition/deepgram-stream.test.ts) ("Kali's own voice never reaches the recogniser"), [`src/kali-app-core.integration.test.ts`](../../src/kali-app-core.integration.test.ts) ("Takes the fork answer built out of the words Kali just spoke")
