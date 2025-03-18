import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../authentication.service';


@Component({
  selector: 'app-registration',
  imports: [ReactiveFormsModule, CommonModule, RouterModule],
  templateUrl: './registration.component.html',
  styleUrl: './registration.component.scss'

})
export class RegistrationComponent {
  registerForm: FormGroup;
  isSubmitted = false;
  errorMessage: string | null = null;

  constructor(private fb: FormBuilder, private router: Router, private authService: AuthService ) {
    this.registerForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      company: ['', [Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
    }, {validators: this.passwordMatchValidator });
  }

  passwordMatchValidator(form: FormGroup) {
    return form.get('password')?.value === form.get('confirmPassword')?.value
      ? null
      : { mismatch: true };
  }

  onSubmit() {

    this.isSubmitted = true;
    if (this.registerForm.valid) {
      console.log(this.registerForm.value);
      this.authService.register(this.registerForm.value).subscribe({
        next: (response) => {
          alert('Bitte öffnen Sie Ihr Postfach und klicken Sie auf den Verifizierungslink, um Ihre E-Mail-Adresse zu bestätigen.');
          this.router.navigate(['/login']);
        },
        error: (error) => {
          console.error('Registrierung fehlgeschlagen', error);
          this.errorMessage = 'Registrierung fehlgeschlagen. Bitte versuche es erneut.';
        }
      });
    } else {
      this.errorMessage = 'Bitte alle Felder korrekt ausfüllen!';
    }
  }
}
