import { TestBed } from '@angular/core/testing';
import { PickingStateService } from './picking-state.service';
import { PickItemState, PickingOrder } from '../models/picking.models';

describe('PickingStateService', () => {
  let service: PickingStateService;

  const sampleOrder: PickingOrder = {
    order_id: 42,
    status: 'open',
    items: [
      {
        product_id: 1,
        quantity: 5,
        price: '2.00',
        different_price: null,
        product_name: 'Apfel',
        product_article_number: 'A-1',
      },
      {
        product_id: 2,
        quantity: 1,
        price: '3.50',
        different_price: '3.00',
        product_name: 'Birne',
        product_article_number: 'B-2',
      },
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PickingStateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('creates initial pending items with prices', () => {
    const state = service.createInitialState(sampleOrder, 'Max');

    expect(state.orderId).toBe(42);
    expect(state.startedBy).toBe('Max');
    expect(state.items.length).toBe(2);
    expect(state.items[0].status).toBe('pending');
    expect(state.items[0].pickedQuantity).toBe(0);
    expect(state.items[0].price).toBe(2);
    expect(state.items[1].differentPrice).toBe(3);
  });

  it('validates fingerprint against order items', () => {
    const state = service.createInitialState(sampleOrder, 'Max');
    expect(service.isFingerprintValid(state, sampleOrder)).toBeTrue();

    const changed = {
      ...sampleOrder,
      items: [{ ...sampleOrder.items[0], quantity: 9 }, sampleOrder.items[1]],
    };
    expect(service.isFingerprintValid(state, changed)).toBeFalse();
  });

  it('computes progress and completion rules', () => {
    const state = service.createInitialState(sampleOrder, 'Max');
    expect(service.getProgress(state)).toEqual({ done: 0, total: 2, percent: 0 });
    expect(service.canComplete(state)).toBeFalse();

    state.items[0].status = 'picked';
    state.items[0].pickedQuantity = 5;
    state.items[1].status = 'unavailable';

    expect(service.getProgress(state)).toEqual({ done: 2, total: 2, percent: 100 });
    expect(service.canComplete(state)).toBeTrue();
  });

  it('updates item status from quantities', () => {
    const item: PickItemState = {
      key: '1:0',
      productId: 1,
      articleNumber: 'A-1',
      productName: 'Apfel',
      targetQuantity: 5,
      pickedQuantity: 0,
      status: 'pending',
    };

    expect(service.updateItemStatus(item)).toBe('pending');

    item.pickedQuantity = 2;
    expect(service.updateItemStatus(item)).toBe('partial');

    item.pickedQuantity = 5;
    expect(service.updateItemStatus(item)).toBe('picked');

    item.status = 'unavailable';
    item.pickedQuantity = 0;
    expect(service.updateItemStatus(item)).toBe('unavailable');
  });
});
