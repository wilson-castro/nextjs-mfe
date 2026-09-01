'use client';

import React from 'react';
import Header from './Header';
import SideNavigation from './SideNavigation';
import ToastContainer from './ToastContainer';
import type { UserSession } from '../lib/session';

interface HostLayoutProps {
  readonly children: React.ReactNode;
  readonly currentTab: string;
  readonly currentSession: UserSession;
  readonly onSessionChange: (session: UserSession) => void;
  readonly isRemoteAvailable: boolean;
  readonly onTabSelect?: (tabId: string) => void;
}

export const HostLayout: React.FC<HostLayoutProps> = ({
  children,
  currentTab,
  currentSession,
  onSessionChange,
  isRemoteAvailable,
  onTabSelect,
}) => {
  return (
    <div className="layout-root">
      <Header
        currentSession={currentSession}
        onSessionChange={onSessionChange}
        isRemoteAvailable={isRemoteAvailable}
      />

      <div className="layout-body">
        <aside className="layout-sidebar">
          <SideNavigation currentTab={currentTab} onTabSelect={onTabSelect} />
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
