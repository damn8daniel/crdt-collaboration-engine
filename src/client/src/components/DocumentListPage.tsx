import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../utils/api';
import type { DocumentMeta, PaginatedResponse } from '@shared/types';

export function DocumentListPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<PaginatedResponse<DocumentMeta>>('/documents')
      .then((res) => setDocuments(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const createDocument = async () => {
    try {
      const doc = await api.post<{ id: string }>('/documents', {
        title: 'New Document',
        language: 'typescript',
      });
      navigate(`/documents/${doc.id}`);
    } catch (err) {
      console.error('Failed to create document:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Collaboration Engine</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">{user?.name}</span>
            <button
              onClick={logout}
              className="text-sm text-gray-400 hover:text-white transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Documents</h2>
          <button
            onClick={createDocument}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
          >
            + New Document
          </button>
        </div>

        {loading ? (
          <div className="text-gray-400">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 mb-4">No documents yet</p>
            <button
              onClick={createDocument}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
            >
              Create your first document
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {documents.map((doc) => (
              <Link
                key={doc.id}
                to={`/documents/${doc.id}`}
                className="block p-4 bg-gray-900 border border-gray-800 rounded-lg hover:border-gray-700 transition group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-white group-hover:text-blue-400 transition">
                      {doc.title}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {doc.language} &middot; {doc.ownerName} &middot;{' '}
                      {new Date(doc.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-1 bg-gray-800 text-gray-400 rounded">
                      {doc.role}
                    </span>
                    {doc.collaboratorCount > 1 && (
                      <span className="text-xs text-gray-500">
                        {doc.collaboratorCount} collaborators
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
