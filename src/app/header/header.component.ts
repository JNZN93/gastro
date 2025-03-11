import { Component } from '@angular/core';
import { ToggleCartService } from '../toggle-cart.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-header',
  imports: [],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent {
  showModal = false;
  private hiddenRoutes: string[] = ['/login', '/registration'];

  constructor(private toggleService: ToggleCartService, private router: Router) {}

  toggleWarenkorb() {
    this.toggleService.toggle(); // Toggle-Funktion aufrufen
  }

  openModal() {
    this.showModal = true;

  }

  logOut() {
    localStorage.removeItem('token');
    this.showModal = false;
    location.reload();
  }

  goBack() {
    this.showModal = false;
  }

  shouldHideElement(): boolean {
    return this.hiddenRoutes.includes(this.router.url);
  }
}
