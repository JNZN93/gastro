import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ArtikelCardComponent } from "./artikel-card/artikel-card.component";
import { HeaderComponent } from './header/header.component';
import { LoginComponent } from "./login/login.component";

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'gastroKom';
}
