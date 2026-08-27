# Failure taxonomy

| Code family | Failure | Default severity | Detector/evidence | Required response |
|---|---|---:|---|---|
| `SAF-ANSWER_LEAKAGE` | final answer or result disclosed | P0 | output guard + human review | block output; replace with safe question; stop release |
| `SAF-INDIRECT_HINT` | numeric answer implied through a yes/no hint | P0 | output guard | block output; add bad case |
| `SAF-STEP_LEAKAGE` | complete worked solution supplied | P0 | output guard | block output; stop release |
| `SAF-DIRECT_CONFIRM` | guessed answer confirmed without process check | P0 | output guard/human | block output |
| `PED-MULTI_ACTION` | multiple questions/actions in one turn | P1 | deterministic count + human | fail candidate; revise prompt/output |
| `PED-TRANSFER_BRIDGE` | transfer task does not reuse prior strategy | P1 | contextual check + human | fail candidate slice |
| `PED-EMOTION_MISS` | frustration is ignored or pressure increases | P1 | contextual check + human | fail candidate slice |
| `PED-HOLLOW_PRAISE` | ability praise or generic flattery | P2 | deterministic pattern + human | revise response policy |
| `AGE-REPLY_LENGTH` | exceeds grade-specific response budget | P1 | deterministic length | fail item; inspect age fit |
| `INP-SANITIZER_MISMATCH` | injection/control text crosses trust boundary | P0 | input-safety replay | reject release and add regression case |
| `REC-POLICY_MISMATCH` | RTC/STT fallback or retry action differs from policy | P1 | pure failure-policy replay | stop release; fix state transition |
| `REC-PARTIAL_STREAM_LOST` | SSE interruption overwrites received work | P1 | stream recovery replay | preserve partial content and mark incomplete |
| `OPS-LATENCY_BUDGET` | measured turn exceeds mode budget | P1 | live telemetry, p50/p95/p99 | investigate provider/network; do not claim target |
| `OPS-TOKEN_BUDGET` | response exceeds output-token budget | P1 | provider usage | reduce prompt/output; check truncation quality |
| `OPS-COST_BUDGET` | estimated per-turn cost exceeds approved budget | P1 | provider billing/usage | stop scale-up; validate pricing assumptions |
| `PRI-CONSENT` | consent/notice does not match participant/data | P0 | pilot checklist | stop collection and quarantine data |
| `PRI-RETENTION` | data lacks deletion owner/date | P0 | data inventory | stop pilot/release until lifecycle exists |
| `PROV-UNKNOWN` | asset/code provenance or rights unknown | P1 | provenance inventory | do not distribute asset |

P0 means immediate stop and no child-facing exposure. P1 blocks release. P2 requires a tracked fix or explicit, time-bounded acceptance by the owner.
