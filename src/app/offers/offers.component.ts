import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
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
    private fb: FormBuilder
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
      next: (response) => console.log('✅ /api/offers/ funktioniert:', response),
      error: (error) => console.log('❌ /api/offers/ fehlgeschlagen:', error)
    });

    // Teste aktive Angebote
    this.offersService.getActiveOffers().subscribe({
      next: (response) => console.log('✅ /api/offers/active funktioniert:', response),
      error: (error) => console.log('❌ /api/offers/active fehlgeschlagen:', error)
    });
  }

  loadOffers(): void {
    this.loading = true;
    // Verwende den korrekten Endpunkt aus der README
    this.offersService.getAllOffersWithProducts().subscribe({
      next: (response) => {
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
      error: (error) => {
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
      const formValue = this.createOfferForm.value;
      
      // Validierung: Entweder discount_percentage oder discount_amount muss gesetzt sein
      if (!formValue.discount_percentage && !formValue.discount_amount) {
        alert('Bitte geben Sie entweder einen Prozentsatz oder einen festen Rabattbetrag an.');
        return;
      }

      const offerData: CreateOfferRequest = {
        name: formValue.name,
        description: formValue.description,
        discount_percentage: formValue.discount_percentage,
        discount_amount: formValue.discount_amount,
        offer_type: formValue.offer_type,
        start_date: formValue.start_date,
        end_date: formValue.end_date,
        is_active: formValue.is_active
      };

      this.offersService.createOffer(offerData).subscribe({
        next: (newOffer) => {
          console.log('Angebot erfolgreich erstellt:', newOffer);
          this.loadOffers();
          this.showCreateForm = false;
          this.createOfferForm.reset();
        },
        error: (error) => {
          console.error('Fehler beim Erstellen des Angebots:', error);
          alert('Fehler beim Erstellen des Angebots');
        }
      });
    }
  }

  onSubmitAddProduct(): void {
    if (this.addProductForm.valid && this.selectedOffer) {
      const formValue = this.addProductForm.value;
      
      const productData: AddProductRequest = {
        offerId: this.selectedOffer.id!,
        productId: parseInt(formValue.productId),
        offerPrice: formValue.offerPrice,
        useOfferPrice: formValue.useOfferPrice,
        minQuantity: formValue.minQuantity,
        maxQuantity: formValue.maxQuantity
      };

      this.offersService.addProductToOffer(productData).subscribe({
        next: (response) => {
          console.log('Produkt erfolgreich hinzugefügt:', response);
          this.loadOffers();
          this.showAddProductForm = false;
          this.addProductForm.reset();
          this.selectedOffer = null;
        },
        error: (error) => {
          console.error('Fehler beim Hinzufügen des Produkts:', error);
          alert('Fehler beim Hinzufügen des Produkts');
        }
      });
    }
  }

  removeProductFromOffer(offerId: number, productId: number): void {
    if (confirm('Möchten Sie dieses Produkt wirklich aus dem Angebot entfernen?')) {
      this.offersService.removeProductFromOffer(offerId, productId).subscribe({
        next: (response) => {
          console.log('Produkt erfolgreich entfernt:', response);
          this.loadOffers();
        },
        error: (error) => {
          console.error('Fehler beim Entfernen des Produkts:', error);
          alert('Fehler beim Entfernen des Produkts');
        }
      });
    }
  }

  deleteOffer(offerId: number): void {
    if (confirm('Möchten Sie dieses Angebot wirklich löschen?')) {
      this.offersService.deleteOffer(offerId).subscribe({
        next: (response) => {
          console.log('Angebot erfolgreich gelöscht:', response);
          this.loadOffers();
        },
        error: (error) => {
          console.error('Fehler beim Löschen des Angebots:', error);
          alert('Fehler beim Löschen des Angebots');
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
