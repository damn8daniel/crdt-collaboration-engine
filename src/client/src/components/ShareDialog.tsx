import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import type { DocumentPermissionDTO } from '@shared/types';

interface ShareDialogProps {
  documentId: string;
  onClose: () => void;
}

export function ShareDialog({ documentId, onClose }: ShareDialogProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'EDITOR' | 'VIEWER'>('EDITOR');
  const [permissions, setPermissions] = useState<DocumentPermissionDTO[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    api
      .get<{ permissions: DocumentPermissionDTO[] }>(`/documents/${documentId}`)
      .then((res) => setPermissions(res.permissions))
      .catch(console.error);
  }, [documentId]);

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSharing(true);
    try {
      const res = await api.post<{ message: string }>(`/documents/${documentId}/share`, {
        email,
        role,
      });
      setMessage(res.message);
      setEmail('');
      // Refresh permissions
      const updated = await api.get<{ permissions: DocumentPermissionDTO[] }>(
        `/documents/${documentId}`
      );
      setPermissions(updated.permissions);
    } catch (err: any) {
      setError(err.message || 'Failed to share');
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="w-full max-w-md bg-gray-900 rounded-xl border border-gray-800 shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-white font-semibold">Share Document</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition">
            &times;
          </button>
        </div>

        <div className="p-4">
          <form onSubmit={handleShare} className="flex gap-2 mb-4">
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'EDITOR' | 'VIEWER')}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none"
            >
              <option value="EDITOR">Editor</option>
              <option value="VIEWER">Viewer</option>
            </select>
            <button
              type="submit"
              disabled={sharing}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white text-sm rounded-lg transition"
            >
              Share
            </button>
          </form>

          {message && (
            <div className="mb-3 p-2 bg-green-900/50 border border-green-700 rounded text-green-300 text-sm">
              {message}
            </div>
          )}
          {error && (
            <div className="mb-3 p-2 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">
              {error}
            </div>
          )}

          <h3 className="text-sm font-medium text-gray-400 mb-2">People with access</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {permissions.map((p) => (
              <div
                key={p.userId}
                className="flex items-center justify-between py-2 px-3 bg-gray-800/50 rounded"
              >
                <div>
                  <p className="text-sm text-white">{p.userName}</p>
                  <p className="text-xs text-gray-500">{p.userEmail}</p>
                </div>
                <span className="text-xs text-gray-400">{p.role}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
