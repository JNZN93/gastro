import { Component } from '@angular/core';
import { ToggleCartService } from '../toggle-cart.service';

@Component({
  selector: 'app-header',
  imports: [],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent {

  constructor(private toggleService: ToggleCartService) {}

  toggleWarenkorb() {
    this.toggleService.toggle(); // Toggle-Funktion aufrufen
  }

}
