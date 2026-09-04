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

describe('OrderOverviewComponent status dropdown', () => {
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
      'checkOrderProcessingStatus'
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
});
