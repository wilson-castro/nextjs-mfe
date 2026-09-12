'use client';

import React from 'react';
import { hostLog } from '../lib/logger';

export interface SideNavigationProps {}

export const SideNavigation: React.FC<SideNavigationProps> = () => {
  const handleNavClick = (label: string, destination: string) => {
    hostLog.client('NAVIGATE_ZONE_CLICK', { label, destination });
  };

  return (
    <nav className="side-navigation" aria-label="Main Navigation">
      <div className="nav-section-title">Zones & Navigation</div>
      <ul className="nav-list">
        <li className="nav-item">
          <a
            href="/"
            className="nav-link"
            onClick={() => handleNavClick('Shell Home', '/')}
          >
            <span className="nav-icon">🏠</span>
            <div className="nav-text-block">
              <span className="nav-title">Shell Home</span>
              <span className="nav-description">Gateway diagnostics</span>
            </div>
          </a>
        </li>
        <li className="nav-item">
          {/* Architectural invariant: cross-zone navigation MUST use plain <a>, NEVER Next.js <Link> */}
          <a
            href="/remote-app"
            className="nav-link"
            onClick={() => handleNavClick('Remote App Zone', '/remote-app')}
          >
            <span className="nav-icon">📦</span>
            <div className="nav-text-block">
              <span className="nav-title">Remote App</span>
              <span className="nav-description">Port 3001 autonomous zone</span>
            </div>
          </a>
        </li>
      </ul>

      <div className="nav-footer">
        <div className="nav-badge-box">
          <small className="nav-badge-title">Next.js Multi-Zones</small>
          <p className="nav-badge-desc">Native HTTP Zone Routing</p>
        </div>
      </div>
    </nav>
  );
};

export default SideNavigation;
