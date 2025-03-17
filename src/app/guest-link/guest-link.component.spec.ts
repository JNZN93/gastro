import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GuestLinkComponent } from './guest-link.component';

describe('GuestLinkComponent', () => {
  let component: GuestLinkComponent;
  let fixture: ComponentFixture<GuestLinkComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GuestLinkComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GuestLinkComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
