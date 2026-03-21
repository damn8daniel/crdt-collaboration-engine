import React from 'react';
import type { AwarenessUser } from '@shared/types';

interface PresenceBarProps {
  users: AwarenessUser[];
}

export function PresenceBar({ users }: PresenceBarProps) {
  if (users.length === 0) return null;

  return (
    <div className="flex items-center -space-x-2">
      {users.slice(0, 8).map((u, i) => (
        <div
          key={u.id || i}
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-gray-900"
          style={{ backgroundColor: u.color }}
          title={u.name}
        >
          {u.name?.[0]?.toUpperCase() || '?'}
        </div>
      ))}
      {users.length > 8 && (
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium text-gray-300 bg-gray-700 border-2 border-gray-900">
          +{users.length - 8}
        </div>
      )}
    </div>
  );
}
