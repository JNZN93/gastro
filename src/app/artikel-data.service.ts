import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ArtikelDataService {

  private http = inject(HttpClient);
  private jsonUrl = `${environment.apiUrl}/api/products`;

  constructor() { }

  getData(): Observable<any> {
    return this.http.get<any>(this.jsonUrl);
  }
}
