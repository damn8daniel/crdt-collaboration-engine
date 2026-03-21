/**
 * Offline queue — stores pending Yjs updates in IndexedDB
 * when the WebSocket is disconnected. Flushes on reconnect.
 */

const DB_NAME = 'crdt-offline-queue';
const STORE_NAME = 'updates';

interface QueueEntry {
  id?: number;
  documentId: string;
  update: ArrayBuffer;
  timestamp: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueUpdate(documentId: string, update: Uint8Array): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const entry: QueueEntry = {
    documentId,
    update: update.buffer.slice(update.byteOffset, update.byteOffset + update.byteLength),
    timestamp: Date.now(),
  };
  store.add(entry);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function drainQueue(documentId: string): Promise<Uint8Array[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const results: Uint8Array[] = [];
    const keysToDelete: IDBValidKey[] = [];
    const request = store.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const entry = cursor.value as QueueEntry;
        if (entry.documentId === documentId) {
          results.push(new Uint8Array(entry.update));
          keysToDelete.push(cursor.key);
        }
        cursor.continue();
      } else {
        // Delete drained entries
        for (const key of keysToDelete) {
          store.delete(key);
        }
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getQueueSize(): Promise<number> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  return new Promise((resolve, reject) => {
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
