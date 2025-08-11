import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { AuthService } from '../authentication.service';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-guest-link',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './guest-link.component.html',
  styleUrl: './guest-link.component.scss'
})
export class GuestLinkComponent implements OnInit {

  name: string = "";
  role: string = "";
  newLink: string = "";
  newPin: string = "";
  showSnackbar = false;
  showPin = false;
  showLink = false;
  
  @ViewChild('inputLink') inputLink!: ElementRef;
  @ViewChild('inputPin') inputPin!: ElementRef;

  constructor(
    private http: HttpClient, 
    private authService: AuthService, 
    private router: Router,
    private location: Location
  ) {
  }
  
  ngOnInit(): void {
    this.checkUserRole();
  }

  goBack(): void {
    // Versuche zur vorherigen Seite zurückzugehen
    if (window.history.length > 1) {
      this.location.back();
    } else {
      // Fallback: Zur Admin-Seite navigieren
      this.router.navigate(['/admin']);
    }
  }

  generateLink() {
    if (!this.name || !this.role) {
      return;
    }
    
    this.authService.generateLink(this.name, this.role).subscribe({
      next: (response) => {
        console.log(response.link);
        this.newLink = response.link;
        this.newPin = response.pin;
      },
      error: (error) => {
        console.error(error);
        alert(error.error.message);
      },
    });
  }


  checkUserRole() {
    this.authService.checkToken(localStorage.getItem('token')).subscribe({
      next: (response) => {
        console.log(response);
        if (response?.user?.role !== 'admin') {
          this.router.navigate(['/login']);
        }
      },
      error: (error) => {
        console.error(error);
        this.router.navigate(['/login']);
      },
    });
  }

  copyLink() {
      const inputLink = this.inputLink.nativeElement;
      navigator.clipboard.writeText(inputLink.value)
        .then(() => {
          this.showLink = true;
          this.showSnackbar = true;
          setTimeout(() => {
            this.showLink = false;
            this.showSnackbar = false;
          }, 2000); // Snackbar nach 2 Sekunden ausblenden
        })
        .catch(err => console.error('Fehler beim Kopieren:', err));
  }

  copyPin() {
    const inputPin = this.inputPin.nativeElement;
    navigator.clipboard.writeText(inputPin.value)
      .then(() => {
        this.showPin = true;
        this.showSnackbar = true;
        setTimeout(() => {
          this.showPin = false;
          this.showSnackbar = false;
        }, 2000); // Snackbar nach 2 Sekunden ausblenden
      })
      .catch(err => console.error('Fehler beim Kopieren:', err));
  }
}
