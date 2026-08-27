# ThinkBud evaluation system

## What this proves

`npm run eval:gate` replays a versioned, fully synthetic set through production deterministic controls. It verifies good-case acceptance, bad-case detection, OCR/prompt-injection filtering, RTC/STT/SSE recovery decisions, and synthetic latency/cost budget classification.

It does **not** prove that a live model is consistently Socratic, age-appropriate, low-latency, or cost-efficient. Those claims require fresh outputs from the exact model/configuration plus blinded human review.

## Evaluation layers

1. **Prompt contract tests** confirm that required policies are present in both grade variants.
2. **Unit/integration tests** exercise input sanitisation, output blocking, hooks, endpoints, state, and recovery.
3. **Deterministic synthetic gate** runs positive controls and known bad cases with explicit expected failure codes.
4. **Blinded human review** scores fresh model outputs using [HUMAN_RUBRIC.md](HUMAN_RUBRIC.md).
5. **Optional model grader** may add triage signal only after calibration against held-out human labels.
6. **Adult-only field pilot** tests comprehension, trust calibration, and workflow—not learning outcomes.

## Commands and artifacts

```bash
npm run eval:gate
npm run eval:calibrate-grader
npm run evidence
```

`npm run eval:live` is fail-closed and will not call a provider unless `EVAL_ALLOW_PAID_API=YES` plus endpoint/key/model variables are explicitly supplied after approval. It uses only synthetic prompts, writes candidate outputs for review, and leaves the release status blocked.

Generated evidence:

- `evals/results/latest.json`: case-level deterministic evidence.
- `evals/results/latest.md`: concise interpretation.
- `artifacts/evals/latest/report.html`: standalone dashboard.
- `public/eval-report.json`: data shown by synthetic demo mode.
- `evals/results/grader-calibration.json`: calibration mechanics example.

Every result includes the source commit, dataset SHA-256, gate configuration SHA-256, generation time, and explicit counts of model calls and real-child records.

## Adding a case

Add only synthetic data to `evals/cases/synthetic-v1.json`. Each case needs a stable ID, dimension, expected outcome, and—when failing—one or more taxonomy codes. A detector change must include both a bad case and a nearby good case to measure false positives.

Negative controls are expected to fail the candidate behavior. The gate passes only when the evaluator detects them as expected; it does not pretend all fixture outputs are good.

## Model grader policy

A grader is optional and never a source of truth. Before use, calibrate on at least 20 held-out items with human labels. Required minimums are accuracy 0.85, unsafe recall 0.90, and Cohen's kappa 0.60. Failed calibration means grader output is discarded. Even a calibrated grader cannot override `SAF-*`, `INP-*`, or `REC-*` deterministic failures.

The bundled calibration file is a synthetic test of the calibration code, not evidence that any real model grader is calibrated.
