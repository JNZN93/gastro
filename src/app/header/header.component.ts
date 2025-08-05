import { Component } from '@angular/core';
import { ToggleCartService } from '../toggle-cart.service';
import { Router, RouterModule } from '@angular/router';
import { GlobalService } from '../global.service';
import { FormsModule, FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../authentication.service';
import { MatDialog } from '@angular/material/dialog';
import { MyDialogComponent } from '../my-dialog/my-dialog.component';
import { CommonModule } from '@angular/common';
import { WarenkorbComponent } from '../warenkorb/warenkorb.component';

@Component({
  selector: 'app-header',
  imports: [RouterModule, FormsModule, ReactiveFormsModule, CommonModule, WarenkorbComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent {
  showModal = false;
  showLoginModal = false;
  showSideModal = false;
  isLoginMode = true;
  errorMessage: string | null = null;
  
  // Form properties
  loginForm: FormGroup;
  registerForm: FormGroup;
  passwordVisible: boolean = false;
  confirmPasswordVisible: boolean = false;
  passwordImgOn = 'visibility_on.png';
  passwordImgOff = 'visibility_off.png';
  currentImage = this.passwordImgOff;
  currentImageConfirm = this.passwordImgOff;
  isSubmitted = false;
  
  private hiddenRoutes: string[] = ['/login', '/registration', '/verify', '/impress', '/privacy'];

  constructor(
    private toggleService: ToggleCartService, 
    private router: Router, 
    public globalService: GlobalService,
    private fb: FormBuilder,
    private authService: AuthService,
    private dialog: MatDialog
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });

    this.registerForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      company: [''],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
    }, {validators: this.passwordMatchValidator });

    // Event Listener für Login-Modal von anderen Komponenten
    window.addEventListener('openLoginModal', () => {
      this.openLoginModal();
    });
  }

  passwordMatchValidator(form: FormGroup) {
    return form.get('password')?.value === form.get('confirmPassword')?.value
      ? null
      : { mismatch: true };
  }

  // Login Modal Methods
  openLoginModal() {
    this.showLoginModal = true;
    document.body.style.overflowY = 'hidden';
  }

  closeLoginModal() {
    this.showLoginModal = false;
    this.isLoginMode = true;
    this.errorMessage = null;
    this.loginForm.reset();
    this.registerForm.reset();
    document.body.style.overflowY = 'auto';
  }

  toggleMode() {
    this.isLoginMode = !this.isLoginMode;
    this.errorMessage = null;
    this.loginForm.reset();
    this.registerForm.reset();
  }

  handleLogin() {
    if (this.loginForm.valid) {
      this.authService.login(this.loginForm.value).subscribe({
        next: (response) => {
          localStorage.setItem("token", response.token);
          console.log('Login erfolgreich:', response);
          
          // Benutzerrolle und Name im GlobalService setzen
          this.globalService.setUserRole(response.role);
          this.globalService.setUserName(response.name || response.email || 'Benutzer');
          this.globalService.setUserLoggedIn(true);
          
          // selectedCustomer bei Login löschen
          this.globalService.clearSelectedCustomer();
          
          // Modal schließen und Seite neu laden
          this.closeLoginModal();
          window.location.reload();
        },
        error: (error) => {
          console.error('Login fehlgeschlagen:', error);
          this.errorMessage = 'Ungültige E-Mail oder Passwort';
        }
      });
    }
  }

  handleRegistration() {
    this.isSubmitted = true;
    if (this.registerForm.valid) {
      this.authService.register(this.registerForm.value).subscribe({
        next: (response) => {
          this.showEmailCheckDialog();
          this.toggleMode(); // Zurück zum Login-Modus
        },
        error: () => {
          this.showErrorDialog();
        }
      });
    } else {
      this.errorMessage = 'Bitte alle Felder korrekt ausfüllen!';
    }
  }

  forgotPassword() {
    if (this.loginForm.get('email')?.valid) {
      this.authService.forgotPassword(this.loginForm.value).subscribe({
        next: (response) => {
          alert(response.message)
        },
        error: (error) => {
          alert('Bitte "NUR" E-Mail Adresse eingeben und auf "Passwort vergessen" Klicken!')
        }
      });
    } else {
      alert('Bitte geben Sie zuerst eine gültige E-Mail-Adresse ein!')
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

  // Existing methods
  toggleWarenkorb() {
    this.toggleService.toggle(); // Toggle-Funktion aufrufen
  }

  openModal() {
    this.showModal = true;
  }

  logOut() {
    localStorage.removeItem('token');
    localStorage.removeItem('warenkorb');
    this.globalService.clearSelectedCustomer();
    this.globalService.setUserLoggedIn(false);
    this.globalService.setUserRole('');
    this.showModal = false;
    this.router.navigate(['/products']);
  }

  goBack() {
    this.showModal = false;
  }

  shouldHideElement(): boolean {
    return this.hiddenRoutes.includes(this.router.url);
  }

  shouldHideElementAdmin(): boolean {
    return this.router.url === '/admin';
  }

  navigateToAdmin() {
    this.globalService.clearSelectedCustomer();
    this.router.navigate(['/admin']);
  }

  // Side Modal Methods
  toggleSideModal() {
    this.showSideModal = !this.showSideModal;
    if (this.showSideModal) {
      document.body.style.overflowY = 'hidden';
    } else {
      document.body.style.overflowY = 'auto';
    }
  }

  closeSideModal() {
    this.showSideModal = false;
    document.body.style.overflowY = 'auto';
  }

  navigateToHome() {
    this.router.navigate(['/products']);
  }
}
