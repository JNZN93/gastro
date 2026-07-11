import { Routes } from '@angular/router';

export const PICKING_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/picking-queue/picking-queue.component').then(
        (m) => m.PickingQueueComponent
      ),
  },
  {
    path: ':orderId',
    loadComponent: () =>
      import('./pages/picking-session/picking-session.component').then(
        (m) => m.PickingSessionComponent
      ),
  },
];
