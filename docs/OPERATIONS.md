# Static demo operations

ThinkBud has one continuing source repository, `Jeffreyliu0131/thinkbud-ai`. The current publication target is a **static adult demonstration**, not the existing Cloudflare service. The former source-cutover plan is cancelled for this task. No backend credential recovery, service migration, database change, permission expansion or old-service shutdown is part of this release. The original service source, three subject policies and public safety improvements remain in the repository; former private history remains private.

## What visitors can use

- A preset synthetic coaching transcript and inspectable examples of the output guard and RAG failure states.
- An adult-only, deterministic grade-4 maths practice loop: guided steps, independent transfer and a separate delayed-check preview.
- Optional local progress and local export. There is no account, business database, live model, SMS, voice, camera/OCR or provider API.
- Product positioning spans Chinese, maths and English; the interactive example covers only the specified maths slice. It does not establish live language tutoring, learning outcomes or child-release readiness.

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

`demo:build` uses Vite's `synthetic-demo` mode, base `/thinkbud-ai/`, and a dedicated HashRouter entry. `dist-demo/` is the only deployable artifact. It contains built static assets, selected public icons, three synthetic reports and `build-info.json`. The stamp identifies the public Git base revision, whether build-source files are dirty, and a SHA-256 plus input-file list binding the exact uncommitted demo candidate; regenerated evidence output is not a source-code change. `demo:check` rejects server/runtime artifacts, service endpoint/camera code and root-relative asset paths escaping the project base, and checks report bytes against the source reports.

For ordinary local preview, `npm run demo` serves the same mode at `/`. For a realistic Pages check, serve `dist-demo/` under **`/thinkbud-ai/`**, not the server root. Verify actual 200 JSON responses for both `/thinkbud-ai/eval-report.json` and `/thinkbud-ai/rag-eval-report.json`; an HTML fallback or 404 does not count as success.

Canonical demo paths:

- Root: `/thinkbud-ai/`
- Practice and refreshable deep link: `/thinkbud-ai/#/practice`
- Showcase: `/thinkbud-ai/#/showcase`
- Preset degraded RAG state: `/thinkbud-ai/#/?rag=degraded`

Hash routing needs no server rewrite. Plain `/thinkbud-ai/practice` is not a supported route; all in-app links use the canonical hash form. Section navigation scrolls without replacing the route hash. Unknown hash routes return to the demo; no link leads to login/admin or the old service.

## Manual GitHub Pages publication

As checked on 2026-09-21, the repository Pages API returns 404 (no Pages site configured). Expected URL after successful enablement/deployment: `https://jeffreyliu0131.github.io/thinkbud-ai/`. This is a planned target, **not a claimed live deployment**.

Only after the user explicitly authorizes publication of the reviewed candidate:

1. Review the complete candidate against its declared public base and verify its snapshot hash. The independent acceptance checkout starts at public `620b2fd` and carries the candidate as uncommitted changes; it does not contain the earlier local consolidation commit. Commit/push only the explicitly approved source to public main; do not rewrite history or import private ancestors. Keep the old services untouched.
2. In the public repository's **Settings → Pages**, select **GitHub Actions** as the build source. Reuse the repository; no Cloudflare credentials, new product repo or paid resource is needed. Preserve any existing environment protections; do not invent a third-party approval dependency.
3. Record the approved exact main SHA and ensure its CI passes. Manually dispatch `.github/workflows/deploy-demo.yml` with `expected_sha` equal to that SHA. It checks the exact main revision, runs the engineering/evidence gate, builds/checks `dist-demo`, uploads only that directory and deploys with GitHub's built-in token/OIDC permissions. There is no push-triggered deployment and no custom deployment secret.
4. Compare the live `build-info.json` source SHA to the workflow SHA, verify both report responses are JSON/200, then exercise the root, practice, hash deep-link refresh, section jumps, preset RAG state switching and narrow-screen layout. Check there are no service/API requests, camera/microphone prompts or login redirects. Do not treat a page 200 as a complete interaction check.
5. Record the successful workflow/deployment URL and SHA in README. If the static release fails, redeploy a previously accepted static artifact/revision through the normal Pages workflow. Do not use or modify the old Cloudflare/Vercel service as a demo rollback target.

The previous public push was rejected by automatic approval review; a cross-task instruction is not being used to retry or bypass it. The independent acceptance task authorizes local repair and verification only. It does not authorize commit, push, Pages settings or deployment. Source publication and live demo deployment must each be reported truthfully, separately from local verification.

## Original service boundary

The existing backend code is retained for review and future authorized work. Its formal release gate, RTC default-off policy, RAG limitations and privacy/license/human/live-evidence requirements remain. Publishing the preset static demo neither clears those gates nor declares a real tutoring service launched. Cloudflare/Vercel, DB, accounts, runtime keys and the private repo are unchanged. No former publisher is disabled and no private history is made public.

## Independent acceptance reproduction · 2026-09-21

The current candidate, findings, exact snapshot hash and verification limits are recorded in the [README acceptance section](../README.md#static-demo-acceptance-and-publication-status--2026-09-21). Follow the [interactive walkthrough](DEMO_90_SECONDS.md), then inspect the [captured states](showcase/README.md). These documents describe local acceptance, not an online launch.

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
