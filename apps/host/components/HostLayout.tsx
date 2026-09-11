'use client';

import React from 'react';
import Header from './Header';
import SideNavigation from './SideNavigation';
import ToastContainer from './ToastContainer';
import type { UserSession } from '../lib/session';

interface HostLayoutProps {
  readonly children: React.ReactNode;
  readonly currentSession: UserSession;
  readonly onSessionChange: (session: UserSession) => void;
}

export const HostLayout: React.FC<HostLayoutProps> = ({
  children,
  currentSession,
  onSessionChange,
}) => {
  return (
    <div className="layout-root">
      <Header
        currentSession={currentSession}
        onSessionChange={onSessionChange}
      />

      <div className="layout-body">
        <aside className="layout-sidebar">
          <SideNavigation />
        </aside>

        <main className="layout-main">
          {children}
        </main>
      </div>

      <ToastContainer />
    </div>
  );
};

export default HostLayout;
