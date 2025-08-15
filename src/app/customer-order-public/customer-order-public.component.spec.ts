import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CustomerOrderPublicComponent } from './customer-order-public.component';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { FormsModule } from '@angular/forms';

describe('CustomerOrderPublicComponent', () => {
  let component: CustomerOrderPublicComponent;
  let fixture: ComponentFixture<CustomerOrderPublicComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        CustomerOrderPublicComponent,
        HttpClientTestingModule,
        RouterTestingModule,
        FormsModule
      ]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CustomerOrderPublicComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
