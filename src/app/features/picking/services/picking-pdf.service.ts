import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { forkJoin, lastValueFrom, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { ArtikelDataService } from '../../../artikel-data.service';
import {
  KommissionierungPdfItem,
  KommissionierungPdfOrder,
  KommissionierungPdfService,
} from '../../../services/kommissionierung-pdf.service';
import { PickItemState, PickingOrder } from '../models/picking.models';

@Injectable({ providedIn: 'root' })
export class PickingPdfService {
  private customerNameByNumber: Record<string, string> = {};
  private customersByNumber: Record<string, any> = {};
  private allArtikels: any[] = [];
  private dataLoaded = false;
  private dataLoading: Promise<void> | null = null;

  private readonly kommissionierungPdf = inject(KommissionierungPdfService);
  private readonly http = inject(HttpClient);
  private readonly artikelData = inject(ArtikelDataService);

  generateKommissionierungsschein(
    order: PickingOrder,
    items: PickItemState[],
    options: { customerLabel: string; includePalettenschein?: boolean } = { customerLabel: '' }
  ): void {
    void this.ensureData().then(() => {
      const pdfOrder = this.buildPdfOrder(order, items);
      this.kommissionierungPdf.generate(pdfOrder, !!options.includePalettenschein, {
        customerNameByNumber: this.customerNameByNumber,
        customersByNumber: this.customersByNumber,
        allArtikels: this.allArtikels,
      });
    });
  }

  private async ensureData(): Promise<void> {
    if (this.dataLoaded) {
      return;
    }
    if (this.dataLoading) {
      return this.dataLoading;
    }
    this.dataLoading = this.loadData();
    await this.dataLoading;
  }

  private async loadData(): Promise<void> {
    const token = localStorage.getItem('token');
    const headers = token
      ? new HttpHeaders({
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        })
      : undefined;

    try {
      const { customers, artikels } = await lastValueFrom(
        forkJoin({
          customers: headers
            ? this.http
                .get<any[]>(`${environment.apiUrl}/api/customers`, { headers })
                .pipe(catchError(() => of([])))
            : of([]),
          artikels: this.artikelData.getData().pipe(catchError(() => of([]))),
        })
      );

      const nameMap: Record<string, string> = {};
      const customersMap: Record<string, any> = {};
      for (const customer of customers || []) {
        const numberStr = String(customer?.customer_number ?? '').trim();
        const nameStr = String(customer?.last_name_company ?? customer?.name ?? '').trim();
        if (numberStr && nameStr) {
          nameMap[numberStr] = nameStr;
          customersMap[numberStr] = customer;
        }
      }

      this.customerNameByNumber = nameMap;
      this.customersByNumber = customersMap;
      this.allArtikels = artikels || [];
      this.dataLoaded = true;
    } finally {
      this.dataLoading = null;
    }
  }

  private buildPdfOrder(order: PickingOrder, items: PickItemState[]): KommissionierungPdfOrder {
    const orderItemByProductId = new Map(
      (order.items || []).map((item) => [item.product_id, item])
    );

    const pdfItems: KommissionierungPdfItem[] = items
      .filter((item) => item.status !== 'unavailable')
      .map((item) => {
        const articleNumber = item.replacementArticleNumber || item.articleNumber;
        const productName = item.replacementArticleName || item.productName;
        const catalogArtikel = this.allArtikels.find((a) => a.article_number === articleNumber);
        const orderItem = orderItemByProductId.get(item.productId);

        const price =
          orderItem?.price != null
            ? String(orderItem.price)
            : item.price != null
              ? String(item.price)
              : '0';

        const differentPrice =
          orderItem?.different_price != null
            ? String(orderItem.different_price)
            : item.differentPrice != null
              ? String(item.differentPrice)
              : null;

        return {
          product_id: item.productId,
          quantity: item.pickedQuantity > 0 ? item.pickedQuantity : item.targetQuantity,
          price,
          different_price: differentPrice,
          product_name: productName,
          product_article_number: articleNumber,
          tax_code: catalogArtikel?.tax_code,
        };
      });

    return {
      order_id: order.order_id,
      customer_number: order.customer_number,
      company: order.company,
      name: order.name,
      total_price: order.total_price,
      fulfillment_type: order.fulfillment_type,
      order_date: order.order_date,
      created_at: order.created_at,
      shipping_address: order.shipping_address,
      customer_notes: order.customer_notes,
      delivery_date: order.delivery_date,
      items: pdfItems,
    };
  }
}
