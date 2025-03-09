import { Component, OnInit } from '@angular/core';
import { AuthService } from '../authentication.service';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-loading-screen',
  imports: [RouterModule],
  templateUrl: './loading-screen.component.html',
  styleUrl: './loading-screen.component.scss'
})
export class LoadingScreenComponent implements OnInit {
  isTokenValid: boolean | null = null;

  constructor(private authService: AuthService, private router: Router) { }

  ngOnInit(): void {
    const token = localStorage.getItem('token');

    if (token) {
      this.authService.checkToken(token).subscribe({
        next: (response) => {
          console.log('Token gültig:', response);
          this.router.navigate(['/products']);
          this.isTokenValid = true;
        },
        error: (error) => {
          console.error('Token ungültig oder Fehler:', error);
          this.router.navigate(['/login']); // Erfolgreich weiterleiten
          this.isTokenValid = false;
        }
      });
    } else {
      console.log('Kein Token gefunden.');
      this.router.navigate(['/login']);
      this.isTokenValid = false;
    }
  }

}
