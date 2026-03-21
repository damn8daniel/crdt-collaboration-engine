/**
 * Binary WebSocket protocol encoder / decoder.
 *
 * Frame layout:
 *   [1 byte type][N bytes payload]
 *
 * This keeps the overhead minimal while still letting us multiplex
 * Yjs sync, awareness, auth, and keep-alive on a single connection.
 */

import { WsMessageType } from './types';

export function encodeMessage(type: WsMessageType, payload: Uint8Array): Uint8Array {
  const msg = new Uint8Array(1 + payload.length);
  msg[0] = type;
  msg.set(payload, 1);
  return msg;
}

export function decodeMessage(data: Uint8Array): { type: WsMessageType; payload: Uint8Array } {
  if (data.length === 0) {
    throw new Error('Empty message');
  }
  return {
    type: data[0] as WsMessageType,
    payload: data.subarray(1),
  };
}

/** Encode a UTF-8 string into bytes (for auth messages). */
export function encodeString(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/** Decode bytes back to a UTF-8 string. */
export function decodeString(buf: Uint8Array): string {
  return new TextDecoder().decode(buf);
}

/** Build an auth handshake frame. */
export function encodeAuth(token: string, documentId: string): Uint8Array {
  const json = JSON.stringify({ token, documentId });
  return encodeMessage(WsMessageType.AUTH, encodeString(json));
}

/** Parse an auth handshake frame. */
export function decodeAuth(payload: Uint8Array): { token: string; documentId: string } {
  return JSON.parse(decodeString(payload));
}
