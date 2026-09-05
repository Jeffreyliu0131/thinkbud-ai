# Minimal adult-only field pilot protocol

## Current focused hypothesis · 2026-09-05

The accepted product focus is one learning loop: primary grade 4, the distributive property, progressing from a coached example to an independent transfer item and a delayed equivalent item. This is a study design, not a claim that learners completed it. The first execution remains adult-only role-play under the boundaries below; actual learner improvement cannot be measured or inferred from adult role-play.

Compare two bounded coaching policies on equivalent synthetic questions: one cognitive-action hint versus an explanation of the concept using a different example after repeated difficulty. Never automatically reveal the current task's answer. Counterbalance order, record wrong-answer recovery and frustration as well as correctness. In a separately authorized future learner study, record pre-task performance, independent transfer without assistance, and delayed retention; do not treat a model-extracted `mastery` signal as the grader.

The near-term decision is whether teachers judge the escalation useful and whether the interface distinguishes observed dialogue signals from independently demonstrated understanding. Add no new subjects, modalities or knowledge-tree features before this question is resolved. Session consent, named owner, live-model approval and child-release blockers remain open.

## Decision and scope

The first external pilot should involve **non-family adult parents and primary-school teachers only**. Participants use synthetic worksheets and role-play the learner. No child participates, no participant enters a real child's homework or story, and the study does not claim learning improvement, adoption, retention, or safety for children.

Do not contact or recruit anyone until the owner approves this protocol, the notice/consent text, storage location, and named data owner.

## Learning questions

1. Can an adult explain ThinkBud's boundary—guidance without answers—after a 90-second demo?
2. Can they distinguish a productive next question from answer leakage or over-leading help?
3. Do recovery messages preserve trust when OCR, RTC/STT, or SSE fails?
4. What information would they need before allowing a child to use such a product?
5. Which tasks feel inappropriate or unsafe even when deterministic checks pass?

## Participants and session

- Target: 6–8 adults, ideally at least three parents and three primary educators, none from the owner's household or immediate family.
- Duration: 30 minutes remotely or in a neutral location.
- Prototype: local synthetic demo mode; no production account, no live child data, RTC disabled.
- Facilitation: one moderator and one note-taker where possible.
- Recording: off by default. If later needed, create a separate consent and retention decision first.

## Consent and opening script

Before the session, state in plain language:

- this is a prototype evaluation, not a teaching service;
- only synthetic tasks may be entered;
- participation is voluntary and can stop without reason;
- notes will use a participant code, not name/employer/school;
- the study will not measure their child or ask about a specific child;
- what is collected, why, who can access it, retention date, deletion contact, and complaint contact.

Ask for explicit adult consent and record only consent version, participant code, date, and yes/no. If the participant starts sharing a child's personal data, stop input, do not copy it into notes, delete any accidental capture, and record only `PRI-CONSENT: session stopped`.

## Tasks

1. View the synthetic evidence dashboard and explain what is and is not proven.
2. Compare one compliant Socratic response with one answer-leaking negative control.
3. Role-play a lower-grade arithmetic turn and an upper-grade transfer turn using supplied synthetic prompts.
4. Trigger an OCR injection fixture and inspect the filtered result.
5. Observe an RTC-connect fallback and an SSE partial-response interruption.
6. Review the proposed privacy boundary and identify missing trust information.

## Feedback rubric

Score 1–5 and capture one short rationale:

- value of the no-answer boundary;
- clarity/actionability of the next question;
- age fit;
- recovery trust after a failure;
- transparency about synthetic evidence and limitations;
- willingness to consider a future controlled child pilot **after** privacy/safety blockers are closed.

Also record any hard safety concern verbatim only if it contains no personal data.

## Success and stop thresholds

Proceed to a larger **adult-only** iteration only if:

- at least 80% can accurately state the no-answer boundary and evidence limitation;
- median next-question usefulness and recovery trust are at least 4/5;
- no answer leakage, prompt-boundary bypass, personal-data capture, or unrecoverable workflow failure occurs;
- every P1 concern has an owner and validation plan.

Stop the entire pilot immediately for any `SAF-*` leakage, `PRI-*` consent/data incident, accidental child data, participant distress, credential request, cross-participant data exposure, or inability to delete an accidental record. Do not average away a hard failure.

## De-identification and retention

- Study dataset: participant code (`P001`), broad role (`parent` or `educator`), ratings, and de-identified notes.
- Never collect child name/age/school, employer/school name, phone, email, exact location, account IDs, real homework, audio, image, transcript, or contact details in the study dataset.
- Keep recruiting contact details in a separate owner-controlled list and delete them within 14 days after scheduling/follow-up is complete.
- Proposed de-identified notes retention: 90 days after pilot conclusion, then delete or aggregate irreversibly. The owner must confirm this before collection.
- Store the deletion date and owner with each artifact. No raw notes enter Git.

## Output

Publish only participant counts, aggregate ratings, de-identified themes, bad cases, decision, and limitations. Never describe the pilot as child validation, learning-outcome evidence, adoption, or product-market fit.
