import { Component } from '@angular/core';
import { ToggleCartService } from '../toggle-cart.service';
import { Router, RouterModule } from '@angular/router';
import { GlobalService } from '../global.service';

@Component({
  selector: 'app-header',
  imports: [RouterModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent {
  showModal = false;
  private hiddenRoutes: string[] = ['/login', '/registration', '/verify', '/impress', '/privacy'];

  constructor(private toggleService: ToggleCartService, private router: Router, public globalService:GlobalService) {}

  toggleWarenkorb() {
    this.toggleService.toggle(); // Toggle-Funktion aufrufen
  }

  openModal() {
    this.showModal = true;

  }

  logOut() {
    localStorage.removeItem('token');
    localStorage.removeItem('warenkorb');
    this.globalService.clearSelectedCustomer();
    this.showModal = false;
    this.router.navigate(['login'])
    window.location.reload();
  }

  goBack() {
    this.showModal = false;
  }

  shouldHideElement(): boolean {
    return this.hiddenRoutes.includes(this.router.url);
  }

  shouldHideElementAdmin(): boolean {
    return this.router.url === '/admin';
  }

  navigateToAdmin() {
    this.globalService.clearSelectedCustomer();
    this.router.navigate(['/admin']);
  }
}
