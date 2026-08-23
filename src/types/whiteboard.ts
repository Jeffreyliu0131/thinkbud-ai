export interface WhiteboardStep {
  id: number              // Sequential step number (starts at 1)
  label: string           // Short Chinese label, e.g. "观察等式", "移走+6"
  math?: string           // KaTeX string (optional -- not all steps need math)
  highlight?: string      // Which part to visually emphasize
  hint?: string           // Socratic hint text (NOT the answer -- product constitution)
  status: 'upcoming' | 'current' | 'done'  // Frontend manages this, AI does not set it
}
