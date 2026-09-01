'use client';

import React from 'react';
import { PRESET_USERS, type UserSession } from '../lib/session';
import { emitToast } from '../lib/events';

interface HeaderProps {
  readonly currentSession: UserSession;
  readonly onSessionChange: (session: UserSession) => void;
  readonly isRemoteAvailable: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentSession,
  onSessionChange,
  isRemoteAvailable,
}) => {
  const handleUserSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = PRESET_USERS.find((u) => u.userId === e.target.value);
    if (!selected) return;

    onSessionChange(selected);
    emitToast(
      'Session Switched in Host',
      `Active user changed to ${selected.userName} (${selected.role})`,
      'info'
    );
  };

  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="brand-logo">MFE</div>
        <div>
          <h1 className="brand-title">Enterprise MFE Host</h1>
          <span className="brand-subtitle">Next.js 15 App Shell (Port 3000)</span>
        </div>
      </div>

      <div className="header-actions">
        <div className="system-pill">
          <span className={`status-dot ${isRemoteAvailable ? 'dot-online' : 'dot-offline'}`} />
          <span>Remote MFE (3001): {isRemoteAvailable ? 'Online' : 'Degraded'}</span>
        </div>

        <div className="session-selector">
          <label htmlFor="user-select" className="session-label">Session:</label>
          <select
            id="user-select"
            value={currentSession.userId}
            onChange={handleUserSelect}
            className="session-dropdown"
          >
            {PRESET_USERS.map((user) => (
              <option key={user.userId} value={user.userId}>
                {user.userName} ({user.role})
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="header-toast-btn"
          onClick={() => emitToast('Host Notification', 'Event triggered from Host Shell Header', 'info')}
        >
          🔔 Ping Toast
        </button>
      </div>
    </header>
  );
};

export default Header;
