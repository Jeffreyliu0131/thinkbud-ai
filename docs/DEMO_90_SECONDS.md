# 90-second demo script

Run before the interview/demo:

```bash
npm ci
npm run demo
```

Open the local URL shown by Vite. The root page is the synthetic evidence dashboard in this mode.

## Script

**0–15s — Problem**

“Most AI tutor demos optimise for fluent answers. ThinkBud has the opposite product contract: protect the learner's thinking. The hard part is making ‘never give the answer’ enforceable and reviewable, not just a sentence in a system prompt.”

**15–35s — Mechanism**

Point to the synthetic conversation.

“Untrusted OCR and chat history are normalised, role-limited, bounded, and marked as data. On the text path, the short model turn is buffered and a deterministic output guard blocks answer or full-step leakage before the browser or TTS can receive it.”

**35–55s — Eval**

Point to the metric cards.

“This report comes from an actual local run. It replays 38 synthetic positive controls and bad cases across answer leakage, Socratic next questions, transfer, age fit, prompt injection, RTC/STT/SSE recovery, and latency/cost budget classification. The dataset and source-snapshot hashes bind the evidence to the exact isolated implementation.”

**55–72s — Bad cases and honesty**

“Negative controls are deliberately unsafe; the gate passes only if they are detected. No child records and no production model calls are used. So this proves the harness and deterministic controls—not live-model teaching quality.”

**72–90s — Release decision**

“The full release gate still fails. RTC can speak before the app can inspect output, so it is off by default. Live model outputs need blinded human review; privacy, vendor processing, asset provenance, and the project license need owner decisions. That fail-closed boundary is part of the product, not an embarrassing footnote.”

Do not claim real users, improved learning outcomes, adoption, retention, model quality, or production readiness.
