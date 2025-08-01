import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from './authentication.service';
import { Observable, map, catchError, of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
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
        
        // Erlaube Zugriff nur für admin und employee
        if (userRole === 'admin' || userRole === 'employee') {
          return true;
        } else {
          this.router.navigate(['/login']);
          return false;
        }
      }),
      catchError((error) => {
        console.error('Auth Guard Error:', error);
        this.router.navigate(['/login']);
        return of(false);
      })
    );
  }
} 