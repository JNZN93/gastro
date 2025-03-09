import { TestBed } from '@angular/core/testing';

import { ToggleCartService } from './toggle-cart.service';

describe('ToggleCartService', () => {
  let service: ToggleCartService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToggleCartService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
