# ThinkBud

ThinkBud is an AI thinking coach for primary-school learners. Instead of answering homework questions, it uses Socratic prompts, voice interaction, OCR, and mastery checks to help a learner explain their own reasoning.

The product rule is deliberately strict:

> AI guides the thinking process; the learner owns the answer.

## Ownership and evidence boundary

ThinkBud is an independent AI product project. I owned the product mechanism, coaching-policy evolution, prompt and safety constraints, multimodal workflow, acceptance criteria, QA, and release decisions. I used AI coding agents as implementation and review collaborators: I set scope, reviewed changes, diagnosed failures, and required tests before release.

This repository demonstrates a working technical prototype and product-decision process, not broad product-market fit. User validation to date has mainly been family testing, so I do not claim external adoption or measured learning outcomes.

The current public strengthening is evaluation-first. It uses synthetic cases only, records zero production-model calls and zero child records, and fails closed on release blockers instead of presenting repository activity as evidence of product readiness.

## What this project demonstrates

- Product constraints translated into enforceable AI behavior.
- A shared trust boundary for OCR, learner context, chat history, and knowledge extraction.
- A pre-display and pre-TTS text-output guard that blocks detected answer, indirect-answer, and worked-step leakage.
- Age-adaptive prompting for grades 1–3 and 4–6.
- Multimodal input through camera OCR, text, and real-time voice.
- Server-side prompt construction and output auditing.
- Knowledge tracking with Bayesian Knowledge Tracing (BKT).
- Parent and learner views built from the same underlying learning evidence.
- Failure recovery across RTC, STT, SSE, OCR, and browser storage.
- A failure-first synthetic evaluation suite, human-review rubric, provenance inventory, and fail-closed release gate.
- A backend textbook-RAG contract with deterministic ingestion, stable citations, retrieval budgets, and explicit provenance readiness.
- A provider-agnostic LLM gateway with typed streaming/usage/error/timeout metadata, an Ark adapter, and offline fake providers.
- A test suite covering prompt rules, auth, rate limiting, API handlers, hooks, and UI components.

Managed RTC speech currently bypasses the application output guard, so RTC is disabled by default with `VITE_ENABLE_RTC=false`. It must not be enabled for child-facing use or described as guard-equivalent until fresh live evidence and blinded human review pass.

## Core product loop

1. The learner photographs or uploads a question.
2. OCR extracts the question without treating page text as trusted instructions.
3. The server builds a grade- and subject-aware coaching prompt.
4. The server buffers the short text turn, audits it, and substitutes a safe fallback if the response appears to reveal an answer or complete solution.
5. The learner explains their reasoning by voice or text.
6. A transfer question checks whether the learner actually understood the idea.
7. The session updates knowledge evidence and generates a concise coach note.

## Architecture

- **Frontend:** React 19, TypeScript, Vite, PWA.
- **Backend:** Cloudflare Pages Functions.
- **AI and speech:** server-side provider adapters for chat, OCR, RTC, STT, and TTS.
- **Storage:** D1 for server-side learning records and IndexedDB for replaceable local state.
- **Safety:** authenticated endpoints, HMAC phone hashing, rate limits, CSP, untrusted-input filtering, blocking text-output guard, and explicit RTC release flag.

Provider credentials are never required by the browser bundle. Local values belong in ignored environment files; see [`.env.example`](.env.example).

The textbook knowledge layer is implemented as backend/offline logic and is **disabled by default**. The repository ships no real textbook, production embedding model, populated Vectorize index, or Vectorize binding. Its corpus is a tiny set of project-authored synthetic chunks used only to test retrieval and safety. See [Textbook RAG and LLM backend](docs/TEXTBOOK_RAG.md).

## Evaluation and testing

The repository includes:

- deterministic audit and blocking rules for answer leakage and unsafe coaching behavior;
- a fully synthetic release dataset with positive, negative, boundary, and adversarial cases;
- an independent human-review rubric and optional model-grader calibration path;
- unit, integration, hook, API, and component tests;
- provenance and release-readiness checks;
- a separate textbook-RAG eval with human-authored gold relevance labels, injection/filter/dedupe/budget/failure bad cases, and citation checks;
- build, lint, typecheck, tests, evals, and provenance checks in CI.

```bash
npm ci
npm run verify
npm run eval:rag
```

Credential-free evidence demo:

```bash
npm run demo
```

The full release gate is expected to remain non-zero until the owner selects a license, attests asset provenance, completes child/privacy approval, produces explicitly approved live-model evidence, and completes blinded human review:

```bash
npm run release:check
```

For the testing structure, see [TESTING.md](TESTING.md). For the evaluation contract and evidence, see [docs/evals/README.md](docs/evals/README.md), [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md), and [docs/CASE_STUDY.md](docs/CASE_STUDY.md). For the current coaching policy, see [docs/ThinkBud对话决策规范v5.md](docs/ThinkBud对话决策规范v5.md).

## Local development

```bash
cp .env.example .env
npm ci
npm run dev
```

The frontend can be explored without production credentials. Provider-backed API routes require your own server-side accounts and keys.

Offline Markdown/plain-text ingestion is available through `npm run rag:ingest -- ...`. It writes a manifest only; there is no public anonymous upload endpoint. A source lacking complete owner/provenance/license attestation is retained as non-production evidence and can never be marked `productionReady` by omission.

Synthetic demo mode is isolated from auth and provider-backed routes. It should not be used to imply live-model or user validation.

## Public-snapshot note

This repository is a clean public snapshot of version `1.2.1.0`. The original private development repository used AI coding agents and contained internal planning and deployment history. Those materials, production identifiers, credentials, and user data are intentionally excluded here.

No production learner records or real credentials are included. Tests use synthetic fixtures.

## License

No open-source license is granted. The source is public for portfolio review and technical discussion; all rights are reserved.
