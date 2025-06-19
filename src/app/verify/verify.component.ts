import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../authentication.service';

@Component({
  selector: 'app-verify',
  imports: [FormsModule],
  templateUrl: './verify.component.html',
  styleUrl: './verify.component.scss'
})
export class VerifyComponent implements OnInit {

  pin = "";
  url = window.location.search;

  constructor(private http: HttpClient, private authService: AuthService, private router: Router) { }

  ngOnInit(): void {
    this.authService.checkToken(localStorage.getItem('token')).subscribe({
      next: (response) => {
        console.log(response);
        this.router.navigate(['/products']);
      },
      error: (error) => {
        console.error(error);
      },
    })
  }

  verify() {
    const params = new URLSearchParams(this.url);
    const token = params.get("token");
    console.log(this.pin);


    this.authService.verifyPin(this.pin, token).subscribe({
      next: (response) => {
        console.log(response);
        localStorage.setItem('token', response.token);
        if (response?.role === "employee") {
          this.router.navigate(['/employees']);
        } else if (response?.role === "user") {
          this.router.navigate(['/products']);
        } else {
          // optional: Fallback
          console.warn('Unbekannte Rolle:', response?.role);
        }
      },
      error: (error) => {
        console.error(error);
        alert('PIN ungültig!');
      },
    });
  }


}
