import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface User {
  id: number;
  email: string;
  name: string;
  company: string;
  role: 'admin' | 'employee' | 'user';
  customer_number: string;
  resetPasswordToken?: string | null;
  resetPasswordExpires?: string | null;
  password?: string;
  created_at: string;
  updated_at: string;
}

export interface UserFormData {
  name: string;
  email: string;
  company: string;
  customer_number: string;
  role: 'admin' | 'employee' | 'user';
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private apiUrl = 'https://multi-mandant-ecommerce.onrender.com/api';

  constructor(private http: HttpClient) { }

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
  }

  // Alle User abrufen
  getAllUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/users`, {
      headers: this.getHeaders()
    });
  }

  // Einzelnen User abrufen
  getUserById(userId: number): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/users/${userId}`, {
      headers: this.getHeaders()
    });
  }

  // Neuen User erstellen
  createUser(userData: UserFormData): Observable<User> {
    return this.http.post<User>(`${this.apiUrl}/users`, userData, {
      headers: this.getHeaders()
    });
  }

  // User aktualisieren
  updateUser(userId: number, userData: Partial<UserFormData>): Observable<User> {
    return this.http.put<User>(`${this.apiUrl}/users/${userId}`, userData, {
      headers: this.getHeaders()
    });
  }

  // User löschen
  deleteUser(userId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/users/${userId}`, {
      headers: this.getHeaders()
    });
  }



  // User nach Rolle filtern
  getUsersByRole(role: string): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/users?role=${role}`, {
      headers: this.getHeaders()
    });
  }

  // User nach Suchbegriff suchen
  searchUsers(query: string): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/users?search=${encodeURIComponent(query)}`, {
      headers: this.getHeaders()
    });
  }

  // Passwort zurücksetzen
  resetPassword(email: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/auth/forgot-password`, {
      email: email
    }, {
      headers: this.getHeaders()
    });
  }

  // User-Statistiken abrufen
  getUserStats(): Observable<{
    total: number;
    admins: number;
    users: number;
    active: number;
  }> {
    return this.http.get<{
      total: number;
      admins: number;
      users: number;
      active: number;
    }>(`${this.apiUrl}/users/stats`, {
      headers: this.getHeaders()
    });
  }
} 