import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { redis, redisSub } from '../redis';
import { REDIS_PRESENCE_PREFIX, REDIS_AWARENESS_CHANNEL } from '../../shared/constants';
import type { AwarenessUser } from '../../shared/types';

/**
 * Manages user awareness (cursors, selections, presence) across
 * potentially multiple server instances via Redis pub/sub.
 */
export class AwarenessManager {
  private awarenessInstances = new Map<string, Awareness>();
  private subscribed = false;

  /** Get or create an Awareness instance for a document room. */
  getOrCreate(documentId: string, ydoc: Y.Doc): Awareness {
    let awareness = this.awarenessInstances.get(documentId);
    if (awareness) return awareness;

    awareness = new Awareness(ydoc);
    this.awarenessInstances.set(documentId, awareness);

    // Broadcast awareness changes to Redis for cross-instance sync
    awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
      const changedClients = [...added, ...updated, ...removed];
      if (changedClients.length === 0) return;

      const states: Record<number, any> = {};
      for (const clientId of changedClients) {
        const state = awareness!.getStates().get(clientId);
        if (state) states[clientId] = state;
      }

      redis.publish(
        REDIS_AWARENESS_CHANNEL,
        JSON.stringify({ documentId, states, removed })
      ).catch(() => {});
    });

    return awareness;
  }

  /** Subscribe to cross-instance awareness updates. */
  async subscribe(): Promise<void> {
    if (this.subscribed) return;
    this.subscribed = true;

    await redisSub.subscribe(REDIS_AWARENESS_CHANNEL);
    redisSub.on('message', (_channel, message) => {
      try {
        const { documentId, states, removed } = JSON.parse(message);
        const awareness = this.awarenessInstances.get(documentId);
        if (!awareness) return;

        // Apply remote states
        for (const [clientIdStr, state] of Object.entries(states)) {
          const clientId = parseInt(clientIdStr, 10);
          if (clientId !== awareness.clientID) {
            awareness.setLocalStateField('remote', state);
          }
        }
      } catch {
        // Ignore malformed messages
      }
    });
  }

  /** Track user presence in Redis (sorted set with expiry). */
  async setPresence(documentId: string, user: AwarenessUser): Promise<void> {
    const key = `${REDIS_PRESENCE_PREFIX}${documentId}`;
    await redis.hset(key, user.id, JSON.stringify(user));
    await redis.expire(key, 120); // 2 min TTL, refreshed on each update
  }

  /** Remove user presence. */
  async removePresence(documentId: string, userId: string): Promise<void> {
    const key = `${REDIS_PRESENCE_PREFIX}${documentId}`;
    await redis.hdel(key, userId);
  }

  /** Get all present users in a document room. */
  async getPresence(documentId: string): Promise<AwarenessUser[]> {
    const key = `${REDIS_PRESENCE_PREFIX}${documentId}`;
    const entries = await redis.hgetall(key);
    return Object.values(entries).map((v) => JSON.parse(v));
  }

  /** Remove awareness instance when room is empty. */
  remove(documentId: string): void {
    const awareness = this.awarenessInstances.get(documentId);
    if (awareness) {
      awareness.destroy();
      this.awarenessInstances.delete(documentId);
    }
  }

  /** Shutdown all awareness instances. */
  shutdown(): void {
    for (const awareness of this.awarenessInstances.values()) {
      awareness.destroy();
    }
    this.awarenessInstances.clear();
  }
}

export const awarenessManager = new AwarenessManager();
