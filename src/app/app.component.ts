import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ArtikelCardComponent } from "./artikel-card/artikel-card.component";
import { HeaderComponent } from './header/header.component';
import { LoginComponent } from "./login/login.component";
import { GlobalService } from './global.service';
import { FooterComponent } from "./footer/footer.component";

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
