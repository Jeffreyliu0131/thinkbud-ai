# Release checklist

## Current verdict

The deterministic engineering gate can pass. The **full v1 public/model release gate is intentionally FAIL** until the owner chooses a project license, attests asset provenance, produces fresh live-model evidence, and completes blinded human review. Child-facing deployment has additional privacy blockers.

Run:

```bash
npm run verify
npm run release:check
```

`release:check` must remain fail-closed. Do not replace missing evidence with a checkbox or model-judge score.

## G0 — source and reproducibility

- [ ] Clean release commit and immutable tag candidate identified.
- [ ] `npm ci` works on a clean clone with supported Node.
- [ ] `npm run verify` passes: lint, typecheck, unit/integration, synthetic eval, provenance inventory, build.
- [ ] Generated reports identify commit, dataset hash, configuration hash, and time.
- [ ] Bad cases and known limitations are included, not deleted to make a chart green.

## G1 — AI behavior

- [ ] Text output guard blocks all `SAF-*` negative controls before display/TTS.
- [ ] Fresh outputs generated from exact model ID, prompt hash, settings, and transport.
- [ ] Two-rater blinded review passes [evals/HUMAN_RUBRIC.md](evals/HUMAN_RUBRIC.md).
- [ ] Optional grader, if used, passes held-out calibration and remains advisory.
- [ ] RTC remains disabled, or its output is gated before speech and passes a separate live slice.

## G2 — resilience and operations

- [ ] RTC connect, health timeout, and mid-session failures fall back to STT.
- [ ] STT retries are bounded; SSE preserves partial content.
- [ ] Live p50/p95/p99 latency and provider usage/cost are measured, not inferred from synthetic telemetry.
- [ ] Rate limits, timeouts, retry limits, cost alerts, and rollback owner are set.
- [ ] Production deploy is manual, environment-protected, and depends on the full gate.

## G3 — privacy and child safety

- [ ] Approved DPIA and data inventory.
- [ ] Age/guardian consent and child-readable notice implemented.
- [ ] Raw-phone necessity resolved; retention/export/correction/withdrawal/deletion implemented.
- [ ] Vendor region, retention, training use, subprocessors, transfers, security, and deletion verified.
- [ ] Admin MFA/access logging and incident/breach procedure tested.
- [ ] No child-facing field work until these items pass.

## G4 — OSS distribution

- [ ] Owner explicitly chooses and adds a project license; no agent may infer this decision.
- [ ] All first-party contributors/rights holders confirmed.
- [ ] Icon, illustration, font, audio, fixture, and copied-code provenance attested.
- [ ] Third-party license/notice obligations reviewed for shipped artifacts.
- [ ] CONTRIBUTING, SECURITY, issue/PR templates, architecture, eval docs, and support boundary are current.
- [ ] Public repository URL, CI badges, branch protection, security advisory route, and release artifacts verified.

## G5 — release and post-release

- [ ] Changelog describes value, evidence, limits, and migrations.
- [ ] Rollback is tested and does not lose/de-orphan stored data.
- [ ] Release owner gives explicit go/no-go.
- [ ] Tag/push/release/deploy are separately authorised.
- [ ] Monitoring and incident review dates scheduled.
