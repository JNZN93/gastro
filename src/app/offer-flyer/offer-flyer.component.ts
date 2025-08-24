import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { OffersService, OfferWithProducts } from '../offers.service';

@Component({
  selector: 'app-offer-flyer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './offer-flyer.component.html',
  styleUrls: ['./offer-flyer.component.scss']
})
export class OfferFlyerComponent implements OnInit {
  offer: OfferWithProducts | null = null;
  loading = true;
  error: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private offersService: OffersService
  ) {}

  ngOnInit(): void {
    // 1) Versuche Daten aus Router State zu verwenden
    const nav = this.router.getCurrentNavigation();
    const stateOffer = nav?.extras?.state && (nav.extras.state as any).offer;
    if (stateOffer) {
      console.log('✅ Flyer: Angebot aus Router-State empfangen:', {
        id: stateOffer?.id,
        name: stateOffer?.name,
        products: stateOffer?.products?.length
      });
      this.offer = this.sortProductsInOffer(stateOffer);
      this.loading = false;
      return;
    }

    // 2) Hole ID aus der URL und lade das Angebot per API (all-with-products)
    const idParam = this.route.snapshot.paramMap.get('id');
    const offerId = idParam ? Number(idParam) : NaN;
    if (!offerId || Number.isNaN(offerId)) {
      console.warn('⚠️ Flyer: Ungültige Angebots-ID in Route:', idParam);
      this.error = 'Ungültige Angebots-ID.';
      this.loading = false;
      return;
    }
    console.log('ℹ️ Flyer: Lade Angebot via all-with-products. ID =', offerId);
    this.loadFromAllWithProducts(offerId);
  }

  private loadFromAllWithProducts(offerId: number): void {
    this.offersService.getAllOffersWithProducts().subscribe({
      next: (resp) => {
        console.log('📦 Flyer: all-with-products Response Rohdaten:', resp);
        const list: OfferWithProducts[] = Array.isArray((resp as any)?.data)
          ? ((resp as any).data as OfferWithProducts[])
          : [];
        const found = list.find((o: OfferWithProducts) => o.id === offerId) || null;
        console.log('🔎 Flyer: Ergebnis all-with-products:', { total: list.length, found: !!found });
        if (found) {
          this.offer = this.sortProductsInOffer(found);
          this.loading = false;
        } else {
          this.error = 'Angebot nicht gefunden.';
          this.loading = false;
        }
      },
      error: (e) => {
        console.error('❌ Flyer: Fehler beim Fallback all-with-products:', e);
        this.error = 'Angebot konnte nicht geladen werden.';
        this.loading = false;
      }
    });
  }

  private sortProductsInOffer(offer: OfferWithProducts): OfferWithProducts {
    const products = Array.isArray(offer?.products) ? [...offer.products] : [];
    products.sort((a, b) => {
      const at = (a.article_text || '').toLowerCase();
      const bt = (b.article_text || '').toLowerCase();
      return at.localeCompare(bt);
    });
    return { ...offer, products };
  }

  onImageError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.src = '/assets/placeholder-product.svg';
    }
  }
}


