import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../authentication.service';
import { UserService, User, UserFormData } from '../user.service';

@Component({
  selector: 'app-user-management',
  imports: [CommonModule, FormsModule],
  templateUrl: './user-management.component.html',
  styleUrl: './user-management.component.scss',
})
export class UserManagementComponent implements OnInit {
  users: User[] = [];
  searchTerm: string = '';
  roleFilter: string = '';
  showEditModal: boolean = false;
  editingUser: User | null = null;
  isSaving: boolean = false;
  
  // Message handling
  showMessage: boolean = false;
  messageType: 'success' | 'error' = 'success';
  messageTitle: string = '';
  messageText: string = '';

  // Modal states
  showResetPasswordModal: boolean = false;
  isResettingPassword: boolean = false;
  userToResetPassword: User | null = null;

  // Form data
  userFormData: UserFormData = {
    name: '',
    email: '',
    company: '',
    customer_number: '',
    role: 'user',
    password: ''
  };

  constructor(
    private router: Router,
    private userService: UserService,
    private authService: AuthService
  ) { }

  ngOnInit(): void {
    this.checkUserRole();
    this.loadUsers();
  }

  // Getter für gefilterte User
  get filteredUsers() {
    let filtered = this.users;

    // Filter nach Suchbegriff
    if (this.searchTerm) {
      filtered = filtered.filter(user => 
        user.name?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        user.company?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        user.externalCustomerId?.toLowerCase().includes(this.searchTerm.toLowerCase())
      );
    }

    // Filter nach Rolle
    if (this.roleFilter) {
      filtered = filtered.filter(user => user.role === this.roleFilter);
    }

    return filtered;
  }

  checkUserRole() {
    this.authService.checkToken(localStorage.getItem('token')).subscribe({
      next: (response) => {
        if (response?.user?.role !== 'admin') {
          this.router.navigate(['/login']);
        }
      },
      error: (error) => {
        console.error(error);
        this.router.navigate(['/login']);
      }
    });
  }

  loadUsers() {
    this.userService.getAllUsers().subscribe({
      next: (users: User[]) => {
        this.users = users;
      },
      error: (error: any) => {
        console.error('Fehler beim Laden der User:', error);
        this.showErrorMessage('Fehler', 'Fehler beim Laden der Benutzer. Bitte versuchen Sie es später erneut.');
      }
    });
  }

  // Statistik-Methoden
  getUsersByRole(role: string) {
    return this.users.filter(user => user.role === role);
  }

  getActiveUsers() {
    // User sind als "aktiv" betrachtet, wenn sie in den letzten 30 Tagen erstellt wurden
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    return this.users.filter(user => {
      const createdAt = new Date(user.created_at);
      return createdAt >= thirtyDaysAgo;
    });
  }

  getRoleDisplayName(role: string): string {
    switch (role) {
      case 'admin':
        return 'Administrator';
      case 'employee':
        return 'Mitarbeiter';
      case 'user':
        return 'Kunde';
      default:
        return role;
    }
  }

  // Modal-Methoden
  openAddUserModal() {
    this.editingUser = null;
    this.resetFormData();
    this.showEditModal = true;
  }

  openEditUserModal(user: User) {
    this.editingUser = user;
    this.userFormData = {
      name: user.name,
      email: user.email,
      company: user.company || '',
      customer_number: user.externalCustomerId || '',
      role: user.role
    };
    this.showEditModal = true;
  }

  closeEditModal() {
    this.showEditModal = false;
    this.editingUser = null;
    this.resetFormData();
  }

  resetFormData() {
    this.userFormData = {
      name: '',
      email: '',
      company: '',
      customer_number: '',
      role: 'user',
      password: ''
    };
  }

  // User speichern/aktualisieren
  saveUser() {
    if (!this.userFormData.name || !this.userFormData.email || !this.userFormData.role) {
      this.showErrorMessage('Validierungsfehler', 'Bitte füllen Sie alle Pflichtfelder aus.');
      return;
    }

    if (!this.editingUser && !this.userFormData.password) {
      this.showErrorMessage('Validierungsfehler', 'Passwort ist für neue Benutzer erforderlich.');
      return;
    }

    if (this.userFormData.password && this.userFormData.password.length < 6) {
      this.showErrorMessage('Validierungsfehler', 'Das Passwort muss mindestens 6 Zeichen lang sein.');
      return;
    }

    this.isSaving = true;

    const requestBody: UserFormData = {
      role: this.userFormData.role,
      email: this.userFormData.email,
      customer_number: this.userFormData.customer_number,
      company: this.userFormData.company,
      name: this.userFormData.name,
      password: this.userFormData.password
    };

    if (this.editingUser) {
      // User aktualisieren
      this.userService.updateUser(this.editingUser.id, requestBody).subscribe({
        next: () => {
          this.showSuccessMessage('Erfolg', 'Benutzer wurde erfolgreich aktualisiert.');
          this.loadUsers();
          this.closeEditModal();
        },
        error: (error: any) => {
          console.error('Fehler beim Aktualisieren des Users:', error);
          this.showErrorMessage('Fehler', 'Fehler beim Aktualisieren des Benutzers. Bitte versuchen Sie es später erneut.');
        },
        complete: () => {
          this.isSaving = false;
        }
      });
    } else {
      // Neuen User erstellen
      this.userService.createUser(requestBody).subscribe({
        next: () => {
          this.showSuccessMessage('Erfolg', 'Neuer Benutzer wurde erfolgreich erstellt.');
          this.loadUsers();
          this.closeEditModal();
        },
        error: (error: any) => {
          console.error('Fehler beim Erstellen des Users:', error);
          this.showErrorMessage('Fehler', 'Fehler beim Erstellen des Benutzers. Bitte versuchen Sie es später erneut.');
        },
        complete: () => {
          this.isSaving = false;
        }
      });
    }
  }

  // Message-Handling
  showSuccessMessage(title: string, text: string) {
    this.messageType = 'success';
    this.messageTitle = title;
    this.messageText = text;
    this.showMessage = true;
  }

  showErrorMessage(title: string, text: string) {
    this.messageType = 'error';
    this.messageTitle = title;
    this.messageText = text;
    this.showMessage = true;
  }

  closeMessage() {
    this.showMessage = false;
  }

  // Reset Password Methods
  openResetPasswordModal(user: User) {
    this.userToResetPassword = user;
    this.showResetPasswordModal = true;
  }

  closeResetPasswordModal() {
    this.showResetPasswordModal = false;
    this.userToResetPassword = null;
  }

  confirmResetPassword() {
    if (!this.userToResetPassword) {
      this.showErrorMessage('Fehler', 'Kein Benutzer ausgewählt.');
      return;
    }

    this.isResettingPassword = true;

    this.userService.resetPassword(this.userToResetPassword.email).subscribe({
      next: () => {
        this.showSuccessMessage('Erfolg', 'Passwort-Reset-E-Mail wurde erfolgreich an ' + this.userToResetPassword?.email + ' gesendet.');
        this.closeResetPasswordModal();
      },
      error: (error: any) => {
        console.error('Fehler beim Senden der Passwort-Reset-E-Mail:', error);
        this.showErrorMessage('Fehler', 'Fehler beim Senden der Passwort-Reset-E-Mail. Bitte versuchen Sie es später erneut.');
      },
      complete: () => {
        this.isResettingPassword = false;
      }
    });
  }


}
