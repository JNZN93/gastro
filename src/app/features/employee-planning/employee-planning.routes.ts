import { Routes } from '@angular/router';
import { EMPLOYEE_PLANNING_REPOSITORY_PROVIDERS } from './repositories/repository.providers';

/** Routen für das Feature „Mitarbeiterplanung“. */
export const EMPLOYEE_PLANNING_ROUTES: Routes = [
  {
    path: '',
    providers: EMPLOYEE_PLANNING_REPOSITORY_PROVIDERS,
    children: [
      { path: '', redirectTo: 'planung', pathMatch: 'full' },
      {
        path: 'planung',
        loadComponent: () =>
          import('./pages/monthly-planning/monthly-planning.component').then(
            (m) => m.MonthlyPlanningComponent
          ),
      },
      {
        path: 'mitarbeiter',
        loadComponent: () =>
          import('./pages/employee-management/employee-management.component').then(
            (m) => m.EmployeeManagementComponent
          ),
      },
      { path: 'abwesenheit', redirectTo: 'planung', pathMatch: 'full' },
      { path: 'urlaubsplanung', redirectTo: 'planung', pathMatch: 'full' },
    ],
  },
];
