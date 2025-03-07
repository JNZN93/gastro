import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ArtikelCardComponent } from './artikel-card.component';

describe('ArtikelCardComponent', () => {
  let component: ArtikelCardComponent;
  let fixture: ComponentFixture<ArtikelCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArtikelCardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ArtikelCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
