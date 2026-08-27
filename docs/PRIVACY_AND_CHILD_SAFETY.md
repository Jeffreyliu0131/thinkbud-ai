# Privacy and child-safety boundary

## Current verdict

**Do not deploy ThinkBud to children or collect field data yet.** The code contains useful security controls, but it lacks a complete consent flow, child-readable notice, retention/deletion workflow, vendor data-processing verification, and an approved DPIA. RTC is additionally unable to enforce the pre-output answer guard and is disabled by default.

This document is an engineering readiness assessment, not legal advice.

## Why the bar is high in Singapore

The Singapore PDPC's [Advisory Guidelines on the PDPA for Children's Personal Data in the Digital Environment](https://www.pdpc.gov.sg/-/media/files/pdpc/pdf-files/advisory-guidelines/advisory-guidelines-on-the-pdpa-for-children%27s-personal-data-in-the-digital-environment_mar24.pdf) explicitly cover EdTech likely to be accessed by children. They call for data protection by design, child-understandable notices, data minimisation, stronger protection, and a DPIA before launch. The guidance says parental/guardian consent must be obtained for children below 13; consent for ages 13–17 depends on genuine understanding, and organisations may choose a higher threshold. The broader [PDPA Key Concepts guidelines](https://www.pdpc.gov.sg/guidelines-and-consultation/2020/03/advisory-guidelines-on-key-concepts-in-the-personal-data-protection-act) also cover purpose, notification, access/correction, protection, retention, transfer, breach notification, and accountability.

## Current data map

| Data | Entry | Processing/storage | Current gap |
|---|---|---|---|
| Phone number and hash | SMS login | D1 `users`; raw phone and hash both stored | raw-phone necessity not justified; no deletion lifecycle |
| Nickname and grade | onboarding/profile | D1 and browser state | no child-readable notice/consent record |
| Homework image | camera/upload | external OCR/vision provider; IndexedDB session may retain data URL | vendor retention/transfer and local deletion not defined |
| OCR text | provider result | chat/RTC context, browser state, local session; schema can store OCR | may contain names/school data; no automatic PII minimisation |
| Audio | microphone | RTC or STT provider | vendor retention/region/DPA not verified; recording notice absent |
| Conversation text | chat/RTC | D1 `messages`, IndexedDB sessions, model provider | retention/access/export/delete absent |
| Emotion/session labels | model/app | D1/local analytics | inference purpose and accuracy notice absent |
| Knowledge signals | extraction model | D1 and IndexedDB | derived profile; purpose/retention/correction absent |
| Error stack/path/meta | global handler | D1 error logs | can capture incidental identifiers; retention/redaction absent |
| Textbook source/content | offline operator ingestion | local manifest today; future embedding/store/provider | rights/owner attestation, school identifiers, retention, deletion, and provider processing must be approved per source |
| Textbook embeddings/citations | future configured RAG runtime | vector index plus server/eval metadata | no production provider/index is configured; deletion and source-version invalidation are not implemented |

## Controls present

- Server-side prompts and credential boundaries.
- HMAC phone hash, httpOnly authentication cookie, route middleware, rate limits, CSP.
- Message ownership checks for RTC persistence.
- Shared prompt-injection/OCR sanitizer and strict client role allowlist.
- Text output blocking guard for answer/step leakage.
- Fully synthetic default eval and demo mode.
- Default-off textbook RAG, no public upload route, provenance readiness checks, and synthetic-only bundled textbook fixtures.

These controls reduce risk; they do not complete PDPA obligations.

## Blocking work before any child-facing pilot

1. Approve a DPIA with named data owner and incident owner.
2. Decide the lawful/consent basis and implement age-aware, child-readable and guardian notices; store consent version/time.
3. Minimise registration and decide whether raw phone is necessary. If not, migrate/remove it securely.
4. Define retention per table and implement user/guardian export, correction, withdrawal, and deletion—including D1, IndexedDB, logs, backups, and vendor copies.
5. Verify each vendor's processing purpose, region/transfers, retention, training use, security controls, subprocessors, and deletion route.
6. Add admin MFA/access logs and run penetration/security testing before commissioning.
7. Disable image/audio capture until the corresponding notice and consent state is present.
8. Add PII detection/redaction for OCR, transcripts, and error telemetry.
9. Establish breach assessment and child/guardian notification procedures.
10. Complete fresh live-model eval and blinded human review; keep RTC disabled until its output can be gated or an explicit architecture decision accepts the residual risk.
11. Before any real textbook ingestion, verify ownership/license, define the operator/admin authorization boundary, remove incidental learner/school data, and implement source/version deletion across manifests, embeddings, caches, and provider copies.

The adult-only protocol in [FIELD_PILOT_PROTOCOL.md](FIELD_PILOT_PROTOCOL.md) deliberately avoids child data while these blockers remain.
