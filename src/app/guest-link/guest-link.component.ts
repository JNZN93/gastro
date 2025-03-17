import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { AuthService } from '../authentication.service';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-guest-link',
  imports: [FormsModule],
  templateUrl: './guest-link.component.html',
  styleUrl: './guest-link.component.scss'
})
export class GuestLinkComponent implements OnInit {

  name: string = "";
  newLink: string = "";
  newPin: string = "";
  showSnackbar = false;
  showPin = false;
  showLink = false;
  
  @ViewChild('inputLink') inputLink!: ElementRef;
  @ViewChild('inputPin') inputPin!: ElementRef;

  constructor(private http: HttpClient, private authService: AuthService, private router: Router) {
  }
  
  ngOnInit(): void {
    this.checkUserRole();
  }

  generateLink() {
    this.authService.generateLink(this.name).subscribe({
      next: (response) => {
        console.log(response.link);
        this.newLink = response.link;
        this.newPin = response.pin;
      },
      error: (error) => {
        console.error(error);
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
