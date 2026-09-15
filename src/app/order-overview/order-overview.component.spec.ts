/// <reference types="jasmine" />
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { OrderOverviewComponent } from './order-overview.component';
import { OrderService } from '../order.service';
import { AuthService } from '../authentication.service';
import { GlobalService } from '../global.service';
import { ArtikelDataService } from '../artikel-data.service';
import { KommissionierungPdfService } from '../services/kommissionierung-pdf.service';

describe('OrderOverviewComponent', () => {
  let component: OrderOverviewComponent;
  let orderService: jasmine.SpyObj<OrderService>;

  const openOrder = {
    order_id: 12,
    user_id: 1,
    email: 'test@example.com',
    name: 'Test',
    company: 'Firma',
    customer_number: '100',
    total_price: '10.00',
    fulfillment_type: 'delivery',
    order_date: '2026-09-04',
    created_at: '2026-09-04T08:00:00.000Z',
    shipping_address: '',
    payment_status: 'pending',
    delivery_date: '2026-09-05',
    status: 'open',
    picker_user_id: null,
    picker_user_name: null,
    items: []
  };

  beforeEach(async () => {
    orderService = jasmine.createSpyObj('OrderService', [
      'updateOrderStatusOnly',
      'checkOrderProcessingStatus',
      'getAllOrdersWithItems',
      'getOrderWithItems'
    ]);
    orderService.updateOrderStatusOnly.and.returnValue(
      of({
        updatedOrder: {
          status: 'completed',
          picker_user_id: null,
          picker_user_name: null
        }
      })
    );
    orderService.getAllOrdersWithItems.and.returnValue(of({ orders: [] }));
    orderService.getOrderWithItems.and.returnValue(of({ order: { ...openOrder } }));
    orderService.checkOrderProcessingStatus.and.returnValue(
      of({ isBeingProcessed: false, isArchived: false, status: 'open' })
    );

    await TestBed.configureTestingModule({
      imports: [OrderOverviewComponent, HttpClientTestingModule],
      providers: [
        { provide: OrderService, useValue: orderService },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        { provide: AuthService, useValue: { checkToken: () => of({ user: { role: 'admin' } }) } },
        { provide: GlobalService, useValue: {} },
        { provide: ArtikelDataService, useValue: { getData: () => of([]) } },
        { provide: KommissionierungPdfService, useValue: {} }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(OrderOverviewComponent);
    component = fixture.componentInstance;
    component.orders = [{ ...openOrder }];
    spyOn(localStorage, 'getItem').and.returnValue('token-1');
    spyOn(window, 'alert');
  });

  describe('status dropdown', () => {
    it('does not call the API when the same status is selected', () => {
      component.onOrderStatusChange(component.orders[0], 'open');

      expect(orderService.updateOrderStatusOnly).not.toHaveBeenCalled();
    });

    it('ignores statuses that are not selectable in the dropdown', () => {
      component.onOrderStatusChange(component.orders[0], 'picking');

      expect(orderService.updateOrderStatusOnly).not.toHaveBeenCalled();
      expect(component.orders[0].status).toBe('open');
    });

    it('updates the order status through the status-only endpoint', () => {
      spyOn(window, 'confirm').and.returnValue(true);

      component.onOrderStatusChange(component.orders[0], 'completed');

      expect(orderService.updateOrderStatusOnly).toHaveBeenCalledWith(12, 'completed', 'token-1');
      expect(component.orders[0].status).toBe('completed');
    });

    it('asks for confirmation before completing', () => {
      spyOn(window, 'confirm').and.returnValue(false);

      component.onOrderStatusChange(component.orders[0], 'completed');

      expect(window.confirm).toHaveBeenCalled();
      expect(orderService.updateOrderStatusOnly).not.toHaveBeenCalled();
      expect(component.orders[0].status).toBe('open');
    });

    it('reverts the previous status when the API fails', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      orderService.updateOrderStatusOnly.and.returnValue(
        throwError(() => ({ error: { error: 'Fehler' } }))
      );

      component.onOrderStatusChange(component.orders[0], 'completed');

      expect(component.orders[0].status).toBe('open');
      expect(window.alert).toHaveBeenCalled();
    });

    it('opens a confirmation modal instead of parking immediately', () => {
      component.onOrderStatusChange(component.orders[0], 'parked');

      expect(component.showParkModal).toBeTrue();
      expect(component.orderToPark?.order_id).toBe(12);
      expect(orderService.updateOrderStatusOnly).not.toHaveBeenCalled();
      expect(component.orders[0].status).toBe('open');
    });

    it('does not park when the confirmation is cancelled', () => {
      component.onOrderStatusChange(component.orders[0], 'parked');
      component.cancelParkOrder();

      expect(component.showParkModal).toBeFalse();
      expect(component.orderToPark).toBeNull();
      expect(orderService.updateOrderStatusOnly).not.toHaveBeenCalled();
      expect(component.orders[0].status).toBe('open');
      expect(component.getStatusSelectReset(component.orders[0])).toBe(1);
    });

    it('parks an order after confirmation', () => {
      orderService.updateOrderStatusOnly.and.returnValue(
        of({
          updatedOrder: {
            status: 'parked',
            picker_user_id: null,
            picker_user_name: null
          }
        })
      );

      component.onOrderStatusChange(component.orders[0], 'parked');
      component.confirmParkOrder();

      expect(orderService.updateOrderStatusOnly).toHaveBeenCalledWith(12, 'parked', 'token-1');
      expect(component.orders[0].status).toBe('parked');
      expect(component.showParkModal).toBeFalse();
      expect(component.orderToPark).toBeNull();
    });
  });

  describe('parked filter', () => {
    beforeEach(() => {
      component.orders = [
        { ...openOrder },
        { ...openOrder, order_id: 13, status: 'parked' },
        { ...openOrder, order_id: 14, status: 'archived' }
      ];
    });

    it('hides parked orders from the default list', () => {
      expect(component.filteredOrders.map((order) => order.order_id)).toEqual([12]);
    });

    it('shows only parked orders when the parked filter is active', () => {
      component.toggleParkedOnly();

      expect(component.showParkedOnly).toBeTrue();
      expect(component.filteredOrders.map((order) => order.order_id)).toEqual([13]);
    });

    it('can release parked orders', () => {
      const parkedOrder = component.orders[1];

      expect(component.canReleaseOrder(parkedOrder)).toBeTrue();
      expect(component.isOrderEditable(parkedOrder)).toBeTrue();
    });
  });

  describe('performance list helpers', () => {
    it('uses total_gross when items are not loaded', () => {
      const order = { ...openOrder, total_price: '42.50', total_gross: '50.58', items: [] };

      expect(component.getOrderTotalGross(order)).toBe(50.58);
    });

    it('blocks editing when the refreshed order is archived', () => {
      orderService.getOrderWithItems.and.returnValue(
        of({ order: { ...openOrder, status: 'archived', items: [] } })
      );

      component.editOrderAfterReload(component.orders[0]);

      expect(orderService.getOrderWithItems).toHaveBeenCalledWith(12, 'token-1');
      expect(window.alert).toHaveBeenCalled();
      expect(component.orders[0].status).toBe('archived');
    });
  });

  describe('release confirmation', () => {
    beforeEach(() => {
      orderService.updateOrderStatusOnly.and.returnValue(
        of({
          updatedOrder: {
            status: 'released',
            picker_user_id: null,
            picker_user_name: null
          }
        })
      );
    });

    it('opens a confirmation modal instead of releasing immediately', () => {
      component.releaseOrder(component.orders[0]);

      expect(component.showReleaseModal).toBeTrue();
      expect(component.orderToRelease?.order_id).toBe(12);
      expect(orderService.updateOrderStatusOnly).not.toHaveBeenCalled();
    });

    it('does not release when the confirmation is cancelled', () => {
      component.releaseOrder(component.orders[0]);
      component.cancelReleaseOrder();

      expect(component.showReleaseModal).toBeFalse();
      expect(component.orderToRelease).toBeNull();
      expect(orderService.updateOrderStatusOnly).not.toHaveBeenCalled();
      expect(component.orders[0].status).toBe('open');
    });

    it('releases the order after confirmation', () => {
      component.releaseOrder(component.orders[0]);
      component.confirmReleaseOrder();

      expect(orderService.updateOrderStatusOnly).toHaveBeenCalledWith(12, 'released', 'token-1');
      expect(component.orders[0].status).toBe('released');
      expect(component.showReleaseModal).toBeFalse();
      expect(component.orderToRelease).toBeNull();
    });
  });
});
