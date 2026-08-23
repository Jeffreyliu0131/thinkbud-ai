import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Session, LearnerProfile, KnowledgePointRecord } from '../types'

interface ThinkBudDB extends DBSchema {
  sessions: {
    key: string
    value: Session
    indexes: { 'by-date': number; 'by-created': number }
  }
  learnerProfile: {
    key: string
    value: LearnerProfile
  }
  knowledgePoints: {
    key: string               // composite key: `${userId}:${subject}:${concept}`
    value: KnowledgePointRecord
    indexes: { 'by-user': string; 'by-user-subject': [string, string] }
  }
}

let dbPromise: Promise<IDBPDatabase<ThinkBudDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<ThinkBudDB>('thinkbud', 5, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          const store = db.createObjectStore('sessions', { keyPath: 'id' })
          store.createIndex('by-date', 'updatedAt')
          store.createIndex('by-created', 'createdAt')
        }
        if (oldVersion < 2) {
          // v1→v2: 添加 by-created 索引（用于日期分组）
          const store = transaction.objectStore('sessions')
          if (!store.indexNames.contains('by-created')) {
            store.createIndex('by-created', 'createdAt')
          }
        }
        if (oldVersion < 3) {
          // v2→v3: 添加 learnerProfile store
          db.createObjectStore('learnerProfile', { keyPath: 'id' })
        }
        if (oldVersion < 4) {
          // v3→v4: 添加 knowledgePoints store（知识图谱，以用户+学科+概念为键）
          db.createObjectStore('knowledgePoints', { keyPath: 'key' })
        }
        if (oldVersion < 5) {
          // v4→v5: 添加 knowledgePoints 索引（避免全表扫描）
          const store = transaction.objectStore('knowledgePoints')
          store.createIndex('by-user', 'userId')
          store.createIndex('by-user-subject', ['userId', 'subject'])
        }
      },
    })
  }
  return dbPromise
}

// ---- Sessions ----

export async function saveSession(session: Session): Promise<void> {
  const db = await getDB()
  await db.put('sessions', { ...session, updatedAt: Date.now() })
}

export async function getSession(id: string): Promise<Session | undefined> {
  const db = await getDB()
  return db.get('sessions', id)
}

export async function getAllSessions(limit = 50): Promise<Session[]> {
  const db = await getDB()
  const sessions: Session[] = []
  const tx = db.transaction('sessions', 'readonly')
  const index = tx.store.index('by-date')
  let cursor = await index.openCursor(null, 'prev') // newest first
  while (cursor && sessions.length < limit) {
    sessions.push(cursor.value)
    cursor = await cursor.continue()
  }
  return sessions
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('sessions', id)
}



// ---- Learner Profile ----

export async function getLearnerProfile(): Promise<LearnerProfile | undefined> {
  const db = await getDB()
  return db.get('learnerProfile', 'default')
}

export async function saveLearnerProfile(profile: LearnerProfile): Promise<void> {
  const db = await getDB()
  await db.put('learnerProfile', profile)
}

// ---- Knowledge Points ----

export async function getKnowledgePoint(key: string): Promise<KnowledgePointRecord | undefined> {
  const db = await getDB()
  return db.get('knowledgePoints', key)
}

export async function putKnowledgePoint(record: KnowledgePointRecord): Promise<void> {
  const db = await getDB()
  await db.put('knowledgePoints', record)
}

export async function getKnowledgePointsByUserAndSubject(
  userId: string,
  subject: string
): Promise<KnowledgePointRecord[]> {
  const db = await getDB()
  return db.getAllFromIndex('knowledgePoints', 'by-user-subject', [userId, subject])
}

export async function getAllKnowledgePointsForUser(userId: string): Promise<KnowledgePointRecord[]> {
  const db = await getDB()
  return db.getAllFromIndex('knowledgePoints', 'by-user', userId)
}
