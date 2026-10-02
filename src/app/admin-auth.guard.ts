import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from './authentication.service';
import { Observable, map, catchError, of } from 'rxjs';
import { readStoredRole, storeRole } from './pwa/session-role';

@Injectable({
  providedIn: 'root'
})
export class AdminAuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(): Observable<boolean> {
    const token = localStorage.getItem('token');
    
    if (!token) {
      this.router.navigate(['/login']);
      return of(false);
    }

    return this.authService.checkToken(token).pipe(
      map((response) => {
        const userRole = response?.user?.role;
        
        // Erlaube Zugriff nur für admin
        if (userRole === 'admin') {
          storeRole(userRole);
          return true;
        } else {
          this.router.navigate(['/login']);
          return false;
        }
      }),
      catchError((error) => {
        if (!error?.status && readStoredRole() === 'admin') {
          return of(true);
        }
        console.error('Admin Auth Guard Error:', error);
        this.router.navigate(['/login']);
        return of(false);
      })
    );
  }
} 