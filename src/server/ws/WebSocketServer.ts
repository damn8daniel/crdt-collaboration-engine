import { Server as HttpServer } from 'http';
import { WebSocketServer as WsServer, WebSocket } from 'ws';
import { verifyToken } from '../auth';
import { prisma } from '../db';
import { roomManager } from './RoomManager';
import { decodeMessage, decodeAuth } from '../../shared/protocol';
import { WsMessageType } from '../../shared/types';
import { WS_MAX_MESSAGE_SIZE, WS_PING_INTERVAL_MS } from '../../shared/constants';
import type { UserPublic } from '../../shared/types';

/**
 * Initializes the WebSocket upgrade server.
 *
 * Connection flow:
 * 1. Client connects to /ws
 * 2. Client sends AUTH frame with JWT + documentId
 * 3. Server validates token and document access
 * 4. On success: sends AUTH_OK, joins room, starts sync
 * 5. On failure: sends AUTH_ERR and closes
 */
export function createWebSocketServer(httpServer: HttpServer): WsServer {
  const wss = new WsServer({
    server: httpServer,
    path: '/ws',
    maxPayload: WS_MAX_MESSAGE_SIZE,
  });

  wss.on('connection', (ws: WebSocket) => {
    let authenticated = false;
    let authTimeout: NodeJS.Timeout;

    // Give the client 5 seconds to authenticate
    authTimeout = setTimeout(() => {
      if (!authenticated) {
        ws.close(4001, 'Authentication timeout');
      }
    }, 5000);

    ws.on('message', async (data: Buffer) => {
      if (authenticated) return; // Already authenticated, messages handled by RoomManager

      try {
        const msg = decodeMessage(new Uint8Array(data));

        if (msg.type !== WsMessageType.AUTH) {
          ws.close(4002, 'Expected auth message');
          return;
        }

        const { token, documentId } = decodeAuth(msg.payload);

        // Verify JWT
        let userId: string;
        try {
          userId = verifyToken(token);
        } catch {
          sendAuthError(ws, 'Invalid token');
          return;
        }

        // Fetch user
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, name: true, avatarUrl: true },
        });

        if (!user) {
          sendAuthError(ws, 'User not found');
          return;
        }

        // Check document access
        const doc = await prisma.document.findUnique({ where: { id: documentId } });
        if (!doc) {
          sendAuthError(ws, 'Document not found');
          return;
        }

        const hasAccess = doc.ownerId === userId || await prisma.documentPermission.findUnique({
          where: { documentId_userId: { documentId, userId } },
        });

        if (!hasAccess) {
          sendAuthError(ws, 'Access denied');
          return;
        }

        // Auth success
        clearTimeout(authTimeout);
        authenticated = true;

        const authOkPayload = new TextEncoder().encode(JSON.stringify({ documentId }));
        ws.send(
          new Uint8Array([WsMessageType.AUTH_OK, ...authOkPayload])
        );

        const userPublic: UserPublic = {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
        };

        await roomManager.join(ws, userPublic, documentId);
      } catch (err) {
        console.error('[ws] Auth error:', err);
        sendAuthError(ws, 'Internal error');
      }
    });

    ws.on('error', (err) => {
      console.error('[ws] Connection error:', err);
    });
  });

  // Periodic ping to detect dead connections
  const pingInterval = setInterval(() => {
    roomManager.pingAll();
  }, WS_PING_INTERVAL_MS);

  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  console.log(`[ws] WebSocket server ready on /ws`);
  return wss;
}

function sendAuthError(ws: WebSocket, message: string): void {
  const payload = new TextEncoder().encode(JSON.stringify({ error: message }));
  ws.send(new Uint8Array([WsMessageType.AUTH_ERR, ...payload]));
  ws.close(4003, message);
}
