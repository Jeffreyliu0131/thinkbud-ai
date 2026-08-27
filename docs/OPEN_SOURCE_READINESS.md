# Open-source readiness and license decision

## Current legal status

There is no `LICENSE` file and no package-level license declaration. Therefore the repository may be viewable, but downstream users do not have an explicit grant to copy, modify, or redistribute it. It should not yet be described as open source.

No license was added in this work because selecting one grants legal rights and requires an explicit owner decision.

## License options for the owner

| Option | Practical fit | Trade-off |
|---|---|---|
| Apache-2.0 | Strong default for an AI/evaluation infrastructure flagship; explicit patent grant and contribution terms | Longer text; NOTICE/patent provisions require more care |
| MIT | Very short, familiar, low-friction adoption | No explicit patent grant; less detailed contribution framework |

Engineering recommendation: prefer **Apache-2.0** if patent clarity and future organisational contributors matter; prefer **MIT** if minimalism is the overriding goal. Confirm contributor ownership and obtain legal advice appropriate to the owner's situation before choosing.

## Dependency and asset result

`npm run provenance:check` generates a lockfile-based dependency inventory and asset hashes. Direct runtime dependencies currently report permissive metadata in the lockfile. Transitive LGPL/MPL/CC-BY entries are mainly build/tooling packages and still need distribution-path review; a package name in the lockfile is not itself proof that its binary/content is shipped.

The favicon, PNG app icons, inline mascot/face illustrations, and audio-worklet source exist in first-party history, but their creation/tool/source provenance is not documented. They remain `ownerAttested: false` in `provenance/assets.json` and block distribution readiness.

## Repository readiness gaps

- The canonical public showcase repository is `Jeffreyliu0131/thinkbud-ai`.
- Enable branch protection requiring the CI workflow and review.
- Configure GitHub private security advisories for sensitive reports.
- Decide support expectations, versioning, and maintainer ownership.
- Add license/notice files only after the explicit owner decision.

The code and governance files are prepared for a public release; they do not make the release legally or operationally ready by themselves.
