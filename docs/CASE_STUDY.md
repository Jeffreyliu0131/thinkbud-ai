# Case study: making a Socratic AI tutor falsifiable

## Context

ThinkBud is a Chinese-language homework-thinking coach for primary students. Its differentiation is a constraint: the AI should guide attention and reasoning without providing the answer or complete steps. The existing prototype covered OCR, text/voice interaction, RTC, grade/subject prompts, persistence, and learning-state features.

The product risk was that a strong prompt and a large test count could create false confidence. A child can be exposed to one leaked answer before a post-hoc log catches it; an application can be “green” while lint, privacy, live behavior, and deployment approval are outside CI.

## Product and architecture decisions

1. Treat OCR, learner context, and client-supplied history as untrusted data. Normalise Unicode, remove control/bidi tricks, flag override/role/tool patterns, enforce lengths and roles, and use explicit context delimiters.
2. Buffer the short text-model turn and run a blocking output guard before SSE reaches display or TTS. Accept the added completion-buffer latency as the cost of a hard safety property.
3. Do not pretend the same guarantee exists for the managed RTC Voice Agent. Disable RTC by default until the architecture can gate speech or fresh live evidence plus explicit risk acceptance exists.
4. Separate deterministic truth from judgment. Regex/state checks own hard failures; a human rubric owns question quality and age fit; any model grader is optional, calibrated, and advisory.
5. Make production release fail closed on legal/provenance/live-review evidence, not only code tests.

## Evaluation design

The versioned synthetic set includes good responses and bad negative controls across answer leakage, indirect hints, worked steps, next-question structure, transfer bridges, emotion adaptation, age length, OCR/prompt injection, role spoofing, control/bidi pollution, RTC/STT/SSE recovery, and telemetry budgets.

Each run emits commit and dataset/config hashes, case-level failure codes, a JSON result, and a standalone HTML dashboard. No real child data or paid/model call is needed. A separate calibration harness requires minimum agreement and unsafe recall before grader output can be considered.

## Measured result on the public integration branch

- Deterministic synthetic gate: 38/38 cases matched the human-authored expected outcome.
- Automated tests: 28 files passed; 370 tests passed; 2 existing tests skipped.
- Production model calls: 0.
- Real child records: 0.
- Runtime npm audit after remediation: 0 known advisories at the audited time.
- Full release gate: FAIL by design, pending license, asset attestation, fresh live-model evidence, and blinded human review.

These numbers demonstrate reproducibility of the guardrails and evaluator. They are not evidence of learning impact, user adoption, or live-model quality.

## What changed in the product story

The flagship is no longer “an AI tutor with many features.” It is a falsifiable applied-AI system with a visible chain:

**problem contract → trust boundaries → blocking behavior → synthetic bad cases → human judgment → release decision → adult-only pilot preparation**.

That chain is useful beyond education: it demonstrates how to turn a qualitative AI-product principle into code, evaluation, operational gates, and an honest account of residual risk.

## Next experiment

After owner approval of credentials and data boundaries, generate a fresh model slice without children, record exact model/config/latency/token/cost metadata, conduct two-rater blinded review, and compare text vs RTC. If RTC cannot match the text safety boundary, keep it disabled or replace the managed agent with a controllable output path.
