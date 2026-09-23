import { TestBed } from '@angular/core/testing';
import { PickingStateService } from './picking-state.service';
import { PickItemState, PickingOrder } from '../models/picking.models';

describe('PickingStateService', () => {
  let service: PickingStateService;

  const sampleOrder: PickingOrder = {
    order_id: 42,
    status: 'released',
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
    expect(state.originalItems?.length).toBe(2);
    expect(state.originalItems?.[0].quantity).toBe(5);
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

  it('groups the same article from two orders without merging quantities', () => {
    const tomatoes = (orderId: number, quantity: number, index: number): PickItemState => ({
      key: `${orderId}:1:${index}`,
      productId: 1,
      articleNumber: 'T-1',
      productName: 'Tomaten',
      targetQuantity: quantity,
      pickedQuantity: 0,
      status: 'pending',
      sourceOrderId: orderId,
      originalIndex: index,
    });
    const oil = (orderId: number): PickItemState => ({
      key: `${orderId}:8:16`,
      productId: 8,
      articleNumber: 'O-9',
      productName: 'Öl',
      targetQuantity: 1,
      pickedQuantity: 0,
      status: 'pending',
      sourceOrderId: orderId,
      originalIndex: 16,
    });

    const arranged = service.arrangeForPicking([
      oil(481),
      tomatoes(481, 3, 16),
      tomatoes(482, 2, 1),
    ]);

    expect(arranged.map((item) => `${item.articleNumber}:${item.sourceOrderId}`)).toEqual([
      'O-9:481',
      'T-1:481',
      'T-1:482',
    ]);
    expect(arranged[1].targetQuantity).toBe(3);
    expect(arranged[2].targetQuantity).toBe(2);
  });

  it('keeps each order pfand directly under its article', () => {
    const line = (
      articleNumber: string,
      orderId: number,
      index: number,
      extra: Partial<PickItemState> = {}
    ): PickItemState => ({
      key: `${orderId}:${articleNumber}:${index}`,
      productId: index + 1,
      articleNumber,
      productName: articleNumber,
      targetQuantity: 1,
      pickedQuantity: 0,
      status: 'pending',
      sourceOrderId: orderId,
      originalIndex: index,
      ...extra,
    });

    const items = [
      line('DOSCOL001', 481, 0, { customField1: '600' }),
      line('600', 481, 1, { isPfandLine: true, category: 'PFAND' }),
      line('DOSFAN001', 481, 2, { customField1: '600' }),
      line('600', 481, 3, { isPfandLine: true, category: 'PFAND' }),
      line('DOSCOL001', 482, 0, { customField1: '600' }),
      line('600', 482, 1, { isPfandLine: true, category: 'PFAND' }),
    ];

    service.linkConsecutivePfand(items);
    const arranged = service.arrangeForPicking(items);

    expect(arranged.map((item) => `${item.articleNumber}:${item.sourceOrderId}`)).toEqual([
      'DOSCOL001:481',
      '600:481',
      'DOSCOL001:482',
      '600:482',
      'DOSFAN001:481',
      '600:481',
    ]);

    expect(service.itemsInOriginalOrder(items, 481).map((item) => item.originalIndex ?? -1)).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it('restores each line to its original position inside its order', () => {
    const items: PickItemState[] = [
      {
        key: '481:8:0',
        productId: 8,
        articleNumber: 'O-9',
        productName: 'Öl',
        targetQuantity: 1,
        pickedQuantity: 1,
        status: 'picked',
        sourceOrderId: 481,
        originalIndex: 0,
      },
      {
        key: '481:1:16',
        productId: 1,
        articleNumber: 'T-1',
        productName: 'Tomaten',
        targetQuantity: 3,
        pickedQuantity: 3,
        status: 'picked',
        sourceOrderId: 481,
        originalIndex: 16,
      },
      {
        key: 'pfand:481:1:16',
        productId: 9,
        articleNumber: 'P-1',
        productName: 'Pfand',
        targetQuantity: 3,
        pickedQuantity: 3,
        status: 'picked',
        sourceOrderId: 481,
        isPfandLine: true,
        parentItemKey: '481:1:16',
      },
      {
        key: '482:1:1',
        productId: 1,
        articleNumber: 'T-1',
        productName: 'Tomaten',
        targetQuantity: 2,
        pickedQuantity: 2,
        status: 'picked',
        sourceOrderId: 482,
        originalIndex: 1,
      },
    ];

    const order481 = service.itemsInOriginalOrder(items, 481);
    expect(order481.map((item) => item.key)).toEqual(['481:8:0', '481:1:16', 'pfand:481:1:16']);

    const order482 = service.itemsInOriginalOrder(items, 482);
    expect(order482.map((item) => item.key)).toEqual(['482:1:1']);
  });
});
