import { PickingFeedOrder, PickingFeedTracker, feedMatchesQueue } from './picking-feed';

function order(partial: Partial<PickingFeedOrder> & Pick<PickingFeedOrder, 'order_id'>): PickingFeedOrder {
  return {
    status: 'released',
    company: 'Al Forno',
    delivery_date: '2026-10-02',
    order_date: '2026-10-02',
    ...partial,
  };
}

describe('PickingFeedTracker', () => {
  it('treats the first snapshot as the baseline', () => {
    const tracker = new PickingFeedTracker();
    const incoming = tracker.apply([order({ order_id: 1 }), order({ order_id: 2 })]);
    expect(incoming).toEqual([]);
  });

  it('reports only orders that arrive after the baseline', () => {
    const tracker = new PickingFeedTracker();
    tracker.apply([order({ order_id: 1 })]);
    const incoming = tracker.apply([
      order({ order_id: 1, status: 'picking' }),
      order({ order_id: 9, company: 'Neu' }),
    ]);
    expect(incoming.map((entry) => entry.order_id)).toEqual([9]);
  });

  it('drops an order from the hint once the list has loaded it', () => {
    const tracker = new PickingFeedTracker();
    tracker.acknowledge([1]);
    tracker.apply([order({ order_id: 1 }), order({ order_id: 4 })]);
    expect(tracker.acknowledge([4])).toEqual([]);
  });
});

describe('feedMatchesQueue', () => {
  const released = order({ order_id: 10, customer_number: '10.424' });

  it('keeps a released order for today in the default list', () => {
    expect(
      feedMatchesQueue(released, {
        statusFilter: 'all',
        selectedDate: '2026-10-02',
        searchTerm: '',
      })
    ).toBeTrue();
  });

  it('hides an order that falls outside the date or the search', () => {
    expect(
      feedMatchesQueue(released, {
        statusFilter: 'all',
        selectedDate: '2026-10-03',
        searchTerm: '',
      })
    ).toBeFalse();
    expect(
      feedMatchesQueue(released, {
        statusFilter: 'all',
        selectedDate: '2026-10-02',
        searchTerm: 'kebab',
      })
    ).toBeFalse();
  });
});
