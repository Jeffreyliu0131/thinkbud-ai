// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { describe, it, expect } from 'vitest'
import { addMessage, ensureConversation } from '../_shared/db'

function database() {
  const sql = new DatabaseSync(':memory:')
  sql.exec(`CREATE TABLE conversations(id TEXT PRIMARY KEY, user_id TEXT, message_count INTEGER DEFAULT 0);
    CREATE TABLE messages(id TEXT PRIMARY KEY, conversation_id TEXT, role TEXT, content TEXT, input_method TEXT, emotion TEXT, session_phase TEXT, compliance_issues TEXT);`)
  const db = {
    prepare(query: string) {
      return { bind(...args: (string | null)[]) {
        return { async run() { const result = sql.prepare(query).run(...args); return { success: true, meta: { changes: Number(result.changes) } } },
          async first() { return sql.prepare(query).get(...args) ?? null } }
      } }
    },
    async batch(statements: { run: () => Promise<unknown> }[]) {
      sql.exec('BEGIN')
      try { const results = []; for (const stmt of statements) results.push(await stmt.run()); sql.exec('COMMIT'); return results }
      catch (error) { sql.exec('ROLLBACK'); throw error }
    },
  } as unknown as D1Database
  return { sql, db }
}

describe('SQL account boundary', () => {
  it('rejects a second owner and protects writes even without an earlier ownership check', async () => {
    const { db, sql } = database()
    try {
      await ensureConversation(db, 'session', 'A')
      await expect(ensureConversation(db, 'session', 'B')).rejects.toThrow('Conversation unavailable')
      await expect(addMessage(db, 'msg-B', 'session', 'user', 'B text', undefined, undefined, 'B')).rejects.toThrow()
      expect(sql.prepare('SELECT COUNT(*) AS n FROM messages').get()?.n).toBe(0)
      expect(sql.prepare('SELECT message_count FROM conversations').get()?.message_count).toBe(0)
      await addMessage(db, 'msg-A', 'session', 'user', 'A text', undefined, undefined, 'A')
      expect(sql.prepare('SELECT message_count FROM conversations').get()?.message_count).toBe(1)
    } finally { sql.close() }
  })
  it('rolls back the count when inserting a duplicate message fails', async () => {
    const { db, sql } = database()
    try {
      await ensureConversation(db, 'session', 'A')
      await addMessage(db, 'msg', 'session', 'user', 'text', undefined, undefined, 'A')
      await expect(addMessage(db, 'msg', 'session', 'user', 'text', undefined, undefined, 'A')).rejects.toThrow()
      expect(sql.prepare('SELECT message_count FROM conversations').get()?.message_count).toBe(1)
    } finally { sql.close() }
  })
})
