import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class OrderService {

  apiUrlOrder = 'https://multi-mandant-ecommerce.onrender.com/api/orders';
  apiUrlAllOrders = 'https://multi-mandant-ecommerce.onrender.com/api/orders/all-orders'

  constructor(private http: HttpClient) { }

  placeOrder(orderData: any, token: string | null): Observable<any> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    return this.http.post(this.apiUrlOrder, orderData, { headers });
  }

  getAllOrders(): Observable<any>  {

      return this.http.get<any>(this.apiUrlAllOrders);
  }
}
