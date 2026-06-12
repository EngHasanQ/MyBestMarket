// طابور المزامنة دون اتصال لوضع التسوق — IndexedDB عبر idb

import { openDB, type IDBPDatabase } from 'idb';
import type { ListDetail } from '../types';

interface QueuedCheck {
  kind: 'check';
  listId: number;
  itemId: number;
  body: { isPurchased: boolean; actualPrice?: number };
  queuedAt: number;
}

interface QueuedFinish {
  kind: 'finish';
  listId: number;
  queuedAt: number;
}

export type QueuedAction = QueuedCheck | QueuedFinish;

const DB_NAME = 'waffir-offline';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('queue')) {
          database.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
        }
        if (!database.objectStoreNames.contains('lists')) {
          database.createObjectStore('lists');
        }
      },
    });
  }
  return dbPromise;
}

export async function cacheList(list: ListDetail): Promise<void> {
  const d = await db();
  await d.put('lists', list, list.id);
}

export async function getCachedList(id: number): Promise<ListDetail | undefined> {
  const d = await db();
  return d.get('lists', id);
}

export async function enqueue(action: QueuedAction): Promise<void> {
  const d = await db();
  await d.add('queue', action);
}

export async function queueSize(): Promise<number> {
  const d = await db();
  return d.count('queue');
}

/**
 * إعادة تشغيل الطابور بالترتيب. تتوقف عند أول فشل شبكة (تبقى البقية للمحاولة التالية).
 * أخطاء 4xx تُسقط العنصر كي لا يعلق الطابور.
 */
export async function flushQueue(): Promise<number> {
  const d = await db();
  const keys = await d.getAllKeys('queue');
  let flushed = 0;
  for (const key of keys) {
    const action = (await d.get('queue', key)) as QueuedAction | undefined;
    if (!action) continue;
    try {
      if (action.kind === 'check') {
        await syncFetch(`/api/lists/${action.listId}/items/${action.itemId}`, 'PATCH', action.body);
      } else {
        await syncFetch(`/api/lists/${action.listId}/finish`, 'POST');
      }
      await d.delete('queue', key);
      flushed += 1;
    } catch (err) {
      if (err instanceof HttpStatusError && err.status >= 400 && err.status < 500) {
        // طلب مرفوض نهائياً — أسقطه وتابع
        await d.delete('queue', key);
        continue;
      }
      break; // فشل شبكة — أوقف وحاول لاحقاً
    }
  }
  return flushed;
}

class HttpStatusError extends Error {
  status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

async function syncFetch(url: string, method: string, body?: unknown): Promise<void> {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new HttpStatusError(res.status);
}

/** مزامنة تلقائية عند عودة الاتصال */
export function setupOnlineFlush(onFlushed?: (count: number) => void): () => void {
  const handler = () => {
    flushQueue()
      .then((count) => {
        if (count > 0) onFlushed?.(count);
      })
      .catch(() => undefined);
  };
  window.addEventListener('online', handler);
  // محاولة فورية عند الإقلاع إن كنا متصلين
  if (navigator.onLine) handler();
  return () => window.removeEventListener('online', handler);
}
