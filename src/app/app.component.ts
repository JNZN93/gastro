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
  private routerSubscription?: Subscription;

  constructor(public globalService: GlobalService, private router: Router) {}

  ngOnInit() {
    this.routerSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.isCategoryDetailRoute = event.url.includes('/category/');
      });
  }

  ngOnDestroy() {
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
  }
}
