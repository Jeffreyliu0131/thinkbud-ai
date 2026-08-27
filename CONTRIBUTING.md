# Contributing to ThinkBud

ThinkBud is a child-facing learning prototype. A change is not complete when it merely works; it must preserve the boundary that the AI guides thinking without supplying the answer.

## Before contributing code

The repository does **not yet have a project license**. Until the owner explicitly selects and adds one, the repository is source-visible but not legally open source. To avoid ambiguous rights, external code contributions should wait for that decision. Synthetic bug reports, evaluation cases, and design discussion are welcome.

Never put real children's data, homework photos, phone numbers, recordings, transcripts, credentials, school names, or production logs in an issue, test, fixture, screenshot, or pull request.

## Local setup

```bash
npm ci
npm run verify
```

Useful commands:

```bash
npm test                       # unit/integration tests, no external APIs
npm run eval:gate              # deterministic synthetic behavior gate
npm run evidence               # eval + dependency/asset provenance reports
npm run demo                   # credential-free synthetic evidence UI
npm run release:check          # full gate; fails until legal/live-review blockers are resolved
```

`npm run demo` uses only generated synthetic evidence. The regular app still needs service credentials and a Cloudflare-compatible local environment.

## Change contract

Every AI-behavior change should include:

1. The failure or user problem it addresses.
2. At least one synthetic good case and one bad/negative-control case.
3. A deterministic hard check where feasible.
4. Human-rubric criteria for qualities that cannot be reduced to a regex.
5. Failure recovery and rollback behavior.

Every textbook-RAG change must additionally include source/provenance readiness behavior, a human-authored relevant query, an out-of-scope or no-result case, stable citation assertions, and provider/store failure recovery. Never add a real textbook, school file, learner material, or anonymous upload route to a public fixture.

Blocking output failures include direct or indirect answers, complete worked steps, prompt/role injection crossing a trust boundary, lost partial work during recovery, and exposure of personal or credential data.

## Pull requests

- Keep changes scoped and reviewable.
- Run `npm run verify` and paste the concise gate result.
- Update provenance for every dependency, font, icon, image, audio file, or copied snippet.
- Do not enable RTC by default without fresh live-model evidence and blinded human review.
- Do not alter or add a license unless the owner has explicitly chosen it.
- Deployment, secrets, production data, and external contact are outside normal PR scope.

See [docs/evals/README.md](docs/evals/README.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).
