import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class FavoritesService {
  private apiUrl = `${environment.apiUrl}/api`; // Anpassen an deine API-URL

  constructor(private http: HttpClient) { }

  // Favoriten abrufen
  getFavorites(): Observable<any[]> {
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
    
    return this.http.get<any[]>(`${this.apiUrl}/favorites`, { headers });
  }

  // Favorit hinzufügen
  addFavorite(productId: number): Observable<any> {
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
    
    return this.http.post(`${this.apiUrl}/favorites`, { productId }, { headers });
  }

  // Favorit entfernen
  removeFavorite(productId: number): Observable<any> {
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
    
    return this.http.delete(`${this.apiUrl}/favorites/${productId}`, { headers });
  }

  // Prüfen ob ein Produkt favorisiert ist
  isFavorite(productId: number): Observable<boolean> {
    return new Observable(observer => {
      this.getFavorites().subscribe({
        next: (favorites) => {
          const isFav = favorites.some((fav: any) => fav.product_id === productId);
          observer.next(isFav);
          observer.complete();
        },
        error: (error) => {
          console.error('Fehler beim Prüfen der Favoriten:', error);
          observer.next(false);
          observer.complete();
        }
      });
    });
  }
} 