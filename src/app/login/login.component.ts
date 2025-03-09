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
      if (this.loginForm.value.email == 'admin@admin.de' && this.loginForm.value.password == 'admin1') {
        // Wenn Admin, Weiterleitung auf Admin-Seite
        console.log('hello');
        
        this.router.navigate(['/admin'])
        return
      }
      console.log(this.loginForm.value);
      this.authService.login(this.loginForm.value).subscribe({
        next: (response) => {
          localStorage.setItem("token", response.token);
          console.log('Login erfolgreich:', response.token);
          this.router.navigate(['/products']); // Erfolgreich weiterleiten
        },
        error: (error) => {
          console.error('Login fehlgeschlagen:', error);
          this.errorMessage = 'Ungültige E-Mail oder Passwort';
        }
      });
    }
  }
}
