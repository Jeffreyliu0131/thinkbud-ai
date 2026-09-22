# Static demo operations

ThinkBud has one continuing source repository, `Jeffreyliu0131/thinkbud-ai`. The current publication target is a **static adult demonstration**, not the existing Cloudflare service. The former source-cutover plan is cancelled for this task. No backend credential recovery, service migration, database change, permission expansion or old-service shutdown is part of this release. The original service source, three subject policies and public safety improvements remain in the repository; former private history remains private.

## What visitors can use

- A three-subject policy explorer with authored task examples and selectable learner states, a source-backed concept vocabulary with a local BKT illustration, and inspectable synthetic examples of the output guard and RAG failure states. The expanded walkthrough is published; the README publication record identifies the exact application source.
- An adult-only, deterministic grade-4 maths practice loop: guided steps, independent transfer and a separate delayed-check preview.
- Optional local progress and local export. There is no account, business database, live model, SMS, voice, camera/OCR or provider API.
- The policy explorer spans Chinese, maths and English; the answer-entry practice workflow covers only the specified maths slice. It does not establish live language tutoring, learning outcomes or child-release readiness.

The static entry imports only demonstration pages. The service app and authentication/error-reporting entry are excluded at build time. Demo builds do not generate a service worker or include the RTC SDK, audio worklet, Functions, Worker or runtime configuration. The package's CSP restricts fetches to its own static origin. Source links intentionally open GitHub when the visitor chooses them.

## Build and verify

Use Node 22 and the lockfile:

```bash
npm ci
npm run verify
npm run demo:build
npm run demo:check
npm run evidence:verify
```

`demo:build` uses Vite's `synthetic-demo` mode, base `/thinkbud-ai/`, and a dedicated HashRouter entry. `dist-demo/` is the only deployable artifact. It contains built static assets, selected public icons, three synthetic reports and `build-info.json`. The stamp identifies the public Git base revision, whether build-source files are dirty, and a SHA-256 plus input-file list binding the exact source snapshot; regenerated evidence output is not a source-code change. `demo:check` rejects server/runtime artifacts, service endpoint/camera code and root-relative asset paths escaping the project base, and checks report bytes against the source reports.

For a complete local preview, build the static package first and run `npm run preview -- --mode synthetic-demo --base=/thinkbud-ai/`. It serves `dist-demo/` under **`/thinkbud-ai/`**. The development shortcut `npm run demo` starts the UI but, with the current disabled Vite `publicDir`, report requests receive an HTML fallback rather than JSON; do not use it to validate the complete showcase. This limitation was reproduced on 2026-09-22. Verify actual 200 JSON responses for all three report files; an HTML fallback or 404 does not count as success.

Canonical demo paths:

- Root: `/thinkbud-ai/`
- Practice and refreshable deep link: `/thinkbud-ai/#/practice`
- Showcase: `/thinkbud-ai/#/showcase`
- Preset degraded RAG state: `/thinkbud-ai/#/?rag=degraded`

Hash routing needs no server rewrite. Plain `/thinkbud-ai/practice` is not a supported route; all in-app links use the canonical hash form. Section navigation scrolls without replacing the route hash. Unknown hash routes return to the demo; no link leads to login/admin or the old service.

## Manual GitHub Pages publication

GitHub Pages is configured with GitHub Actions as its build source. The static demo is live at `https://jeffreyliu0131.github.io/thinkbud-ai/`; the exact published source and verification are recorded in the README publication section.

Only after the user explicitly authorizes publication of the reviewed candidate:

1. Review the complete candidate against the current public main and verify its snapshot hash. Commit/push only the explicitly approved source; do not rewrite history or import private ancestors. The `620b2fd` acceptance base described in historical records is not a required starting revision for future work. Keep the old services untouched.
2. Confirm the existing **Settings → Pages** build source remains **GitHub Actions**. Reuse the configured repository; no Cloudflare credentials, new product repo or paid resource is needed. Preserve any existing environment protections; do not invent a third-party approval dependency.
3. Record the approved exact main SHA and ensure its CI passes. Manually dispatch `.github/workflows/deploy-demo.yml` with `expected_sha` equal to that SHA. It checks the exact main revision, runs the engineering/evidence gate, builds/checks `dist-demo`, uploads only that directory and deploys with GitHub's built-in token/OIDC permissions. There is no push-triggered deployment and no custom deployment secret.
4. Compare the live `build-info.json` source SHA to the workflow SHA, verify both report responses are JSON/200, then exercise the root, practice, hash deep-link refresh, section jumps, preset RAG state switching and narrow-screen layout. Check there are no service/API requests, camera/microphone prompts or login redirects. Do not treat a page 200 as a complete interaction check.
5. Record the successful workflow/deployment URL and SHA in README. If the static release fails, redeploy a previously accepted static artifact/revision through the normal Pages workflow. Do not use or modify the old Cloudflare/Vercel service as a demo rollback target.

The initial independent acceptance stage was local-only. The owner subsequently authorized publication directly in the release task; source publication and the static Pages deployment were completed. Future publications still follow the explicit authorization and exact-source checks above.

## Original service boundary

The existing backend code is retained for review and future authorized work. It is not loaded by the public walkthrough; no currently supported full-service runtime or verified turnkey setup is offered here. Its formal release gate, RTC default-off policy, RAG limitations and privacy/license/human/live-evidence requirements remain. Publishing the preset static demo neither clears those gates nor declares a real tutoring service launched. Cloudflare/Vercel, DB, accounts, runtime keys and the private repo are unchanged. No former publisher is disabled and no private history is made public; old endpoints have not been certified as an operational tutoring service.

## Independent acceptance reproduction · 2026-09-21

Historical acceptance findings and snapshot hashes are recorded in the [README acceptance section](../README.md#static-demo-acceptance-and-publication-status--2026-09-21); the later online release is recorded separately in [publication verification](../README.md#static-publication-verification--2026-09-21). Follow the [interactive walkthrough](DEMO_90_SECONDS.md), then inspect the [captured states](showcase/README.md). Local reproduction below concerns only the static showcase.

A plain HTTP server can reproduce the Pages base without an SPA rewrite:

```bash
npm run demo:build
npm run demo:check
preview_dir="$(mktemp -d)"
ln -s "$PWD/dist-demo" "$preview_dir/thinkbud-ai"
python3 -m http.server 59833 --bind 127.0.0.1 --directory "$preview_dir"
```

Open `http://127.0.0.1:59833/thinkbud-ai/`. Check `eval-report.json`, `rag-eval-report.json`, `practice-eval-report.json` and `build-info.json` with `curl -i`; a successful HTML fallback does not count as a JSON response.

For local fault checks, use a disposable copy of `dist-demo` under the same base: have the server return `{}` with JSON content type, then 503, for the reports; delay responses for the loading state. Open “查看实现与证据”. The product entry must remain visible, the report result must be unavailable rather than passed, and “重新加载报告” must recover after normal files/responses are restored. Never modify a live deployment or the canonical report fixtures to create these failures.
