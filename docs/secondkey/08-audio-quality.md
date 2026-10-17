# Deliverable 4: Audio evidence quality

All audio is the disclosed synthetic call: `secondkey/spikes/s3/call.wav`, 29.7 s, Windows voices as the fictional "Danny" and "Rose". The ground truth is in `call-script.json`: 53 words. Reports are in `secondkey/reports/s3-*.json`. Every browser test used an **isolated temporary Chrome profile**, never the user's.

## What failed, and why

The sprint's "browser speech doesn't work" was really three different things:

| Path | Result | Diagnosis |
|---|---|---|
| Edge 155, cloud Web Speech, automation | `error: network` | Edge's cloud speech service refuses automation-launched sessions. Says nothing about a real user |
| Chrome 155, **cloud** Web Speech, audio from the **fake microphone** (`--use-file-for-fake-audio-capture`) | No error; `audiostart`/`speechstart` fire; **zero results** in 16 kHz and 48 kHz variants | The recognizer gets audio but returns nothing from the fake capture device. Likely an automation or fake-device limitation |
| Chrome 155, **on-device** Web Speech (`processLocally`), fake microphone | Language pack installed in 51 s (user-approved download); interim words after 25 s, **no final results** | Same fake-device problem |
| Chrome 155, **on-device**, audio as a `MediaStreamTrack` (`recognition.start(track)`) | ✅ **Works.** First words 2.4 s after start, last final at 29.3 s (real time), 7 final segments | This is the first verified browser transcription |

**Conclusion.** Browser speech recognition is not fundamentally broken. Chrome's on-device recognizer works when audio arrives as a track. Feeding a *file* through the fake microphone is the wrong test harness. A real microphone in a real Chrome window is still **unverified**: it needs the 2-minute manual check in `live-check.html`. That is not a claim of live call transcription.

## Quality against the known script

| Engine | Latency | Word error rate | Critical phrases recovered (5) | Detector result |
|---|---|---|---|---|
| Windows System.Speech (offline, file) | 2.8–5.1 s for the whole 29.7 s call | **26%** | **5/5**: bail · right now · don't tell · promise you won't tell · $1800 | HOLD, risk high, 4–6 grounded quotes |
| Chrome on-device, `start(track)` | Streaming; first words 2.4 s | **53%** (mostly dropped words) | **2/5**: bail · right now. The amount was heard as "**100**", the secrecy line reduced to "Mom" | HOLD, risk high, 5 grounded quotes, including the distorted "**100 for bail right now**" |
| Prepared transcript (exact script) | Instant | 0% | 5/5 | HOLD (S1 family-emergency cases) |

Detection held in every condition because the decision needs grounded evidence, not one specific phrase. But the on-device run shows the real risk: **a grounded quote can still be a mis-hearing**. "100 for bail" is verbatim *from the transcript* and wrong *about the call*.

## Policy for uncertain or distorted quotations

1. **Label the source.** Quotes from automatic transcripts are shown as "*heard as* (automatic transcript, may contain errors)", never as someone's exact words. Quotes from typed chats or screenshots are labelled by source.
2. **Amounts never come from transcripts.** The payment amount and payee come only from the payer's confirmed intent (ADR-0016). If a quote contains an amount that differs from the confirmed amount, the UI shows "amount unclear in the audio" instead of the misheard number. To build: a deterministic annotation in M3.
3. **Evidence is never the only signal of safety.** A garbled or empty transcript gives `insufficient_information` → VERIFY → HOLD, never PROCEED. Detection failure already fails closed.
4. **Time-stamp each quote** (the ASR final's offset), so the reviewer can replay the exact seconds of audio when the recording is available and consented. To build in M3.
5. **Confidence is not shown as a number.** The page describes certainty ("the transcript was unclear in places") instead of fake percentages.

## Recommended setup

| Use | Choice |
|---|---|
| **Demo, primary** | Chrome on-device recognition, fed the call audio as a `MediaStreamTrack` from the page that plays it. Verified, private (no audio leaves the device), streaming. Tested on Chrome 155 with the en-US pack installed (one-time, about 50 s); older versions untested |
| **Demo, fallback (always ready)** | The **prepared transcript**, labelled "Recorded transcript of a synthetic call". Use it whenever live transcription misses the key phrases. Keep it until live transcription is proven reliable on the demo machine |
| **Live microphone** | Only after the manual check passes in Dave's Chrome. Until then, don't show a real-mic demo |
| **Server-side** | None needed now. System.Speech is Windows-only; a hosted STT is deferred until a server path is required |

**Still unproven:**

- a real microphone picking up a speaker in the room;
- the transcription quality of on-device recognition on natural (non-TTS) voices;
- speaker separation (no engine here separates speakers, so all quotes are attributed to "call audio").
