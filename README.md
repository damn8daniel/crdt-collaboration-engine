# CRDT Collaboration Engine

Real-time collaborative code editor built with **CRDTs** (Conflict-free Replicated Data Types) using Yjs, WebSocket, and React with Monaco Editor.

## Architecture

```
┌─────────────┐     WebSocket (binary)     ┌──────────────────┐
│  React App  │ ◄─────────────────────────► │  Node.js Server  │
│  Monaco +   │                             │  Yjs + ws        │
│  Yjs Client │     REST API (JSON)         │  Express         │
│             │ ◄─────────────────────────► │                  │
└─────────────┘                             └────┬────────┬────┘
                                                 │        │
                                          ┌──────▼──┐ ┌───▼────┐
                                          │ Postgres │ │ Redis  │
                                          │ (docs)   │ │(aware) │
                                          └─────────┘ └────────┘
```

## Features

- **CRDT-based editing** — Yjs ensures conflict-free merging with no operational transform needed
- **Binary WebSocket protocol** — minimal overhead sync with multiplexed message types
- **Awareness protocol** — live cursor positions, selections, and user presence
- **Document persistence** — automatic save to PostgreSQL with periodic flush
- **Version history** — named snapshots with restore capability
- **Access control** — owner/editor/viewer roles with document sharing
- **Offline support** — IndexedDB queue for updates made while disconnected
- **Room management** — multiple concurrent documents, auto-unload on empty
- **Monaco Editor** — VS Code-quality editing with syntax highlighting
- **REST API** — full CRUD for documents, users, auth, and sharing

## Quick Start

```bash
# Start infrastructure
docker compose up -d postgres redis

# Install dependencies
npm install

# Set up database
cp .env.example .env
npx prisma migrate dev --name init
npx prisma db seed

# Run development servers
npm run dev
```

Open http://localhost:3000 in multiple browser tabs to test collaboration.

## Tech Stack

| Layer      | Technology                       |
|------------|----------------------------------|
| CRDT       | Yjs, y-protocols, lib0           |
| Transport  | WebSocket (ws), binary protocol  |
| Backend    | Node.js, Express, TypeScript     |
| Frontend   | React, Monaco Editor, Tailwind   |
| Database   | PostgreSQL (Prisma ORM)          |
| Cache      | Redis (ioredis)                  |
| Infra      | Docker, Docker Compose           |

## API Endpoints

| Method | Path                                          | Description              |
|--------|-----------------------------------------------|--------------------------|
| POST   | `/api/auth/register`                          | Register new user        |
| POST   | `/api/auth/login`                             | Login                    |
| GET    | `/api/auth/me`                                | Current user             |
| GET    | `/api/documents`                              | List user's documents    |
| POST   | `/api/documents`                              | Create document          |
| GET    | `/api/documents/:id`                          | Get document details     |
| PATCH  | `/api/documents/:id`                          | Update title/language    |
| DELETE | `/api/documents/:id`                          | Delete document          |
| POST   | `/api/documents/:id/share`                    | Share with user          |
| GET    | `/api/documents/:id/snapshots`                | List snapshots           |
| POST   | `/api/documents/:id/snapshots`                | Create snapshot          |
| POST   | `/api/documents/:id/snapshots/:sid/restore`   | Restore snapshot         |
| WS     | `/ws`                                         | WebSocket (binary sync)  |

## WebSocket Protocol

Binary frames: `[1 byte type][N bytes payload]`

| Type | Name         | Direction     | Description                   |
|------|--------------|---------------|-------------------------------|
| 0    | SYNC_STEP_1  | Bidirectional | Yjs sync step 1               |
| 1    | SYNC_STEP_2  | Bidirectional | Yjs sync step 2               |
| 2    | SYNC_UPDATE  | Bidirectional | Yjs document update            |
| 3    | AWARENESS    | Bidirectional | Cursor/selection/presence      |
| 10   | AUTH         | Client→Server | JWT + documentId handshake     |
| 11   | AUTH_OK      | Server→Client | Authentication accepted        |
| 12   | AUTH_ERR     | Server→Client | Authentication rejected        |
| 20   | PING         | Client→Server | Keep-alive                     |
| 21   | PONG         | Server→Client | Keep-alive response            |
