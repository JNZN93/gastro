import { Component } from '@angular/core';
import { RouterModule, Router } from '@angular/router';

@Component({
  selector: 'app-footer',
  imports: [RouterModule],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss'
})
export class FooterComponent {

  year = new Date().getFullYear();

  constructor(private router: Router) {}

  navigateToHome() {
    this.router.navigate(['/products']);
  }

}
