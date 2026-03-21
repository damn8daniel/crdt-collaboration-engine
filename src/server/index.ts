import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { createServer } from 'http';
import { config } from './config';
import { prisma, disconnectDb } from './db';
import { connectRedis, disconnectRedis } from './redis';
import { createWebSocketServer } from './ws/WebSocketServer';
import { documentManager } from './crdt/DocumentManager';
import { awarenessManager } from './crdt/AwarenessManager';
import { roomManager } from './ws/RoomManager';
import authRoutes from './routes/auth.routes';
import documentRoutes from './routes/document.routes';

async function main() {
  // Express app
  const app = express();
  app.use(cors({ origin: config.cors.origin, credentials: true }));
  app.use(compression());
  app.use(express.json());

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      documents: documentManager.size,
      clients: roomManager.totalClients,
    });
  });

  // REST routes
  app.use('/api/auth', authRoutes);
  app.use('/api/documents', documentRoutes);

  // HTTP + WebSocket server
  const httpServer = createServer(app);
  createWebSocketServer(httpServer);

  // Connect external services
  try {
    await connectRedis();
    await awarenessManager.subscribe();
  } catch (err) {
    console.warn('[startup] Redis unavailable — running without cross-instance awareness:', err);
  }

  // Verify DB connection
  await prisma.$connect();
  console.log('[db] PostgreSQL connected');

  // Start listening
  httpServer.listen(config.port, () => {
    console.log(`\n  CRDT Collaboration Engine`);
    console.log(`  ─────────────────────────`);
    console.log(`  REST API:   http://localhost:${config.port}/api`);
    console.log(`  WebSocket:  ws://localhost:${config.port}/ws`);
    console.log(`  Health:     http://localhost:${config.port}/api/health`);
    console.log(`  Env:        ${config.nodeEnv}\n`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[${signal}] Shutting down...`);
    await documentManager.shutdown();
    awarenessManager.shutdown();
    await disconnectRedis();
    await disconnectDb();
    httpServer.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
