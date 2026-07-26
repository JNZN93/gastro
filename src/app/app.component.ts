import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './header/header.component';
import { GlobalService } from './global.service';
import { FooterComponent } from "./footer/footer.component";
import { OrderChatComponent } from './order-chat/order-chat.component';
import { filter, Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, HeaderComponent, FooterComponent, OrderChatComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'Gastro Depot Worms';
  isCategoryDetailRoute = false;
  shouldHideFooter = false;
  shouldHideHeader = false;
  showOrderChatWidget = true;
  private isEmployeesRoute = false;
  private routerSubscription?: Subscription;

  constructor(public globalService: GlobalService, private router: Router) {}

  ngOnInit() {
    // Initial state on load
    this.isEmployeesRoute = this.router.url.includes('/employees');
    this.shouldHideFooter = this.isFooterHiddenForUrl(this.router.url);
    this.updateHeaderVisibility();
    this.updatePickingBodyClass(this.router.url);
    this.updateOrderChatWidget(this.router.url);

    this.routerSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.isCategoryDetailRoute = event.url.includes('/category/');
        this.shouldHideFooter = this.isFooterHiddenForUrl(event.url);

        // Header auf Employees-Route nur auf Mobile/Tablet ausblenden
        this.isEmployeesRoute = event.url.includes('/employees');
        this.updateHeaderVisibility();
        this.updatePickingBodyClass(event.url);
        this.updateOrderChatWidget(event.url);
      });
  }

  @HostListener('window:resize')
  onResize() {
    this.updateHeaderVisibility();
  }

  private isFooterHiddenForUrl(url: string): boolean {
    return (
      url.includes('/category/') ||
      url.includes('/guest-link') ||
      url.includes('/admin') ||
      url.includes('/product-management') ||
      url.includes('/employees') ||
      url.includes('/label-management') ||
      url.includes('/order-overview') ||
      url.includes('/user-management') ||
      url.includes('/route-planning') ||
      url.includes('/reports') ||
      url.includes('/offers') ||
      url.includes('/customer-order/') ||
      url.includes('/customer-price-overview') ||
      url.includes('/mitarbeiterplanung') ||
      url.includes('/order-chat') ||
      url.startsWith('/picking')
    );
  }

  private updateHeaderVisibility() {
    const isMobileOrTablet = typeof window !== 'undefined' ? window.innerWidth <= 1023 : false;
    const isPublicOrderReview = this.router.url.includes('/customer-order/') && this.router.url.includes('/review');
    const isOfferFlyer = this.router.url.includes('/offers/') && this.router.url.includes('/flyer');
    const isPicking = this.router.url.startsWith('/picking');
    const isOrderChat = this.router.url.includes('/order-chat');

    this.shouldHideHeader = (this.isEmployeesRoute && isMobileOrTablet) || isPublicOrderReview || isOfferFlyer || isPicking || isOrderChat;
  }

  private updatePickingBodyClass(url: string): void {
    if (typeof document === 'undefined') {
      return;
    }
    document.body.classList.toggle('picking-mode', url.startsWith('/picking'));
  }

  private updateOrderChatWidget(url: string): void {
    // Float auf öffentlichen Seiten; auf Admin-/Mitarbeiterflächen und der Vollseite ausblenden
    const hide =
      url.includes('/order-chat') ||
      url.includes('/admin') ||
      url.includes('/guest-link') ||
      url.includes('/product-management') ||
      url.includes('/employees') ||
      url.includes('/label-management') ||
      url.includes('/order-overview') ||
      url.includes('/customer-orders') ||
      url.includes('/user-management') ||
      url.includes('/route-planning') ||
      url.includes('/reports') ||
      url.includes('/offers') ||
      url.includes('/customer-price-overview') ||
      url.includes('/open-invoices') ||
      url.includes('/device-tracking') ||
      url.includes('/inventory') ||
      url.includes('/mitarbeiterplanung') ||
      url.startsWith('/picking') ||
      url.includes('/login') ||
      url.includes('/registration');
    this.showOrderChatWidget = !hide;
  }

  ngOnDestroy() {
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
    this.updatePickingBodyClass('');
  }
}
