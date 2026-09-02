'use client';

import React from 'react';
import { hostLog } from '../lib/logger';

export interface SideNavigationProps {
  readonly currentTab: string;
  readonly onTabSelect?: (tabId: string) => void;
}

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview & SSR', icon: '📊', description: 'Federated SSR server card' },
  { id: 'telemetry', label: 'Live Telemetry (SSE)', icon: '⚡', description: 'Real-time Server-Sent Events' },
  { id: 'map', label: 'Fleet Map (MapLibre)', icon: '🗺️', description: 'Interactive MapLibre GL MFE' },
  { id: 'metrics', label: 'Server Cache & State', icon: '⚙️', description: 'Diagnostics & Cross-MFE state' },
] as const;

export const SideNavigation: React.FC<SideNavigationProps> = ({ currentTab, onTabSelect }) => {
  return (
    <nav className="side-navigation" aria-label="Main Navigation">
      <div className="nav-section-title">Micro-Frontend Views</div>
      <ul className="nav-list">
        {NAV_ITEMS.map((item) => {
          const isActive = currentTab === item.id;
          return (
            <li key={item.id} className="nav-item">
              <a
                href={`/?tab=${item.id}`}
                className={`nav-link ${isActive ? 'nav-link-active' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  hostLog.client('NAVIGATE_TAB_CLICK', {
                    tabId: item.id,
                    label: item.label,
                  });
                  onTabSelect?.(item.id);
                }}
              >
                <span className="nav-icon">{item.icon}</span>
                <div className="nav-text-block">
                  <span className="nav-title">{item.label}</span>
                  <span className="nav-description">{item.description}</span>
                </div>
              </a>
            </li>
          );
        })}
      </ul>

      <div className="nav-footer">
        <div className="nav-badge-box">
          <small className="nav-badge-title">Module Federation v8</small>
          <p className="nav-badge-desc">Next.js SSR + Client Islands</p>
        </div>
      </div>
    </nav>
  );
};

export default SideNavigation;
