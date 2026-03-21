// ─── User ────────────────────────────────────────────────────────────────────

export interface UserPublic {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface AuthPayload {
  token: string;
  user: UserPublic;
}

// ─── Document ────────────────────────────────────────────────────────────────

export type DocumentRole = 'OWNER' | 'EDITOR' | 'VIEWER';

export interface DocumentMeta {
  id: string;
  title: string;
  language: string;
  ownerId: string;
  ownerName: string;
  role: DocumentRole;
  createdAt: string;
  updatedAt: string;
  collaboratorCount: number;
}

export interface DocumentSnapshot {
  id: string;
  label: string | null;
  createdBy: string;
  authorName: string;
  createdAt: string;
}

export interface DocumentPermissionDTO {
  userId: string;
  userName: string;
  userEmail: string;
  role: DocumentRole;
}

// ─── WebSocket Protocol ──────────────────────────────────────────────────────

export const enum WsMessageType {
  /** Yjs sync step 1 */
  SYNC_STEP_1 = 0,
  /** Yjs sync step 2 */
  SYNC_STEP_2 = 1,
  /** Yjs update */
  SYNC_UPDATE = 2,
  /** Awareness update */
  AWARENESS = 3,
  /** Auth handshake */
  AUTH = 10,
  /** Auth accepted */
  AUTH_OK = 11,
  /** Auth rejected */
  AUTH_ERR = 12,
  /** Ping */
  PING = 20,
  /** Pong */
  PONG = 21,
}

// ─── Awareness / Presence ────────────────────────────────────────────────────

export interface AwarenessUser {
  id: string;
  name: string;
  color: string;
  cursor: CursorPosition | null;
  selection: SelectionRange | null;
}

export interface CursorPosition {
  lineNumber: number;
  column: number;
}

export interface SelectionRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

// ─── REST API ────────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Offline Queue ───────────────────────────────────────────────────────────

export interface QueuedUpdate {
  documentId: string;
  update: Uint8Array;
  timestamp: number;
}
