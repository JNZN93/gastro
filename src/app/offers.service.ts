import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

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
  offer_price?: string | number;
  use_offer_price: boolean;
  min_quantity?: number;
  max_quantity?: number;
  created_at?: string;
  updated_at?: string;
  
  // Zusätzliche Felder von der API
  offer_product_id?: number;
  product_database_id?: number;
  article_text?: string;
  article_number?: string;
  article_notes?: string;
  article_type?: string;
  category?: string;
  cost_price?: number;
  custom_field_1?: string;
  db_index?: number;
  ean?: string;
  gross_price?: number;
  is_active?: boolean;
  main_image_url?: string;
  sale_price?: number;
  sale_price_2?: number;
  sale_price_3?: number;
  sale_price_quantity_2?: number;
  sale_price_quantity_3?: number;
  tax_code?: number;
  unit?: string;
  offer_company?: string;
}

export interface OfferWithProducts extends Offer {
  products: OfferProduct[];
  isProductsExpanded?: boolean;
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
  private apiUrl = `${environment.apiUrl}/api/offers`;

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

  // Produkte suchen
  searchProducts(searchTerm: string): Observable<any> {
    const url = `${environment.apiUrl}/api/products`;
    console.log('Suche nach Produkten mit Term:', searchTerm);
    console.log('API URL:', url);

    // Verwende den api/products Endpunkt für alle verfügbaren Produkte
    // Der Endpunkt gibt direkt ein Array von Produkten zurück
    return this.http.get(url, {
      headers: this.getAuthHeaders()
    });
  }
}
