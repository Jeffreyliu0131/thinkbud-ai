# Security

## Credentials

- Keep all provider credentials in ignored local environment files or encrypted deployment secrets.
- Never commit `.env`, `.env.*`, or `.dev.vars`.
- Treat screenshots, logs, fixtures, and generated reports as possible secret-bearing files.

## User data

This public snapshot contains no production learner records. Tests use synthetic fixtures. Do not submit real phone numbers, conversations, homework images, or account exports in issues.

## Reporting

Do not open a public issue for credential exposure, personal-data exposure, answer-leakage bypasses, authentication failures, or a prompt-injection path that reaches a child-facing output. Use GitHub's private security-advisory flow when available, or contact the repository owner through their GitHub profile.

Reports should contain only synthetic reproduction data and include the commit SHA, affected path, expected boundary, observed behavior, and minimal reproduction. Do not attach real homework, audio, phone numbers, transcripts, user IDs, production logs, or secrets.

Highest-priority report classes:

- a child-facing output reveals an answer or complete worked solution;
- untrusted OCR/chat text changes system or tool behavior;
- RTC speaks content that has not passed the output guard;
- authentication or authorization exposes another user's records;
- a vendor or application path stores data outside the disclosed boundary;
- a deployment workflow bypasses the release gate.

## Deployment

The public repository intentionally contains no production deployment workflow or infrastructure identifiers. Forks must configure their own infrastructure, database, domains, and secrets.

This repository represents a prototype and does not claim a production security SLA. Child-facing production use remains blocked pending the items in [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).
