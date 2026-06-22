import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/** Navigationsleiste innerhalb des Mitarbeiterplanung-Features. */
@Component({
  selector: 'app-employee-planning-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, MatButtonModule, MatIconModule],
  template: `
    <nav class="feature-nav">
      <a mat-stroked-button routerLink="/mitarbeiterplanung/mitarbeiter" routerLinkActive="active-link">
        <mat-icon>groups</mat-icon>
        Mitarbeiterverwaltung
      </a>
      <a mat-stroked-button routerLink="/mitarbeiterplanung/planung" routerLinkActive="active-link">
        <mat-icon>calendar_month</mat-icon>
        Monatsplanung
      </a>
      <a mat-stroked-button routerLink="/mitarbeiterplanung/urlaubsplanung" routerLinkActive="active-link">
        <mat-icon>beach_access</mat-icon>
        Urlaubsplanung
      </a>
      <a mat-stroked-button routerLink="/admin">
        <mat-icon>arrow_back</mat-icon>
        Zurück
      </a>
    </nav>
  `,
  styles: `
    .feature-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }

    a mat-icon {
      margin-right: 0.35rem;
      vertical-align: middle;
      font-size: 1.1rem;
      width: 1.1rem;
      height: 1.1rem;
    }

    .active-link {
      background: #e3f2fd;
      border-color: #1976d2;
    }
  `,
})
export class EmployeePlanningNavComponent {}
