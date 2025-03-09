import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'https://multi-mandant-ecommerce.onrender.com/api/auth/register'; // Backend-URL anpassen!
  private apiUrlLogIn = 'https://multi-mandant-ecommerce.onrender.com/api/auth/login'
  private apiUrlCheckToken = 'https://multi-mandant-ecommerce.onrender.com/api/auth/validate'; // URL für Token-Validierung

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
}
