import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../authentication.service';
import { MatDialog } from '@angular/material/dialog';
import { MyDialogComponent } from '../my-dialog/my-dialog.component';


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
  passwordVisible: boolean = false;
  confirmPasswordVisible: boolean = false;
  passwordImgOn = 'visibility_on.png';
  passwordImgOff = 'visibility_off.png';
  currentImage = this.passwordImgOff;
  currentImageConfirm = this.passwordImgOff;

  constructor(private fb: FormBuilder, private router: Router, private authService: AuthService, private dialog: MatDialog ) {
    this.registerForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      company: [''],
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
          this.showEmailCheckDialog();
          this.router.navigate(['/login']);
        },
        error: () => {
          this.showErrorDialog();
        }
      });
    } else {
      this.errorMessage = 'Bitte alle Felder korrekt ausfüllen!';
    }
  }

    togglePassword() {
    this.currentImage = this.currentImage === this.passwordImgOff ? this.passwordImgOn : this.passwordImgOff;
    this.passwordVisible = !this.passwordVisible;
  }

  toggleConfirmPassword() {
    this.currentImageConfirm = this.currentImageConfirm === this.passwordImgOff ? this.passwordImgOn : this.passwordImgOff;
    this.confirmPasswordVisible = !this.confirmPasswordVisible;
  }

  showEmailCheckDialog(): void {
    this.dialog.open(MyDialogComponent, {
      data: {
        title: 'Konto bestätigen',
        message: 'Wir haben dir eine E-Mail mit einem Bestätigungslink geschickt. Bitte prüfe dein Postfach, um dein Konto zu verifizieren.',
        buttonLabel: 'Verstanden'
      },
      maxWidth: '400px',
      minWidth: '300px',
    });
  }

  showErrorDialog() {
    this.dialog.open(MyDialogComponent, {
      data: {
        title: 'Fehler!',
        message: 'Registrierung fehlgeschlagen. Bitte versuche es erneut.',
        buttonLabel: 'Verstanden'
      },
      maxWidth: '400px',
      minWidth: '300px',
    });
  }
}
