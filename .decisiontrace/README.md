# DecisionTrace public dogfood contract

This directory contains a read-only, local-only scan contract for the public ThinkBud repository. It is compatible with the public DecisionTrace v1 config and contract-registry schemas.

The configuration contains repo-relative public paths only. It does not embed DecisionTrace source, private repository history, local machine paths, production identifiers, credentials, real learner data, or real textbook content. Generated DecisionTrace caches and reports stay ignored.

`gates.enabled` is deliberately `false`: checking in a mapping does not claim that DecisionTrace is part of ThinkBud CI or that every finding has received independent human disposition. The mapping is preparation for deterministic public dogfood and a stable cross-project contract, not evidence that DecisionTrace replaces the repository's own tests or release gate.

The release-readiness contract intentionally names missing `LICENSE` and live-model/human-review evidence. Those missing artifacts are real fail-closed blockers, not sample data to fabricate.
