import { Component, inject } from '@angular/core';
import { FormsModule, FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../authentication.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {


  loginForm: FormGroup;
  errorMessage: string | null = null;

  constructor(private fb: FormBuilder, private router: Router, private authService: AuthService ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  onSubmit() {
    if (this.loginForm.valid) {
      console.log(this.loginForm.value);
      this.authService.login(this.loginForm.value).subscribe({
        next: (response) => {
          localStorage.setItem("token", response.token);
          console.log('Login erfolgreich:', response);
          if (response?.role == 'admin') {
            this.router.navigate(['/admin']);
            return
          }

          if (response)
          this.router.navigate(['/products']); // Erfolgreich weiterleiten
        },
        error: (error) => {
          console.error('Login fehlgeschlagen:', error);
          this.errorMessage = 'Ungültige E-Mail oder Passwort';
        }
      });
    }
  }

  forgotPassword() {
    this.authService.forgotPassword(this.loginForm.value).subscribe({
      next: (response) => {
        alert(response.message)
      },
      error: (error) => {
        alert('Es ist ein Fehler aufgetreten!')
      }
    });
  }
  }
