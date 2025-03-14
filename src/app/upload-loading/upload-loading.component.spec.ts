import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UploadLoadingComponent } from './upload-loading.component';

describe('UploadLoadingComponent', () => {
  let component: UploadLoadingComponent;
  let fixture: ComponentFixture<UploadLoadingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UploadLoadingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UploadLoadingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
