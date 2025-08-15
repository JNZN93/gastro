import { Component, OnInit, OnDestroy } from '@angular/core';
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
  private routerSubscription?: Subscription;

  constructor(public globalService: GlobalService, private router: Router) {}

  ngOnInit() {
    this.routerSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.isCategoryDetailRoute = event.url.includes('/category/');
        // Footer auf Gast-Link-Route, Admin-Routen (außer Kundenansicht) und Category-Routen ausblenden
        this.shouldHideFooter = event.url.includes('/category/') || 
                                event.url.includes('/guest-link') || 
                                event.url.includes('/admin') ||
                                event.url.includes('/product-management') ||
                                event.url.includes('/employees') ||
                                event.url.includes('/label-management') ||
                                event.url.includes('/order-overview') ||
                                event.url.includes('/user-management') ||
                                event.url.includes('/route-planning') ||
                                event.url.includes('/reports');
        
        // Header auf customer-order Route ausblenden
        this.shouldHideHeader = event.url.includes('/customer-order/');
      });
  }

  ngOnDestroy() {
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
  }
}
