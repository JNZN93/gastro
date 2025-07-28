import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './header/header.component';
import { LoginComponent } from "./login/login.component";
import { GlobalService } from './global.service';
import { FooterComponent } from "./footer/footer.component";
import { ProductCatalogComponent } from "./product-catalog/product-catalog.component";

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent, FooterComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'Gastro Depot Worms';

  constructor(public globalService: GlobalService) {}
}
