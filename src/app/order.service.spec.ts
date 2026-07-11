import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { OrderService } from './order.service';
import { environment } from '../environments/environment';

describe('OrderService picking API', () => {
  let service: OrderService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(OrderService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('sends picking status with picker name', () => {
    service
      .updateOrderStatusOnly(12, 'picking', 'token-1', { picker_user_name: 'Anna' })
      .subscribe((res) => {
        expect(res.message).toContain('Status');
      });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/orders/12/status`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      status: 'picking',
      picker_user_name: 'Anna',
    });
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-1');
    req.flush({ message: 'Status erfolgreich aktualisiert!', updatedOrder: { id: 12 } });
  });

  it('posts picking items with complete flag', () => {
    const items = [
      { product_id: 1, quantity: 2, price: 1.5 },
      { product_id: 2, quantity: 0, remove: true },
    ];

    service.applyPickingItems(12, items, 'token-1', true).subscribe((res) => {
      expect(res.updatedOrder.status).toBe('picked');
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/orders/12/picking`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ items, complete: true });
    req.flush({
      message: 'Kommissionierung abgeschlossen!',
      updatedOrder: { id: 12, status: 'picked' },
    });
  });
});
