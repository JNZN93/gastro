import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ArtikelDataService {

  private http = inject(HttpClient);
  private jsonUrl = '/artikel.json';

  constructor() { }

  getData(): Observable<any> {
    return this.http.get<any>(this.jsonUrl);
  }
}
