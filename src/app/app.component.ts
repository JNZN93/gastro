import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './header/header.component';
import { LoginComponent } from "./login/login.component";
import { GlobalService } from './global.service';
import { FooterComponent } from "./footer/footer.component";
import { ProductCatalogComponent } from "./product-catalog/product-catalog.component";
import { filter, Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, HeaderComponent, FooterComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'Gastro Depot Worms';
  isCategoryDetailRoute = false;
  shouldHideFooter = false;
  shouldHideHeader = false;
  private isEmployeesRoute = false;
  private routerSubscription?: Subscription;

  constructor(public globalService: GlobalService, private router: Router) {}

  ngOnInit() {
    // Initial state on load
    this.isEmployeesRoute = this.router.url.includes('/employees');
    this.updateHeaderVisibility();

    this.routerSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.isCategoryDetailRoute = event.url.includes('/category/');
        // Footer auf Gast-Link-Route, Admin-Routen (außer Kundenansicht), Category-Routen und Customer-Order-Route ausblenden
        this.shouldHideFooter = event.url.includes('/category/') || 
                                event.url.includes('/guest-link') || 
                                event.url.includes('/admin') ||
                                event.url.includes('/product-management') ||
                                event.url.includes('/employees') ||
                                event.url.includes('/label-management') ||
                                event.url.includes('/order-overview') ||
                                event.url.includes('/user-management') ||
                                event.url.includes('/route-planning') ||
                                event.url.includes('/reports') ||
                                event.url.includes('/offers') ||
                                event.url.includes('/customer-order/');

        // Header auf Employees-Route nur auf Mobile/Tablet ausblenden
        this.isEmployeesRoute = event.url.includes('/employees');
        
        // Header auf Public Order Review Route ausblenden
        const isPublicOrderReview = event.url.includes('/customer-order/') && event.url.includes('/review');
        const isMobileOrTablet = typeof window !== 'undefined' ? window.innerWidth <= 1023 : false;
        this.shouldHideHeader = (this.isEmployeesRoute && isMobileOrTablet) || isPublicOrderReview;
        
        this.updateHeaderVisibility();
      });
  }

  @HostListener('window:resize')
  onResize() {
    this.updateHeaderVisibility();
  }

  private updateHeaderVisibility() {
    const isMobileOrTablet = typeof window !== 'undefined' ? window.innerWidth <= 1023 : false;
    const isPublicOrderReview = this.router.url.includes('/customer-order/') && this.router.url.includes('/review');
    
    this.shouldHideHeader = (this.isEmployeesRoute && isMobileOrTablet) || isPublicOrderReview;
  }

  ngOnDestroy() {
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
  }
}
