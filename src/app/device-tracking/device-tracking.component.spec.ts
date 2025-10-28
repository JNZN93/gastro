import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DeviceTrackingComponent } from './device-tracking.component';

describe('DeviceTrackingComponent', () => {
  let component: DeviceTrackingComponent;
  let fixture: ComponentFixture<DeviceTrackingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeviceTrackingComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DeviceTrackingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

