import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface OrderIntakeDraftItem {
  id: number;
  article_number: string;
  name: string;
  quantity: number;
  price: number;
  sale_price?: number;
  confidence?: number;
  description?: string;
  image_url?: string | null;
}

export interface OrderIntakeDraft {
  items: OrderIntakeDraftItem[];
  unmatched: Array<{ rawText: string; reason?: string }>;
  totalPrice: number;
  originalText?: string;
}

export interface QuickReply {
  label: string;
  value: string;
}

export interface ProductOption {
  article_number: string;
  name: string;
  price: number;
  image_url?: string | null;
}

export interface OrderIntakeResponse {
  sessionId: string;
  phase: string;
  replyText?: string | null;
  orderId?: number | null;
  draft?: OrderIntakeDraft | null;
  candidates?: Array<{
    customer_number: string;
    last_name_company?: string;
    first_name?: string;
    city?: string;
  }> | null;
  customerNumber?: string | null;
  quickReplies?: QuickReply[] | null;
  productOptions?: ProductOption[] | null;
  resumed?: boolean;
  sessionClosesAt?: string | null;
  postOrderTtlMinutes?: number | null;
}

export interface CustomerArticle {
  id: number;
  article_number: string;
  name: string;
  category?: string;
  unit_price_net?: number | null;
  sale_price?: number;
  price: number;
  image_url?: string | null;
}

@Injectable({ providedIn: 'root' })
export class OrderChatService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/order-intake`;

  createSession(sessionId?: string, reset = false): Observable<OrderIntakeResponse & { resumed?: boolean }> {
    return this.http.post<OrderIntakeResponse & { resumed?: boolean }>(`${this.base}/session`, {
      sessionId,
      channel: 'webchat',
      reset,
    });
  }

  sendMessage(sessionId: string, text: string): Observable<OrderIntakeResponse> {
    return this.http.post<OrderIntakeResponse>(`${this.base}/message`, {
      sessionId,
      text,
      channel: 'webchat',
    });
  }

  getCustomerArticles(sessionId: string, q = '', limit = 50): Observable<{
    customerNumber: string;
    items: CustomerArticle[];
    total: number;
  }> {
    let params = new HttpParams().set('sessionId', sessionId).set('limit', String(limit));
    if (q) params = params.set('q', q);
    return this.http.get<{ customerNumber: string; items: CustomerArticle[]; total: number }>(
      `${this.base}/customer-articles`,
      { params }
    );
  }

  addDraftItem(sessionId: string, articleNumber: string, quantity: number): Observable<OrderIntakeResponse> {
    return this.http.post<OrderIntakeResponse>(`${this.base}/draft-item`, {
      sessionId,
      articleNumber,
      quantity,
      channel: 'webchat',
    });
  }

  getMessages(sessionId: string): Observable<{
    sessionId: string;
    messages: Array<{ id: number; direction: string; body: string; orderId?: number; createdAt?: string }>;
  }> {
    const params = new HttpParams().set('sessionId', sessionId);
    return this.http.get<{
      sessionId: string;
      messages: Array<{ id: number; direction: string; body: string; orderId?: number; createdAt?: string }>;
    }>(`${this.base}/messages`, { params });
  }
}
