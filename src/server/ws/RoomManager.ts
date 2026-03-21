import { WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { documentManager } from '../crdt/DocumentManager';
import { awarenessManager } from '../crdt/AwarenessManager';
import { WsMessageType } from '../../shared/types';
import { encodeMessage } from '../../shared/protocol';
import { USER_COLORS } from '../../shared/constants';
import type { AwarenessUser, UserPublic } from '../../shared/types';

interface ConnectedClient {
  ws: WebSocket;
  user: UserPublic;
  documentId: string;
  clientId: number;
  isAlive: boolean;
}

/**
 * Manages WebSocket rooms — one room per document.
 * Handles Yjs sync, awareness propagation, and client lifecycle.
 */
export class RoomManager {
  private rooms = new Map<string, Map<number, ConnectedClient>>();
  private clientIdCounter = 0;

  /** Add a client to a document room and start syncing. */
  async join(ws: WebSocket, user: UserPublic, documentId: string): Promise<void> {
    const ydoc = await documentManager.getOrCreate(documentId);
    const awareness = awarenessManager.getOrCreate(documentId, ydoc);
    const clientId = ++this.clientIdCounter;

    const client: ConnectedClient = {
      ws,
      user,
      documentId,
      clientId,
      isAlive: true,
    };

    // Add to room
    if (!this.rooms.has(documentId)) {
      this.rooms.set(documentId, new Map());
    }
    this.rooms.get(documentId)!.set(clientId, client);

    // Set awareness state for this user
    const colorIndex = clientId % USER_COLORS.length;
    const awarenessUser: AwarenessUser = {
      id: user.id,
      name: user.name,
      color: USER_COLORS[colorIndex],
      cursor: null,
      selection: null,
    };

    awareness.setLocalStateField('user', awarenessUser);
    awarenessManager.setPresence(documentId, awarenessUser).catch(() => {});

    // Send initial sync (Yjs sync step 1)
    const encoder = encoding.createEncoder();
    syncProtocol.writeSyncStep1(encoder, ydoc);
    const syncStep1 = encoding.toUint8Array(encoder);
    this.send(ws, WsMessageType.SYNC_STEP_1, syncStep1);

    // Send current awareness states
    const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(
      awareness,
      Array.from(awareness.getStates().keys())
    );
    this.send(ws, WsMessageType.AWARENESS, awarenessUpdate);

    // Listen for Yjs updates and broadcast to room
    const updateHandler = (update: Uint8Array, origin: any) => {
      if (origin === clientId) return; // Don't echo back
      this.send(ws, WsMessageType.SYNC_UPDATE, update);
    };
    ydoc.on('update', updateHandler);

    // Listen for awareness changes
    const awarenessHandler = ({ added, updated, removed }: any) => {
      const changedClients = [...added, ...updated, ...removed];
      const update = awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients);
      this.broadcastToRoom(documentId, WsMessageType.AWARENESS, update);
    };
    awareness.on('update', awarenessHandler);

    // Handle incoming messages
    ws.on('message', (data: Buffer) => {
      try {
        this.handleMessage(client, ydoc, awareness, new Uint8Array(data));
      } catch (err) {
        console.error(`[ws] Error handling message from client ${clientId}:`, err);
      }
    });

    // Handle pong
    ws.on('pong', () => {
      client.isAlive = true;
    });

    // Handle disconnect
    ws.on('close', () => {
      ydoc.off('update', updateHandler);
      awareness.off('update', awarenessHandler);
      awarenessProtocol.removeAwarenessStates(awareness, [awareness.clientID], null);
      awarenessManager.removePresence(documentId, user.id).catch(() => {});
      this.leave(documentId, clientId);
    });

    console.log(`[room] ${user.name} joined document ${documentId} (client ${clientId})`);
  }

  /** Handle an incoming binary message from a client. */
  private handleMessage(
    client: ConnectedClient,
    ydoc: Y.Doc,
    awareness: any,
    data: Uint8Array
  ): void {
    if (data.length === 0) return;

    const msgType = data[0] as WsMessageType;
    const payload = data.subarray(1);

    switch (msgType) {
      case WsMessageType.SYNC_STEP_1: {
        const decoder = decoding.createDecoder(payload);
        const encoder = encoding.createEncoder();
        syncProtocol.readSyncStep1(decoder, encoder, ydoc);
        const response = encoding.toUint8Array(encoder);
        if (response.length > 1) {
          this.send(client.ws, WsMessageType.SYNC_STEP_2, response);
        }
        break;
      }

      case WsMessageType.SYNC_STEP_2: {
        const decoder = decoding.createDecoder(payload);
        syncProtocol.readSyncStep2(decoder, ydoc, client.clientId);
        break;
      }

      case WsMessageType.SYNC_UPDATE: {
        const decoder = decoding.createDecoder(payload);
        syncProtocol.readUpdate(decoder, ydoc, client.clientId);
        // Broadcast to other clients in the room
        this.broadcastToRoom(client.documentId, WsMessageType.SYNC_UPDATE, payload, client.clientId);
        break;
      }

      case WsMessageType.AWARENESS: {
        awarenessProtocol.applyAwarenessUpdate(awareness, payload, client);
        break;
      }

      case WsMessageType.PING: {
        this.send(client.ws, WsMessageType.PONG, new Uint8Array(0));
        break;
      }
    }
  }

  /** Remove a client from their room. */
  private async leave(documentId: string, clientId: number): Promise<void> {
    const room = this.rooms.get(documentId);
    if (!room) return;

    const client = room.get(clientId);
    room.delete(clientId);

    if (client) {
      console.log(`[room] ${client.user.name} left document ${documentId}`);
    }

    // If room is empty, unload document
    if (room.size === 0) {
      this.rooms.delete(documentId);
      awarenessManager.remove(documentId);
      await documentManager.unload(documentId);
      console.log(`[room] Document ${documentId} unloaded (no clients)`);
    }
  }

  /** Send a typed binary message to a single client. */
  private send(ws: WebSocket, type: WsMessageType, payload: Uint8Array): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(encodeMessage(type, payload));
    }
  }

  /** Broadcast a message to all clients in a room, optionally excluding one. */
  private broadcastToRoom(
    documentId: string,
    type: WsMessageType,
    payload: Uint8Array,
    excludeClientId?: number
  ): void {
    const room = this.rooms.get(documentId);
    if (!room) return;

    const msg = encodeMessage(type, payload);
    for (const [cid, client] of room) {
      if (cid !== excludeClientId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(msg);
      }
    }
  }

  /** Ping all clients to detect dead connections. */
  pingAll(): void {
    for (const room of this.rooms.values()) {
      for (const [clientId, client] of room) {
        if (!client.isAlive) {
          client.ws.terminate();
          room.delete(clientId);
          continue;
        }
        client.isAlive = false;
        client.ws.ping();
      }
    }
  }

  /** Get connected user count per document. */
  getRoomSizes(): Map<string, number> {
    const sizes = new Map<string, number>();
    for (const [docId, room] of this.rooms) {
      sizes.set(docId, room.size);
    }
    return sizes;
  }

  /** Total connected clients. */
  get totalClients(): number {
    let count = 0;
    for (const room of this.rooms.values()) {
      count += room.size;
    }
    return count;
  }
}

export const roomManager = new RoomManager();
