import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { OffersService, Offer, OfferWithProducts, CreateOfferRequest, AddProductRequest } from '../offers.service';

@Component({
  selector: 'app-offers',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './offers.component.html',
  styleUrls: ['./offers.component.scss']
})
export class OffersComponent implements OnInit {
  offers: OfferWithProducts[] = [];
  loading = false;
  showCreateForm = false;
  showAddProductForm = false;
  selectedOffer: OfferWithProducts | null = null;
  
  createOfferForm: FormGroup;
  addProductForm: FormGroup;

  constructor(
    private offersService: OffersService,
    private fb: FormBuilder,
    private router: Router
  ) {
    this.createOfferForm = this.fb.group({
      name: ['', Validators.required],
      description: ['', Validators.required],
      discount_percentage: [null],
      discount_amount: [null],
      offer_type: ['fixed_amount', Validators.required],
      start_date: ['', Validators.required],
      end_date: ['', Validators.required],
      is_active: [true]
    });

    this.addProductForm = this.fb.group({
      productId: ['', Validators.required],
      offerPrice: [null],
      useOfferPrice: [false],
      minQuantity: [null],
      maxQuantity: [null]
    });
  }

  ngOnInit(): void {
    // Debug: Teste verschiedene Endpunkte
    this.testApiEndpoints();
    this.loadOffers();
  }

  private testApiEndpoints(): void {
    console.log('Teste API-Endpunkte...');
    
    // Teste einfachen Endpunkt
    this.offersService.getAllOffers().subscribe({
      next: (response: Offer[]) => console.log('✅ /api/offers/ funktioniert:', response),
      error: (error: any) => console.log('❌ /api/offers/ fehlgeschlagen:', error)
    });

    // Teste aktive Angebote
    this.offersService.getActiveOffers().subscribe({
      next: (response: Offer[]) => console.log('✅ /api/offers/active funktioniert:', response),
      error: (error: any) => console.log('❌ /api/offers/active fehlgeschlagen:', error)
    });
  }

  loadOffers(): void {
    this.loading = true;
    // Verwende den korrekten Endpunkt aus der README
    this.offersService.getAllOffersWithProducts().subscribe({
      next: (response: any) => {
        console.log('API Response:', response);
        
        // Laut README: { success: true, data: [...], total: number }
        if (response && response.success && response.data && Array.isArray(response.data)) {
          this.offers = response.data;
          console.log(`✅ ${response.total} Angebote geladen`);
        } else {
          console.warn('Unerwartetes Response-Format:', response);
          this.offers = [];
        }
        
        this.loading = false;
      },
      error: (error: any) => {
        console.error('Fehler beim Laden der Angebote:', error);
        this.loading = false;
        // Zeige Fehlermeldung an
        alert('Fehler beim Laden der Angebote. Bitte überprüfen Sie die API-Verbindung.');
      }
    });
  }



  toggleCreateForm(): void {
    this.showCreateForm = !this.showCreateForm;
    if (this.showCreateForm) {
      this.createOfferForm.reset({
        offer_type: 'fixed_amount',
        is_active: true
      });
    }
  }

  goBackToAdmin(): void {
    this.router.navigate(['/admin']);
  }

  toggleAddProductForm(offer: OfferWithProducts): void {
    this.selectedOffer = offer;
    this.showAddProductForm = !this.showAddProductForm;
    if (this.showAddProductForm) {
      this.addProductForm.reset({
        useOfferPrice: false
      });
    }
  }

  onSubmitCreateOffer(): void {
    if (this.createOfferForm.valid) {
      const formData = this.createOfferForm.value;
      const createOfferRequest: CreateOfferRequest = {
        name: formData.name,
        description: formData.description,
        offer_type: formData.offer_type,
        start_date: formData.start_date,
        end_date: formData.end_date,
        is_active: formData.is_active
      };

      if (formData.offer_type === 'percentage' && formData.discount_percentage) {
        createOfferRequest.discount_percentage = formData.discount_percentage;
      } else if (formData.offer_type === 'fixed_amount' && formData.discount_amount) {
        createOfferRequest.discount_amount = formData.discount_amount;
      }

      this.offersService.createOffer(createOfferRequest).subscribe({
        next: (newOffer: any) => {
          console.log('Angebot erfolgreich erstellt:', newOffer);
          this.createOfferForm.reset({
            offer_type: 'fixed_amount',
            is_active: true
          });
          this.showCreateForm = false;
          this.loadOffers();
        },
        error: (error: any) => {
          console.error('Fehler beim Erstellen des Angebots:', error);
          alert('Fehler beim Erstellen des Angebots. Bitte versuchen Sie es erneut.');
        }
      });
    }
  }

  onSubmitAddProduct(): void {
    if (this.addProductForm.valid && this.selectedOffer) {
      const formData = this.addProductForm.value;
      const addProductRequest: AddProductRequest = {
        offerId: this.selectedOffer.id!,
        productId: formData.productId,
        offerPrice: formData.offerPrice || undefined,
        useOfferPrice: formData.useOfferPrice,
        minQuantity: formData.minQuantity || undefined,
        maxQuantity: formData.maxQuantity || undefined
      };

      this.offersService.addProductToOffer(addProductRequest).subscribe({
        next: (response: any) => {
          console.log('Produkt erfolgreich zum Angebot hinzugefügt:', response);
          this.addProductForm.reset();
          this.showAddProductForm = false;
          this.selectedOffer = null;
          this.loadOffers();
        },
        error: (error: any) => {
          console.error('Fehler beim Hinzufügen des Produkts:', error);
          alert('Fehler beim Hinzufügen des Produkts. Bitte versuchen Sie es erneut.');
        }
      });
    }
  }

  removeProductFromOffer(offerId: number, productId: number): void {
    this.offersService.removeProductFromOffer(offerId, productId).subscribe({
      next: (response: any) => {
        console.log('Produkt erfolgreich aus Angebot entfernt:', response);
        this.loadOffers();
      },
      error: (error: any) => {
        console.error('Fehler beim Entfernen des Produkts:', error);
        alert('Fehler beim Entfernen des Produkts. Bitte versuchen Sie es erneut.');
      }
    });
  }

  deleteOffer(offerId: number): void {
    if (confirm('Sind Sie sicher, dass Sie dieses Angebot löschen möchten?')) {
      this.offersService.deleteOffer(offerId).subscribe({
        next: (response: any) => {
          console.log('Angebot erfolgreich gelöscht:', response);
          this.loadOffers();
        },
        error: (error: any) => {
          console.error('Fehler beim Löschen des Angebots:', error);
          alert('Fehler beim Löschen des Angebots. Bitte versuchen Sie es erneut.');
        }
      });
    }
  }

  getOfferTypeLabel(type: string): string {
    switch (type) {
      case 'percentage': return 'Prozentual';
      case 'fixed_amount': return 'Fester Betrag';
      case 'buy_x_get_y': return 'Kauf X bekomme Y';
      default: return type;
    }
  }

  getDiscountDisplay(offer: Offer): string {
    if (offer.discount_percentage) {
      return `${offer.discount_percentage}%`;
    } else if (offer.discount_amount) {
      return `€${offer.discount_amount.toFixed(2)}`;
    }
    return '-';
  }

  isOfferActive(offer: Offer): boolean {
    const now = new Date();
    const startDate = new Date(offer.start_date);
    const endDate = new Date(offer.end_date);
    return offer.is_active && now >= startDate && now <= endDate;
  }

  getStatusClass(offer: Offer): string {
    if (!offer.is_active) return 'inactive';
    if (this.isOfferActive(offer)) return 'active';
    return 'expired';
  }
}
