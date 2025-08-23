import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Offer {
  id?: number;
  name: string;
  description: string;
  discount_percentage?: number;
  discount_amount?: number;
  offer_type: 'percentage' | 'fixed_amount' | 'buy_x_get_y';
  start_date: string;
  end_date: string;
  is_active: boolean;
  company?: string;
  created_at?: string;
  updated_at?: string;
}

export interface OfferProduct {
  id?: number;
  offer_id: number;
  product_id: number;
  company?: string;
  offer_price?: number;
  use_offer_price: boolean;
  min_quantity?: number;
  max_quantity?: number;
  created_at?: string;
  updated_at?: string;
}

export interface OfferWithProducts extends Offer {
  products: OfferProduct[];
}

export interface CreateOfferRequest {
  name: string;
  description: string;
  discount_percentage?: number;
  discount_amount?: number;
  offer_type?: 'percentage' | 'fixed_amount' | 'buy_x_get_y';
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export interface AddProductRequest {
  offerId: number;
  productId: number;
  offerPrice?: number;
  useOfferPrice?: boolean;
  minQuantity?: number;
  maxQuantity?: number;
}

export interface PriceCalculationRequest {
  productId: number;
  customerId: number;
  basePrice: number;
}

export interface PriceCalculationResponse {
  basePrice: number;
  finalPrice: number;
  appliedOffers: Array<{
    offerId: number;
    offerName: string;
    discountAmount: number;
    offerType: string;
  }>;
  totalDiscount: number;
}

@Injectable({
  providedIn: 'root'
})
export class OffersService {
  private apiUrl = 'https://multi-mandant-ecommerce.onrender.com/api/offers';

  constructor(private http: HttpClient) { }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    if (token) {
      return new HttpHeaders({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      });
    }
    return new HttpHeaders({
      'Content-Type': 'application/json'
    });
  }

  // Alle Angebote abrufen
  getAllOffers(): Observable<Offer[]> {
    return this.http.get<Offer[]>(this.apiUrl, { headers: this.getAuthHeaders() });
  }

  // Aktive Angebote abrufen
  getActiveOffers(): Observable<Offer[]> {
    return this.http.get<Offer[]>(`${this.apiUrl}/active`, { headers: this.getAuthHeaders() });
  }

  // Alle Angebote mit Produkten abrufen
  getAllOffersWithProducts(): Observable<{ success: boolean; data: OfferWithProducts[]; total: number }> {
    return this.http.get<{ success: boolean; data: OfferWithProducts[]; total: number }>(`${this.apiUrl}/all-with-products`, { headers: this.getAuthHeaders() });
  }

  // Einzelnes Angebot abrufen
  getOffer(id: number): Observable<Offer> {
    return this.http.get<Offer>(`${this.apiUrl}/${id}`, { headers: this.getAuthHeaders() });
  }

  // Angebot mit Produkten abrufen
  getOfferWithProducts(id: number): Observable<OfferWithProducts> {
    return this.http.get<OfferWithProducts>(`${this.apiUrl}/${id}/with-products`, { headers: this.getAuthHeaders() });
  }

  // Produkte eines Angebots abrufen
  getOfferProducts(offerId: number): Observable<OfferProduct[]> {
    return this.http.get<OfferProduct[]>(`${this.apiUrl}/${offerId}/products`, { headers: this.getAuthHeaders() });
  }

  // Angebote für ein Produkt abrufen
  getProductOffers(productId: number): Observable<Offer[]> {
    return this.http.get<Offer[]>(`${this.apiUrl}/product/${productId}`, { headers: this.getAuthHeaders() });
  }

  // Produkte mit aktuellen Angeboten abrufen
  getProductsWithOffers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/products/with-offers`, { headers: this.getAuthHeaders() });
  }

  // Neues Angebot erstellen
  createOffer(offerData: CreateOfferRequest): Observable<Offer> {
    return this.http.post<Offer>(`${this.apiUrl}/create`, offerData, { headers: this.getAuthHeaders() });
  }

  // Produkt zu Angebot hinzufügen
  addProductToOffer(productData: AddProductRequest): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/add-product`, productData, { headers: this.getAuthHeaders() });
  }

  // Produkt aus Angebot entfernen
  removeProductFromOffer(offerId: number, productId: number): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/remove-product`, { offerId, productId }, { headers: this.getAuthHeaders() });
  }

  // Endpreis mit Angeboten berechnen
  calculatePrice(priceData: PriceCalculationRequest): Observable<PriceCalculationResponse> {
    return this.http.post<PriceCalculationResponse>(`${this.apiUrl}/calculate-price`, priceData, { headers: this.getAuthHeaders() });
  }

  // Angebot aktualisieren
  updateOffer(id: number, offerData: Partial<Offer>): Observable<Offer> {
    return this.http.put<Offer>(`${this.apiUrl}/update/${id}`, offerData, { headers: this.getAuthHeaders() });
  }

  // Angebot löschen
  deleteOffer(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/delete/${id}`, { headers: this.getAuthHeaders() });
  }
}
