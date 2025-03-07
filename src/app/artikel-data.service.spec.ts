import { TestBed } from '@angular/core/testing';

import { ArtikelDataService } from './artikel-data.service';

describe('ArtikelDataService', () => {
  let service: ArtikelDataService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ArtikelDataService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
