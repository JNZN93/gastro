import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = `${environment.apiUrl}/api/auth/register`;
  private apiUrlLogIn = `${environment.apiUrl}/api/auth/login`;
  private apiUrlCheckToken = `${environment.apiUrl}/api/auth/validate`;
  private apiUrlGenerate = `${environment.apiUrl}/api/auth/generate-link`;
  private apiUrlVerifyPin = `${environment.apiUrl}/api/auth/validate-pin`;
  private apiUrlForgotPassword = `${environment.apiUrl}/api/auth/forgot-password`;

  constructor(private http: HttpClient) {}

  register(userData: any): Observable<any> {
    return this.http.post(this.apiUrl, userData);
  }
  
  login(credentials: { email: string; password: string }): Observable<any> {
    return this.http.post(this.apiUrlLogIn, credentials);
  }

  checkToken(token: any): Observable<any> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    return this.http.get(this.apiUrlCheckToken, { headers });
  }

  generateLink(customerName : string, role : string): Observable<any> {
    return this.http.post(this.apiUrlGenerate, { customerName, role })

  }

  verifyPin(pin: any, token: any): Observable<any> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
    return this.http.post(this.apiUrlVerifyPin, {pin} , { headers });
  }

  forgotPassword(credentials: { email: string; password: string }): Observable<any> {
    return this.http.post(this.apiUrlForgotPassword, credentials )

  }

}
