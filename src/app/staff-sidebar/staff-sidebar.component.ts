import { Component, HostListener, Input, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { filter, Subscription } from 'rxjs';
import { GlobalService } from '../global.service';
import { readStoredRole } from '../pwa/session-role';
import { STAFF_NAV_ITEMS, StaffNavItem } from './staff-nav';

const COLLAPSED_KEY = 'gastro.staffSidebar.collapsed';
const LEGACY_COLLAPSED_KEY = 'gastro.staffSidebarCollapsed';

@Component({
  selector: 'app-staff-sidebar',
  imports: [RouterLink, RouterLinkActive, MatIconModule],
  templateUrl: './staff-sidebar.component.html',
  styleUrl: './staff-sidebar.component.scss',
})
export class StaffSidebarComponent implements OnInit, OnDestroy {
  @Input() belowHeader = true;
  mobileOpen = false;
  collapsed = true;
  private routerSub?: Subscription;

  constructor(
    private router: Router,
    private globalService: GlobalService
  ) {
    this.collapsed = readCollapsed();
    this.applyCollapsed(this.collapsed);
  }

  ngOnInit(): void {
    this.routerSub = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.mobileOpen = false;
      });
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
    document.body.classList.remove('staff-sidebar-collapsed');
  }

  toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
    try {
      localStorage.setItem(COLLAPSED_KEY, this.collapsed ? '1' : '0');
    } catch {
      /* private mode */
    }
    this.applyCollapsed(this.collapsed);
  }

  get items(): StaffNavItem[] {
    const role = this.globalService.getUserRole() || readStoredRole();
    return STAFF_NAV_ITEMS.filter((item) => item.roles.includes(role as 'admin' | 'employee'));
  }

  toggleMobile(): void {
    this.mobileOpen = !this.mobileOpen;
  }

  closeMobile(): void {
    this.mobileOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMobile();
  }

  private applyCollapsed(collapsed: boolean): void {
    document.body.classList.toggle('staff-sidebar-collapsed', collapsed);
  }
}

function readCollapsed(): boolean {
  try {
    localStorage.removeItem(LEGACY_COLLAPSED_KEY);
    return localStorage.getItem(COLLAPSED_KEY) !== '0';
  } catch {
    return true;
  }
}
