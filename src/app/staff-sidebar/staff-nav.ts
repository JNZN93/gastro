export interface StaffNavItem {
  label: string;
  route: string;
  icon: string;
  roles: Array<'admin' | 'employee'>;
  exact?: boolean;
}

/** Same entries as the admin dashboard quick actions, plus the dashboard itself. */
export const STAFF_NAV_ITEMS: StaffNavItem[] = [
  { label: 'Dashboard', route: '/admin', icon: 'dashboard', roles: ['admin', 'employee'], exact: true },
  { label: 'Bestellungsübersicht', route: '/order-overview', icon: 'receipt_long', roles: ['admin', 'employee'] },
  { label: 'Kommissionierung', route: '/picking', icon: 'checklist', roles: ['admin', 'employee'], exact: true },
  { label: 'Aufträge erstellen', route: '/customer-orders', icon: 'add_box', roles: ['admin', 'employee'] },
  { label: 'Offene Rechnungen', route: '/open-invoices', icon: 'receipt', roles: ['admin'] },
  { label: 'Etikettendruck', route: '/label-management', icon: 'sell', roles: ['admin', 'employee'] },
  { label: 'Routenplanung', route: '/route-planning', icon: 'map', roles: ['admin'] },
  { label: 'Lagerbestand / Inventur', route: '/inventory', icon: 'warehouse', roles: ['admin', 'employee'] },
  { label: 'Mitarbeiteransicht', route: '/employees', icon: 'groups', roles: ['admin'] },
  { label: 'Mitarbeiterplanung', route: '/mitarbeiterplanung', icon: 'calendar_month', roles: ['admin'] },
  { label: 'Online-Shop', route: '/products', icon: 'storefront', roles: ['admin', 'employee'] },
  { label: 'Produktverwaltung', route: '/product-management', icon: 'inventory_2', roles: ['admin', 'employee'] },
  { label: 'Angebote verwalten', route: '/offers', icon: 'percent', roles: ['admin'], exact: true },
  { label: 'Kundenpreise Übersicht', route: '/customer-price-overview', icon: 'payments', roles: ['admin'] },
  { label: 'Reports & Analysen', route: '/reports', icon: 'analytics', roles: ['admin'] },
  { label: 'User Management', route: '/user-management', icon: 'manage_accounts', roles: ['admin'] },
  { label: 'Geräte-Tracking', route: '/device-tracking', icon: 'location_on', roles: ['admin'] },
  { label: 'Bestellmonitor', route: '/picking/monitor', icon: 'tv', roles: ['admin', 'employee'] },
];

const STAFF_PREFIXES = [
  '/admin',
  '/open-invoices',
  '/guest-link',
  '/inventory',
  '/product-management',
  '/employees',
  '/label-management',
  '/customer-orders',
  '/order-overview',
  '/user-management',
  '/route-planning',
  '/reports',
  '/offers',
  '/customer-price-overview',
  '/device-tracking',
  '/mitarbeiterplanung',
];

/** Matches the docked sidebar breakpoint in the sidebar styles. */
export const STAFF_SIDEBAR_DESKTOP_MIN = 1101;

export function normalizeAppPath(url: string): string {
  return (url.split('?')[0].split('#')[0] || '/').replace(/\/+$/, '') || '/';
}

export function isPickingQueueUrl(url: string): boolean {
  return normalizeAppPath(url) === '/picking';
}

/** Staff workspace routes. Fullscreen picking and the offer flyer stay without the sidebar. */
export function isStaffWorkspaceUrl(url: string): boolean {
  const path = normalizeAppPath(url);

  if (path.includes('/flyer')) {
    return false;
  }

  if (path === '/picking') {
    return true;
  }

  if (path.startsWith('/picking/')) {
    return false;
  }

  return STAFF_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
