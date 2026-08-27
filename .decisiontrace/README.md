# DecisionTrace public dogfood contract

This directory contains a read-only, local-only scan contract for the public ThinkBud repository. It is compatible with the public DecisionTrace v1 config and contract-registry schemas.

The configuration contains repo-relative public paths only. It does not embed DecisionTrace source, private repository history, local machine paths, production identifiers, credentials, real learner data, or real textbook content. Generated DecisionTrace caches and reports stay ignored.

`gates.enabled` is deliberately `false`: checking in a mapping does not claim that DecisionTrace is part of ThinkBud CI or that every finding has received independent human disposition. The mapping is preparation for deterministic public dogfood and a stable cross-project contract, not evidence that DecisionTrace replaces the repository's own tests or release gate.

The release-readiness contract intentionally names missing `LICENSE` and live-model/human-review evidence. Those missing artifacts are real fail-closed blockers, not sample data to fabricate.

## Compatibility smoke test

The committed mapping was exercised with the public DecisionTrace 0.4.0 deterministic CLI in `semantic off` mode across the public ThinkBud change that introduced it. The scan completed with zero config/parser diagnostics, zero D1, zero D3, and two formal D2 findings: the intentionally absent `LICENSE` and `evals/live/results/latest.json`. The previously reported RTC-default evidence gap is closed by the dedicated reducer and prefetch tests in this repository.

That result is a compatibility and contract-coverage check only. It is not an independent precision estimate, external validation, or permission to enable DecisionTrace hard gates. Generated local reports remain ignored.
