import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import type { DocumentSnapshot } from '@shared/types';

interface VersionHistoryProps {
  documentId: string;
  onClose: () => void;
}

export function VersionHistory({ documentId, onClose }: VersionHistoryProps) {
  const [snapshots, setSnapshots] = useState<DocumentSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api
      .get<DocumentSnapshot[]>(`/documents/${documentId}/snapshots`)
      .then(setSnapshots)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [documentId]);

  const createSnapshot = async () => {
    setCreating(true);
    try {
      await api.post(`/documents/${documentId}/snapshots`, { label: label || undefined });
      const updated = await api.get<DocumentSnapshot[]>(`/documents/${documentId}/snapshots`);
      setSnapshots(updated);
      setLabel('');
    } catch (err) {
      console.error('Failed to create snapshot:', err);
    } finally {
      setCreating(false);
    }
  };

  const restoreSnapshot = async (snapshotId: string) => {
    if (!confirm('Restore this snapshot? Current content will be replaced.')) return;
    try {
      await api.post(`/documents/${documentId}/snapshots/${snapshotId}/restore`);
      window.location.reload(); // Reload to re-sync Yjs state
    } catch (err) {
      console.error('Failed to restore snapshot:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-end z-50">
      <div className="w-96 h-full bg-gray-900 border-l border-gray-800 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-white font-semibold">Version History</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition">
            &times;
          </button>
        </div>

        {/* Create snapshot */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Snapshot label (optional)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={createSnapshot}
              disabled={creating}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white text-sm rounded transition"
            >
              Save
            </button>
          </div>
        </div>

        {/* Snapshot list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-gray-400 text-sm">Loading...</div>
          ) : snapshots.length === 0 ? (
            <div className="p-4 text-gray-500 text-sm">No snapshots yet</div>
          ) : (
            snapshots.map((snap) => (
              <div
                key={snap.id}
                className="p-4 border-b border-gray-800 hover:bg-gray-800/50 transition"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm font-medium">
                      {snap.label || 'Unnamed snapshot'}
                    </p>
                    <p className="text-gray-500 text-xs mt-1">
                      {snap.authorName} &middot;{' '}
                      {new Date(snap.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => restoreSnapshot(snap.id)}
                    className="text-xs text-blue-400 hover:text-blue-300 transition"
                  >
                    Restore
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
