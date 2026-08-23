// Child Progress Page type contracts (Phase 17 -- CAPI-01)

export interface KnowledgePointDisplay {
  concept: string      // KC slug e.g. 'carrying'
  label: string        // Chinese label e.g. '进位加法'
  stars: 1 | 2 | 3     // integer star rating, never raw float
  starLabel: string    // '正在探索' | '逐渐掌握' | '已经很熟练'
  encounters: number   // times encountered
}

export interface SubjectProgress {
  label: string        // '数学' | '语文' | '英语'
  points: KnowledgePointDisplay[]
}

export interface ChildProgressResponse {
  subjects: Record<string, SubjectProgress>  // keyed by 'math' | 'chinese' | 'english'
  sessionCount: number                       // total conversation count for cold start detection
}
