import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { RoutePlanningComponent } from './route-planning.component';

describe('RoutePlanningComponent', () => {
  let component: RoutePlanningComponent;
  let fixture: ComponentFixture<RoutePlanningComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoutePlanningComponent, HttpClientTestingModule, RouterTestingModule]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(RoutePlanningComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
}); 