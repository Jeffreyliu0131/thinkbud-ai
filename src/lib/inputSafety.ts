/** Browser-facing re-export of the shared deterministic input boundary. */
export {
  sanitizeOcrText,
  sanitizeUntrustedText,
  wrapUntrustedContext,
} from '../../functions/_shared/input-safety'
export type {
  InputSafetyFlag,
  SanitizedText,
  SanitizeUntrustedTextOptions,
} from '../../functions/_shared/input-safety'
