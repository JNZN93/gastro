import { CanDeactivateFn, Routes } from '@angular/router';

const canLeavePickingSession: CanDeactivateFn<{ confirmLeave: () => boolean | Promise<boolean> }> = (
  component
) => component.confirmLeave();

export const PICKING_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/picking-queue/picking-queue.component').then(
        (m) => m.PickingQueueComponent
      ),
  },
  {
    path: 'monitor',
    loadComponent: () =>
      import('./pages/picking-board/picking-board.component').then((m) => m.PickingBoardComponent),
  },
  {
    path: 'combined/:firstId/:secondId',
    loadComponent: () =>
      import('./pages/picking-session/picking-session.component').then(
        (m) => m.PickingSessionComponent
      ),
    canDeactivate: [canLeavePickingSession],
  },
  {
    path: ':orderId',
    loadComponent: () =>
      import('./pages/picking-session/picking-session.component').then(
        (m) => m.PickingSessionComponent
      ),
    canDeactivate: [canLeavePickingSession],
  },
];
