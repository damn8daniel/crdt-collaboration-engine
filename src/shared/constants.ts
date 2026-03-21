/** How often the server persists dirty documents (ms) */
export const PERSISTENCE_INTERVAL_MS = 5_000;

/** How often to send ping frames (ms) */
export const WS_PING_INTERVAL_MS = 30_000;

/** Time after which a client is considered disconnected (ms) */
export const WS_TIMEOUT_MS = 60_000;

/** Maximum binary message size (bytes) — 5 MB */
export const WS_MAX_MESSAGE_SIZE = 5 * 1024 * 1024;

/** Redis key prefix for awareness/presence data */
export const REDIS_PRESENCE_PREFIX = 'presence:';

/** Redis channel for cross-instance awareness broadcast */
export const REDIS_AWARENESS_CHANNEL = 'awareness';

/** User colors for collaborative cursors */
export const USER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E9', '#F0B27A', '#82E0AA',
  '#F1948A', '#85929E', '#73C6B6', '#F8C471',
] as const;

/** Supported editor languages */
export const SUPPORTED_LANGUAGES = [
  'plaintext', 'typescript', 'javascript', 'python',
  'rust', 'go', 'java', 'c', 'cpp', 'csharp',
  'html', 'css', 'json', 'yaml', 'markdown',
  'sql', 'shell', 'dockerfile',
] as const;

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];
