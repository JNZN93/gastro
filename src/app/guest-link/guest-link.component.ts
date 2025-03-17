import { Component, OnInit } from '@angular/core';
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
}
