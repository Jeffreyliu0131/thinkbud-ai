# ThinkBud

ThinkBud is an AI thinking coach for primary-school learners. Instead of answering homework questions, it uses Socratic prompts, voice interaction, OCR, and mastery checks to help a learner explain their own reasoning.

The product rule is deliberately strict:

> AI guides the thinking process; the learner owns the answer.

## Ownership and evidence boundary

ThinkBud is an independent AI product project. I owned the product mechanism, coaching-policy evolution, prompt and safety constraints, multimodal workflow, acceptance criteria, QA, and release decisions. I used AI coding agents as implementation and review collaborators: I set scope, reviewed changes, diagnosed failures, and required tests before release.

This repository demonstrates a working technical prototype and product-decision process, not broad product-market fit. User validation to date has mainly been family testing, so I do not claim external adoption or measured learning outcomes.

## What this project demonstrates

- Product constraints translated into enforceable AI behavior.
- Age-adaptive prompting for grades 1–3 and 4–6.
- Multimodal input through camera OCR, text, and real-time voice.
- Server-side prompt construction and output auditing.
- Knowledge tracking with Bayesian Knowledge Tracing (BKT).
- Parent and learner views built from the same underlying learning evidence.
- Failure recovery across RTC, STT, SSE, OCR, and browser storage.
- A test suite covering prompt rules, auth, rate limiting, API handlers, hooks, and UI components.

## Core product loop

1. The learner photographs or uploads a question.
2. OCR extracts the question without treating page text as trusted instructions.
3. The server builds a grade- and subject-aware coaching prompt.
4. The coach asks one useful question at a time and avoids giving the answer.
5. The learner explains their reasoning by voice or text.
6. A transfer question checks whether the learner actually understood the idea.
7. The session updates knowledge evidence and generates a concise coach note.

## Architecture

- **Frontend:** React 19, TypeScript, Vite, PWA.
- **Backend:** Cloudflare Pages Functions.
- **AI and speech:** server-side provider adapters for chat, OCR, RTC, STT, and TTS.
- **Storage:** D1 for server-side learning records and IndexedDB for replaceable local state.
- **Safety:** authenticated endpoints, HMAC phone hashing, rate limits, CSP, prompt-injection filtering, and AI-output audits.

Provider credentials are never required by the browser bundle. Local values belong in ignored environment files; see [`.env.example`](.env.example).

## Evaluation and testing

The repository includes:

- deterministic audit rules for answer leakage and unsafe coaching behavior;
- synthetic ground-truth conversations for knowledge extraction;
- unit, integration, hook, API, and component tests;
- build and lint checks in CI.

```bash
npm ci
npm test
npm run build
npm run lint
```

For the testing structure, see [TESTING.md](TESTING.md). For the current coaching policy, see [docs/ThinkBud对话决策规范v5.md](docs/ThinkBud对话决策规范v5.md).

## Local development

```bash
cp .env.example .env
npm ci
npm run dev
```

The frontend can be explored without production credentials. Provider-backed API routes require your own server-side accounts and keys.

## Public-snapshot note

This repository is a clean public snapshot of version `1.2.1.0`. The original private development repository used AI coding agents and contained internal planning and deployment history. Those materials, production identifiers, credentials, and user data are intentionally excluded here.

No production learner records or real credentials are included. Tests use synthetic fixtures.

## License

No open-source license is granted. The source is public for portfolio review and technical discussion; all rights are reserved.
