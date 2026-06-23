import { Routes } from '@angular/router';

/** Routen für das Feature „Mitarbeiterplanung“. */
export const EMPLOYEE_PLANNING_ROUTES: Routes = [
  { path: '', redirectTo: 'mitarbeiter', pathMatch: 'full' },
  {
    path: 'mitarbeiter',
    loadComponent: () =>
      import('./pages/employee-management/employee-management.component').then(
        (m) => m.EmployeeManagementComponent
      ),
  },
  {
    path: 'planung',
    loadComponent: () =>
      import('./pages/monthly-planning/monthly-planning.component').then(
        (m) => m.MonthlyPlanningComponent
      ),
  },
  {
    path: 'abwesenheit',
    loadComponent: () =>
      import('./pages/vacation-planning/vacation-planning.component').then(
        (m) => m.VacationPlanningComponent
      ),
  },
  { path: 'urlaubsplanung', redirectTo: 'abwesenheit', pathMatch: 'full' },
];
