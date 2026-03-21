import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import * as monaco from 'monaco-editor';
import { MonacoBinding } from 'y-monaco';
import { useAuth } from '../hooks/useAuth';
import { useCollaboration, ConnectionStatus } from '../hooks/useCollaboration';
import { PresenceBar } from './PresenceBar';
import { VersionHistory } from './VersionHistory';
import { ShareDialog } from './ShareDialog';
import { api } from '../utils/api';
import { USER_COLORS } from '@shared/constants';
import type { DocumentMeta } from '@shared/types';

export function EditorPage() {
  const { id: documentId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [docMeta, setDocMeta] = useState<DocumentMeta | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showShare, setShowShare] = useState(false);

  if (!documentId || !token || !user) return null;

  const colorIndex = Math.abs(user.id.charCodeAt(0)) % USER_COLORS.length;
  const { ydoc, awareness, status, connectedUsers } = useCollaboration({
    documentId,
    token,
    userName: user.name,
    userColor: USER_COLORS[colorIndex],
  });

  // Load document metadata
  useEffect(() => {
    api
      .get<DocumentMeta>(`/documents/${documentId}`)
      .then(setDocMeta)
      .catch(() => navigate('/documents'));
  }, [documentId, navigate]);

  // Initialize Monaco editor
  useEffect(() => {
    if (!editorContainerRef.current || !docMeta) return;

    const editor = monaco.editor.create(editorContainerRef.current, {
      language: docMeta.language,
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 14,
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      padding: { top: 16 },
      cursorBlinking: 'smooth',
      smoothScrolling: true,
      renderWhitespace: 'selection',
      bracketPairColorization: { enabled: true },
    });

    editorRef.current = editor;

    // Bind Yjs to Monaco
    const ytext = ydoc.getText('monaco');
    const binding = new MonacoBinding(ytext, editor.getModel()!, new Set([editor]), awareness);

    // Track cursor position in awareness
    editor.onDidChangeCursorPosition((e) => {
      awareness.setLocalStateField('user', {
        ...awareness.getLocalState()?.user,
        cursor: {
          lineNumber: e.position.lineNumber,
          column: e.position.column,
        },
      });
    });

    editor.onDidChangeCursorSelection((e) => {
      const sel = e.selection;
      const isEmpty =
        sel.startLineNumber === sel.endLineNumber && sel.startColumn === sel.endColumn;

      awareness.setLocalStateField('user', {
        ...awareness.getLocalState()?.user,
        selection: isEmpty
          ? null
          : {
              startLineNumber: sel.startLineNumber,
              startColumn: sel.startColumn,
              endLineNumber: sel.endLineNumber,
              endColumn: sel.endColumn,
            },
      });
    });

    return () => {
      binding.destroy();
      editor.dispose();
    };
  }, [docMeta, ydoc, awareness]);

  const statusColor: Record<ConnectionStatus, string> = {
    connecting: 'bg-yellow-500',
    connected: 'bg-green-500',
    disconnected: 'bg-red-500',
    error: 'bg-red-700',
  };

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {/* Toolbar */}
      <header className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <Link to="/documents" className="text-gray-400 hover:text-white transition text-sm">
            &larr; Back
          </Link>
          <span className="text-gray-600">|</span>
          <h1 className="text-white font-medium">{docMeta?.title || 'Loading...'}</h1>
          <span className="text-xs text-gray-500">{docMeta?.language}</span>
        </div>

        <div className="flex items-center gap-4">
          <PresenceBar users={connectedUsers} />

          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${statusColor[status]}`} />
            <span className="text-xs text-gray-400 capitalize">{status}</span>
          </div>

          {docMeta?.role === 'OWNER' && (
            <button
              onClick={() => setShowShare(true)}
              className="px-3 py-1 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition"
            >
              Share
            </button>
          )}

          <button
            onClick={() => setShowHistory(true)}
            className="px-3 py-1 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition"
          >
            History
          </button>
        </div>
      </header>

      {/* Editor */}
      <div ref={editorContainerRef} className="flex-1" />

      {/* Dialogs */}
      {showHistory && (
        <VersionHistory
          documentId={documentId}
          onClose={() => setShowHistory(false)}
        />
      )}
      {showShare && (
        <ShareDialog
          documentId={documentId}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
