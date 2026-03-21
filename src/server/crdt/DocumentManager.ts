import * as Y from 'yjs';
import { prisma } from '../db';
import { PERSISTENCE_INTERVAL_MS } from '../../shared/constants';

/**
 * Manages Yjs documents in memory with periodic persistence to PostgreSQL.
 *
 * Each document room gets a single Y.Doc instance. When clients connect
 * they receive the full state via sync protocol, and further updates are
 * merged in real-time. A background interval flushes dirty documents.
 */
export class DocumentManager {
  private docs = new Map<string, Y.Doc>();
  private dirty = new Set<string>();
  private persistTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.persistTimer = setInterval(() => this.flushDirty(), PERSISTENCE_INTERVAL_MS);
  }

  /** Get or create a Y.Doc for the given document id, loading persisted state. */
  async getOrCreate(documentId: string): Promise<Y.Doc> {
    let ydoc = this.docs.get(documentId);
    if (ydoc) return ydoc;

    ydoc = new Y.Doc();
    this.docs.set(documentId, ydoc);

    // Load persisted state from DB
    const record = await prisma.document.findUnique({
      where: { id: documentId },
      select: { content: true },
    });

    if (record?.content) {
      Y.applyUpdate(ydoc, new Uint8Array(record.content));
    }

    // Track changes for persistence
    ydoc.on('update', () => {
      this.dirty.add(documentId);
    });

    return ydoc;
  }

  /** Persist a single document to the database. */
  async persist(documentId: string): Promise<void> {
    const ydoc = this.docs.get(documentId);
    if (!ydoc) return;

    const state = Y.encodeStateAsUpdate(ydoc);
    await prisma.document.update({
      where: { id: documentId },
      data: { content: Buffer.from(state) },
    });
  }

  /** Flush all dirty documents. */
  async flushDirty(): Promise<void> {
    const ids = Array.from(this.dirty);
    this.dirty.clear();

    await Promise.allSettled(ids.map((id) => this.persist(id)));
  }

  /** Remove a document from memory (e.g. when last client disconnects). */
  async unload(documentId: string): Promise<void> {
    if (this.dirty.has(documentId)) {
      await this.persist(documentId);
      this.dirty.delete(documentId);
    }
    const ydoc = this.docs.get(documentId);
    if (ydoc) {
      ydoc.destroy();
      this.docs.delete(documentId);
    }
  }

  /** Create a named snapshot of the current document state. */
  async createSnapshot(documentId: string, userId: string, label?: string): Promise<string> {
    const ydoc = this.docs.get(documentId);
    if (!ydoc) throw new Error('Document not loaded');

    const state = Y.encodeStateAsUpdate(ydoc);
    const snapshot = await prisma.documentSnapshot.create({
      data: {
        documentId,
        content: Buffer.from(state),
        label: label ?? null,
        createdBy: userId,
      },
    });
    return snapshot.id;
  }

  /** Restore a snapshot — replaces document content. */
  async restoreSnapshot(documentId: string, snapshotId: string): Promise<void> {
    const snapshot = await prisma.documentSnapshot.findUnique({
      where: { id: snapshotId },
    });
    if (!snapshot || snapshot.documentId !== documentId) {
      throw new Error('Snapshot not found');
    }

    let ydoc = this.docs.get(documentId);
    if (ydoc) {
      ydoc.destroy();
    }
    ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, new Uint8Array(snapshot.content));
    this.docs.set(documentId, ydoc);
    this.dirty.add(documentId);

    ydoc.on('update', () => {
      this.dirty.add(documentId);
    });
  }

  /** Get the raw text content of a loaded document (for diffing). */
  getText(documentId: string): string {
    const ydoc = this.docs.get(documentId);
    if (!ydoc) return '';
    return ydoc.getText('monaco').toString();
  }

  /** Graceful shutdown — persist everything. */
  async shutdown(): Promise<void> {
    if (this.persistTimer) clearInterval(this.persistTimer);
    await this.flushDirty();
    for (const ydoc of this.docs.values()) {
      ydoc.destroy();
    }
    this.docs.clear();
  }

  /** Number of loaded documents. */
  get size(): number {
    return this.docs.size;
  }
}

export const documentManager = new DocumentManager();
