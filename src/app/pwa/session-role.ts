export const ROLE_STORAGE_KEY = 'gastro.role';

export function readStoredRole(): string {
  try {
    return localStorage.getItem(ROLE_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function storeRole(role: string): void {
  try {
    if (role) {
      localStorage.setItem(ROLE_STORAGE_KEY, role);
    }
  } catch {
    /* private mode */
  }
}

export function clearStoredRole(): void {
  try {
    localStorage.removeItem(ROLE_STORAGE_KEY);
  } catch {
    /* private mode */
  }
}
