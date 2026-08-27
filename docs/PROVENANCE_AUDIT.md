# Provenance audit

## Scope and method

The audit covers tracked first-party source, direct and transitive npm metadata from `package-lock.json`, browser fonts, icons/images, inline SVG illustrations, audio-worklet source, model/vendor integrations, and generated evaluation fixtures. It does not infer rights from Git history and does not replace legal review.

## Findings

- Project code: no explicit license grant; distribution rights pending owner decision.
- Direct runtime packages: lockfile metadata is permissive (BSD/ISC/MIT families at the audited lock state).
- Transitive review set: LGPL-licensed libvips platform packages, MPL-licensed Lightning CSS binaries, and CC-BY caniuse data appear in the dependency graph. Confirm whether and how these are redistributed in release artifacts and preserve required notices.
- Fonts: only system font stacks are referenced; no bundled web-font file was found.
- Images/icons: five app-icon/favicon files are tracked; source/derivation and rights attestation are missing.
- Inline art: BudMascot and CoachFace are source-rendered SVG components; design/tool provenance is missing.
- Evaluation set: authored synthetic fixtures, explicitly marked as containing no real participant data.
- Models/services: Ark chat/vision, Volcano RTC/STT/TTS/OCR, and Aliyun SMS are integrations, not redistributed models. Model IDs, provider terms, data use, regional processing, and acceptable-use constraints require deployment-time verification.

## Required owner actions

1. Choose the project license.
2. Confirm contributor/author rights for first-party code.
3. Attest each entry in `provenance/assets.json` or replace/remove it.
4. Generate an attribution/NOTICE artifact from the final production dependency tree.
5. Record model/vendor versions and applicable terms in each release's evidence manifest.
