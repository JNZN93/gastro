import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class OrderService {

  apiUrlOrder = `${environment.apiUrl}/api/orders`;
  apiUrlAllOrders = `${environment.apiUrl}/api/orders/all-orders-pending`;

  constructor(private http: HttpClient) { }

  placeOrder(orderData: any, token: string | null): Observable<any> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    return this.http.post(this.apiUrlOrder, orderData, { headers });
  }

  getAllOrders(token: string | null): Observable<any>  {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    return this.http.get<any>(this.apiUrlAllOrders, { headers });
  }

  updateStatus(orderId: any, status: any, token: string | null): Observable<any> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    return this.http.put(this.apiUrlOrder + '/' + orderId, {status}, { headers });
  }

  updateOrderStatusOnly(orderId: any, status: string, token: string | null): Observable<any> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    return this.http.put(this.apiUrlOrder + '/' + orderId + '/status', {status}, { headers });
  }

  deleteOrder(orderId: number, token: string | null): Observable<any> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    return this.http.delete(this.apiUrlOrder + '/' + orderId, { headers });
  }

  deleteAllOrders(token: string | null): Observable<any> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    return this.http.delete(this.apiUrlOrder + '/all', { headers });
  }

  checkOrderProcessingStatus(orderId: number, token: string | null): Observable<any> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    return this.http.get(this.apiUrlOrder + '/' + orderId + '/processing-status', { headers });
  }
}
