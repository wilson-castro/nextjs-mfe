export interface UserSession {
  readonly userId: string;
  readonly userName: string;
  readonly email: string;
  readonly role: 'admin' | 'operator' | 'viewer';
  readonly tenant: string;
}

export const PRESET_USERS: readonly UserSession[] = [
  {
    userId: 'usr_admin_01',
    userName: 'Ana Souza (Admin)',
    email: 'ana.souza@enterprise.io',
    role: 'admin',
    tenant: 'tenant-global-main',
  },
  {
    userId: 'usr_operator_02',
    userName: 'Carlos Silva (Operator)',
    email: 'carlos.silva@enterprise.io',
    role: 'operator',
    tenant: 'tenant-sa-east',
  },
  {
    userId: 'usr_viewer_03',
    userName: 'Mariana Lima (Viewer)',
    email: 'mariana.lima@guest.io',
    role: 'viewer',
    tenant: 'tenant-public-demo',
  },
];

export const DEFAULT_SESSION: UserSession = PRESET_USERS[0];

export function getSessionFromStorage(): UserSession {
  if (typeof window === 'undefined') return DEFAULT_SESSION;
  try {
    const raw = localStorage.getItem('host_user_session');
    if (!raw) return DEFAULT_SESSION;
    return JSON.parse(raw) as UserSession;
  } catch {
    return DEFAULT_SESSION;
  }
}

export function saveSessionToStorage(session: UserSession): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('host_user_session', JSON.stringify(session));
}
