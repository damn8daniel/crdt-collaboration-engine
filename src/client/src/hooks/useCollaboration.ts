import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { WsMessageType } from '@shared/types';
import { encodeMessage, encodeAuth } from '@shared/protocol';
import { enqueueUpdate, drainQueue } from '../utils/offlineQueue';
import type { AwarenessUser } from '@shared/types';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseCollaborationOptions {
  documentId: string;
  token: string;
  userName: string;
  userColor: string;
}

interface UseCollaborationReturn {
  ydoc: Y.Doc;
  awareness: Awareness;
  status: ConnectionStatus;
  connectedUsers: AwarenessUser[];
  reconnect: () => void;
}

export function useCollaboration({
  documentId,
  token,
  userName,
  userColor,
}: UseCollaborationOptions): UseCollaborationReturn {
  const ydocRef = useRef(new Y.Doc());
  const awarenessRef = useRef(new Awareness(ydocRef.current));
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number>();
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [connectedUsers, setConnectedUsers] = useState<AwarenessUser[]>([]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;
    setStatus('connecting');

    ws.onopen = () => {
      // Send auth handshake
      ws.send(encodeAuth(token, documentId));
    };

    ws.onmessage = async (event) => {
      const data = new Uint8Array(event.data as ArrayBuffer);
      if (data.length === 0) return;

      const msgType = data[0] as WsMessageType;
      const payload = data.subarray(1);

      switch (msgType) {
        case WsMessageType.AUTH_OK: {
          setStatus('connected');

          // Flush offline queue
          try {
            const queued = await drainQueue(documentId);
            for (const update of queued) {
              ws.send(encodeMessage(WsMessageType.SYNC_UPDATE, update));
            }
          } catch {
            // IndexedDB may not be available
          }
          break;
        }

        case WsMessageType.AUTH_ERR: {
          setStatus('error');
          break;
        }

        case WsMessageType.SYNC_STEP_1: {
          const decoder = decoding.createDecoder(payload);
          const encoder = encoding.createEncoder();
          syncProtocol.readSyncStep1(decoder, encoder, ydocRef.current);
          const response = encoding.toUint8Array(encoder);
          if (response.length > 1) {
            ws.send(encodeMessage(WsMessageType.SYNC_STEP_2, response));
          }

          // Send our sync step 1 back
          const encoder2 = encoding.createEncoder();
          syncProtocol.writeSyncStep1(encoder2, ydocRef.current);
          ws.send(encodeMessage(WsMessageType.SYNC_STEP_1, encoding.toUint8Array(encoder2)));
          break;
        }

        case WsMessageType.SYNC_STEP_2: {
          const decoder = decoding.createDecoder(payload);
          syncProtocol.readSyncStep2(decoder, ydocRef.current, null);
          break;
        }

        case WsMessageType.SYNC_UPDATE: {
          const decoder = decoding.createDecoder(payload);
          syncProtocol.readUpdate(decoder, ydocRef.current, null);
          break;
        }

        case WsMessageType.AWARENESS: {
          awarenessProtocol.applyAwarenessUpdate(awarenessRef.current, payload, null);
          break;
        }

        case WsMessageType.PONG:
          break;
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      // Auto-reconnect after 2 seconds
      reconnectTimerRef.current = window.setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      setStatus('error');
    };
  }, [documentId, token]);

  // Set up document update listener
  useEffect(() => {
    const ydoc = ydocRef.current;
    const awareness = awarenessRef.current;

    const updateHandler = (update: Uint8Array, origin: any) => {
      if (origin === 'remote') return;
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(encodeMessage(WsMessageType.SYNC_UPDATE, update));
      } else {
        // Offline — queue the update
        enqueueUpdate(documentId, update).catch(() => {});
      }
    };

    ydoc.on('update', updateHandler);

    // Set local awareness
    awareness.setLocalStateField('user', {
      name: userName,
      color: userColor,
      cursor: null,
      selection: null,
    });

    // Track awareness changes for connected users list
    const awarenessChangeHandler = () => {
      const users: AwarenessUser[] = [];
      awareness.getStates().forEach((state) => {
        if (state.user) {
          users.push(state.user as AwarenessUser);
        }
      });
      setConnectedUsers(users);
    };
    awareness.on('change', awarenessChangeHandler);

    // Awareness update → send to server
    const awarenessUpdateHandler = ({ added, updated, removed }: any) => {
      const changedClients = [...added, ...updated, ...removed];
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        const update = awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients);
        ws.send(encodeMessage(WsMessageType.AWARENESS, update));
      }
    };
    awareness.on('update', awarenessUpdateHandler);

    connect();

    return () => {
      ydoc.off('update', updateHandler);
      awareness.off('change', awarenessChangeHandler);
      awareness.off('update', awarenessUpdateHandler);
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      awareness.destroy();
      ydoc.destroy();
    };
  }, [documentId, token, userName, userColor, connect]);

  return {
    ydoc: ydocRef.current,
    awareness: awarenessRef.current,
    status,
    connectedUsers,
    reconnect: connect,
  };
}
