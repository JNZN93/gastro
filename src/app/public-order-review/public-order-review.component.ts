import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-public-order-review',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="review-page">
      <div class="topbar">
        <button class="back" (click)="goBack()">← Zurück</button>
        <div class="heading">
          <h1>Bestellübersicht</h1>
          <div class="customer" *ngIf="customer?.last_name_company">für {{ customer.last_name_company }}</div>
        </div>
      </div>

      <div class="content">
        <ng-container *ngIf="items && items.length; else empty">
          <div class="items">
            <div class="item-card" *ngFor="let item of items">
              <div class="media">
                <img *ngIf="item.main_image_url" [src]="item.main_image_url" [alt]="item.article_text" />
                <div *ngIf="!item.main_image_url" class="placeholder">📦</div>
              </div>
              <div class="info">
                <div class="name">{{ item.article_text }}</div>
                <div class="meta">Art.-Nr.: {{ item.article_number || item.product_id }}</div>
              </div>
              <div class="numbers">
                <div class="qty">{{ item.quantity }}x</div>
              </div>
            </div>
          </div>
        </ng-container>
        <ng-template #empty>
          <div class="empty">Keine Artikel ausgewählt.</div>
        </ng-template>
      </div>

      <div class="bottombar" *ngIf="items && items.length">
        <button class="submit" (click)="submitOrder()" [disabled]="isSubmitting">
          <span *ngIf="!isSubmitting">Bestellung absenden</span>
          <span *ngIf="isSubmitting">Sende...</span>
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .review-page { min-height: 100vh; background: #f8f9fb; }
    .topbar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: linear-gradient(180deg, #ffffff 0%, #fafafa 100%); border-bottom: 1px solid #eee; }
    .back { appearance: none; border: 1px solid #ddd; background: #fff; padding: 8px 12px; border-radius: 10px; cursor: pointer; font-weight: 500; }
    .heading h1 { margin: 0; font-size: 20px; }
    .customer { color: #6b7280; font-size: 12px; margin-top: 2px; }
    .content { max-width: 1000px; margin: 0 auto; padding: 16px; height: calc(100vh - 120px); overflow-y: auto; }
    .items { display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px; }
    .item-card { display: grid; grid-template-columns: 72px 1fr auto; gap: 12px; align-items: center; background: #fff; border: 1px solid #eee; border-radius: 14px; padding: 10px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.04); }
    .media { width: 72px; height: 72px; border-radius: 10px; background: #f2f2f2; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .media img { width: 100%; height: 100%; object-fit: cover; }
    .placeholder { font-size: 28px; }
    .info { min-width: 0; }
    .name { font-weight: 600; color: #111827; word-break: break-word; }
    .meta { color: #6b7280; font-size: 12px; margin-top: 2px; }
    .numbers { display: flex; align-items: center; gap: 8px; }
    .qty { color: #111827; font-weight: 600; background: #f3f4f6; padding: 4px 8px; border-radius: 6px; }
    .empty { max-width: 1000px; margin: 40px auto; text-align: center; color: #6b7280; }
    .bottombar { max-width: 1000px; margin: 0 auto; padding: 16px; background: #fff; border: 1px solid #eee; border-radius: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.04); }
    .submit { width: 100%; appearance: none; border: none; background: #ff7a00; color: #fff; padding: 14px 20px; border-radius: 12px; font-weight: 700; cursor: pointer; box-shadow: 0 6px 16px rgba(255,122,0,0.35); font-size: 16px; }
    .submit[disabled] { opacity: 0.6; cursor: not-allowed; box-shadow: none; }
    @media (min-width: 768px) {
      .item-card { grid-template-columns: 88px 1fr auto; padding: 14px 16px; }
      .media { width: 88px; height: 88px; }
      .heading h1 { font-size: 22px; }
    }
  `]
})
export class PublicOrderReviewComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  token = '';
  items: any[] = [];
  total = 0;
  isSubmitting = false;
  customer: any = null;

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.token = params['token'];
    });

    // Daten aus history.state übernehmen
    const state = history.state || {};
    this.items = state.items || [];
    this.total = state.total || 0;
    this.customer = state.customer || null;

    // Automatisch nach oben scrollen, damit die Artikelliste sichtbar ist
    setTimeout(() => {
      const contentElement = document.querySelector('.content');
      if (contentElement) {
        contentElement.scrollTop = 0;
      }
    }, 100);
  }

  goBack() {
    this.router.navigate([`/customer-order/${this.token}`]);
  }

  submitOrder() {
    // In dieser öffentlichen Version triggert die Review-Seite die Absendelogik nicht selbst,
    // sondern navigiert zurück und sendet ein Event. Alternativ: Direkt POSTen.
    // Für Einfachheit navigieren wir zurück und setzen einen Flag über state.
    this.isSubmitting = true;
    this.router.navigate([`/customer-order/${this.token}`], { state: { submitNow: true } });
  }
}


