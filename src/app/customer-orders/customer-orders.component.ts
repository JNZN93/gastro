import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { ArtikelDataService } from '../artikel-data.service';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../authentication.service';
import { Router, RouterModule } from '@angular/router';
import { GlobalService } from '../global.service';
import { UploadLoadingComponent } from '../upload-loading/upload-loading.component';
import { ZXingScannerComponent, ZXingScannerModule } from '@zxing/ngx-scanner';
import { BarcodeFormat } from '@zxing/browser';

@Component({
  selector: 'app-customer-orders',
  imports: [CommonModule, FormsModule, RouterModule, UploadLoadingComponent, ZXingScannerModule],
  templateUrl: './customer-orders.component.html',
  styleUrl: './customer-orders.component.scss',
})
export class CustomerOrdersComponent implements OnInit {
  @ViewChild(ZXingScannerComponent) scanner!: ZXingScannerComponent;
  private artikelService = inject(ArtikelDataService);
  artikelData: any[] = [];
  orderItems: any[] = [];
  searchTerm: string = '';
  globalArtikels: any[] = [];
  filteredArtikels: any[] = [];
  customerArticlePrices: any[] = []; // Neue Property für Kunden-Artikel-Preise
  isVisible: boolean = true;
  isScanning = false;
  
  // Customer modal properties
  isCustomerModalOpen: boolean = false;
  customers: any[] = [];
  filteredCustomers: any[] = [];
  customerSearchTerm: string = '';
  isLoadingCustomers: boolean = false;
  availableDevices: MediaDeviceInfo[] = [];
  selectedDevice?: MediaDeviceInfo;
  formatsEnabled: BarcodeFormat[] = [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.ITF
  ];

  videoConstraints: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    facingMode: { ideal: "environment" }
  };

  constructor(
    private router: Router,
    private authService: AuthService,
    public globalService: GlobalService
  ) {}

  ngOnInit(): void {
    this.loadCustomers();
    const token = localStorage.getItem('token');
    
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      this.availableDevices = videoDevices;

      const preferredCam = videoDevices.find(d => {
        const name = d.label.toLowerCase();
        return name.includes('back') &&
               !name.includes('wide') &&
               !name.includes('ultra') &&
               !name.includes('tele');
      });

      this.selectedDevice = preferredCam || videoDevices[0];
    });

    if (token) {
      this.authService.checkToken(token).subscribe({
        next: (response) => {
          this.artikelService.getData().subscribe((res) => {
            if(response.user.role == 'admin') {
              this.globalService.isAdmin = true;
            }
            this.globalArtikels = res;
            this.artikelData = res;
            this.isVisible = false;
          });
        },
        error: (error) => {
          this.isVisible = false;
          console.error('Token ungültig oder Fehler:', error);
          this.router.navigate(['/login']);
        },
      });
    } else {
      this.isVisible = false;
      console.log('Kein Token gefunden.');
      this.router.navigate(['/login']);
    }
  }

  filteredArtikelData() {
    this.filteredArtikels = [];
    if (this.searchTerm) {
      const terms = this.searchTerm.toLowerCase().split(/\s+/);
      this.filteredArtikels = this.globalArtikels.filter((artikel) =>
        terms.every((term) =>
          artikel.article_text.toLowerCase().includes(term) ||
          artikel.article_number?.toLowerCase().includes(term) ||
          artikel.ean?.toLowerCase().includes(term)
        )
      );
    }
  }

  clearSearch() {
    this.searchTerm = '';
    this.filteredArtikels = [];
  }

  onCodeResult(result: string) {
    this.playBeep();
    this.stopScanner();
    this.searchTerm = result;
    this.filteredArtikelData();
  }

  startScanner() {
    this.isScanning = true;
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      this.availableDevices = videoDevices;

      const preferredCam = videoDevices.find(d => {
        const name = d.label.toLowerCase();
        return name.includes('back') &&
               !name.includes('wide') &&
               !name.includes('ultra') &&
               !name.includes('tele');
      });

      this.selectedDevice = preferredCam || videoDevices[0];
    });
    this.scanner?.scanStart();

    if (this.scanner) {
      this.scanner.torch = true;
    }
  }

  stopScanner() {
    this.isScanning = false;
    if (this.scanner) {
      this.scanner.torch = false;
    }
    this.scanner?.reset();
  }

  playBeep(): void {
    const audio = new Audio('beep.mp3');
    audio.volume = 0.5;
    audio.play().catch(err => console.error('Fehler beim Abspielen des Tons:', err));
  }

  addToOrder(event: Event, artikel: any): void {
    if (!this.globalService.selectedCustomer) {
      alert('Bitte wählen Sie zuerst einen Kunden aus.');
      return;
    }

    if (
      !artikel.quantity ||
      isNaN(Number(artikel.quantity)) ||
      Number(artikel.quantity) < 1
    ) {
      artikel.quantity = 1;
    }

    const existingItem = this.orderItems.find(
      (item) => item.article_number == artikel.article_number
    );

    if (existingItem) {
      existingItem.quantity += Number(artikel.quantity);
    } else {
      this.orderItems = [
        ...this.orderItems,
        { ...artikel, quantity: Number(artikel.quantity) },
      ];
    }

    artikel.quantity = '';

    const button = event.target as HTMLElement;
    button.classList.remove('clicked');
    
    requestAnimationFrame(() => {
        button.classList.add('clicked');
    });

    button.style.backgroundColor = "rgb(255, 102, 0)";
    button.style.transform = "scale(1.1)";
    
    setTimeout(() => {
      button.style.transform = "scale(1)";
      button.style.backgroundColor = "#10b981";
    }, 500);

    this.clearSearch();
  }

  removeFromOrder(index: number): void {
    this.orderItems.splice(index, 1);
  }

  getOrderTotal(): number {
    return this.orderItems.reduce((sum, item) => sum + (item.sale_price * item.quantity), 0);
  }

  saveOrder(): void {
    if (!this.globalService.selectedCustomer) {
      alert('Bitte wählen Sie zuerst einen Kunden aus.');
      return;
    }

    if (this.orderItems.length === 0) {
      alert('Bitte fügen Sie Artikel zum Auftrag hinzu.');
      return;
    }

    const orderData = {
      customer_id: this.globalService.selectedCustomer.id,
      customer_number: this.globalService.selectedCustomer.customer_number,
      customer_name: this.globalService.selectedCustomer.last_name_company,
      items: this.orderItems,
      total: this.getOrderTotal(),
      created_at: new Date().toISOString(),
      status: 'pending'
    };

    const token = localStorage.getItem('token');
    
    fetch('https://multi-mandant-ecommerce.onrender.com/api/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderData)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Fehler beim Speichern des Auftrags');
      }
      return response.json();
    })
    .then(data => {
      alert('Auftrag erfolgreich gespeichert!');
      this.clearOrder();
    })
    .catch(error => {
      console.error('Fehler beim Speichern des Auftrags:', error);
      alert('Fehler beim Speichern des Auftrags: ' + error.message);
    });
  }

  clearOrder(): void {
    this.orderItems = [];
  }

  // Customer modal methods
  openCustomerModal() {
    this.isCustomerModalOpen = true;
    this.filteredCustomers = this.customers;
    this.customerSearchTerm = '';
  }

  closeCustomerModal() {
    this.isCustomerModalOpen = false;
    this.customerSearchTerm = '';
  }

  loadCustomers() {
    this.isLoadingCustomers = true;
    const token = localStorage.getItem('token');
    
    fetch('https://multi-mandant-ecommerce.onrender.com/api/customers', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Fehler beim Laden der Kunden');
      }
      return response.json();
    })
    .then(data => {
      this.customers = data;
      this.filteredCustomers = data;
      this.isLoadingCustomers = false;
    })
    .catch(error => {
      console.error('Fehler beim Laden der Kunden:', error);
      this.isLoadingCustomers = false;
    });
  }

  filterCustomers() {
    if (!this.customerSearchTerm.trim()) {
      this.filteredCustomers = this.customers;
      return;
    }

    const searchTerm = this.customerSearchTerm.toLowerCase();
    this.filteredCustomers = this.customers.filter(customer => {
      const normalizedSearchTerm = searchTerm.replace(/\s+/g, '');
      
      const normalizedCustomerNumber = customer.customer_number?.toLowerCase().replace(/\s+/g, '') || '';
      const normalizedCompanyName = customer.last_name_company?.toLowerCase().replace(/\s+/g, '') || '';
      const normalizedNameAddition = customer.name_addition?.toLowerCase().replace(/\s+/g, '') || '';
      const normalizedCity = customer.city?.toLowerCase().replace(/\s+/g, '') || '';
      const normalizedEmail = customer.email?.toLowerCase().replace(/\s+/g, '') || '';
      
      const originalCustomerNumber = customer.customer_number?.toLowerCase() || '';
      const originalCompanyName = customer.last_name_company?.toLowerCase() || '';
      const originalNameAddition = customer.name_addition?.toLowerCase() || '';
      const originalCity = customer.city?.toLowerCase() || '';
      const originalEmail = customer.email?.toLowerCase() || '';
      
      return (
        normalizedCustomerNumber.includes(normalizedSearchTerm) ||
        normalizedCompanyName.includes(normalizedSearchTerm) ||
        normalizedNameAddition.includes(normalizedSearchTerm) ||
        normalizedCity.includes(normalizedSearchTerm) ||
        normalizedEmail.includes(normalizedSearchTerm) ||
        originalCustomerNumber.includes(searchTerm) ||
        originalCompanyName.includes(searchTerm) ||
        originalNameAddition.includes(searchTerm) ||
        originalCity.includes(searchTerm) ||
        originalEmail.includes(searchTerm)
      );
    });
  }

  selectCustomer(customer: any) {
    console.log('👤 [SELECT-CUSTOMER] Kunde ausgewählt:', customer);
    console.log('👤 [SELECT-CUSTOMER] Kundenummer:', customer.customer_number);
    console.log('👤 [SELECT-CUSTOMER] Kundenname:', customer.last_name_company);
    
    this.globalService.setSelectedCustomer(customer);
    console.log('💾 [SELECT-CUSTOMER] Kunde im GlobalService gespeichert');
    
    this.closeCustomerModal();
    console.log('🔒 [SELECT-CUSTOMER] Customer Modal geschlossen');
    
    // Lade Kunden-Artikel-Preise für den ausgewählten Kunden
    console.log('🔄 [SELECT-CUSTOMER] Starte loadCustomerArticlePrices für Kunde:', customer.customer_number);
    this.loadCustomerArticlePrices(customer.customer_number);
  }

  clearSelectedCustomer() {
    console.log('🗑️ [CLEAR-CUSTOMER] Kunde wird zurückgesetzt...');
    console.log('🗑️ [CLEAR-CUSTOMER] Aktuelle customerArticlePrices Länge:', this.customerArticlePrices.length);
    
    this.globalService.clearSelectedCustomer();
    console.log('💾 [CLEAR-CUSTOMER] Kunde im GlobalService zurückgesetzt');
    
    this.clearOrder();
    console.log('🗑️ [CLEAR-CUSTOMER] Auftrag zurückgesetzt');
    
    this.customerArticlePrices = []; // Lösche auch die Kunden-Artikel-Preise
    console.log('🗑️ [CLEAR-CUSTOMER] customerArticlePrices zurückgesetzt');
    
    console.log('✅ [CLEAR-CUSTOMER] Kunde erfolgreich zurückgesetzt');
  }

  // Neue Methode zum Laden der Kunden-Artikel-Preise
  loadCustomerArticlePrices(customerNumber: string) {
    console.log('🔄 [CUSTOMER-ARTICLE-PRICES] Starte API-Aufruf für Kunde:', customerNumber);
    
    const token = localStorage.getItem('token');
    const apiUrl = `https://multi-mandant-ecommerce.onrender.com/api/customer-article-prices/customer/${customerNumber}`;
    
    console.log('🔗 [CUSTOMER-ARTICLE-PRICES] API URL:', apiUrl);
    console.log('🔑 [CUSTOMER-ARTICLE-PRICES] Token vorhanden:', !!token);
    
    fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      console.log('📡 [CUSTOMER-ARTICLE-PRICES] Response Status:', response.status);
      console.log('📡 [CUSTOMER-ARTICLE-PRICES] Response OK:', response.ok);
      console.log('📡 [CUSTOMER-ARTICLE-PRICES] Response Headers:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        console.error('❌ [CUSTOMER-ARTICLE-PRICES] Response nicht OK:', response.status, response.statusText);
        throw new Error(`Fehler beim Laden der Kunden-Artikel-Preise: ${response.status} ${response.statusText}`);
      }
      
      console.log('✅ [CUSTOMER-ARTICLE-PRICES] Response erfolgreich, parse JSON...');
      return response.json();
    })
    .then(data => {
      console.log('📊 [CUSTOMER-ARTICLE-PRICES] Empfangene Daten:', data);
      console.log('📊 [CUSTOMER-ARTICLE-PRICES] Anzahl Artikel-Preise:', Array.isArray(data) ? data.length : 'Kein Array');
      
      if (Array.isArray(data)) {
        console.log('📊 [CUSTOMER-ARTICLE-PRICES] Erste 3 Artikel-Preise:', data.slice(0, 3));
        if (data.length > 0) {
          console.log('📊 [CUSTOMER-ARTICLE-PRICES] Beispiel Artikel-Preis:', data[0]);
        }
      }
      
      this.customerArticlePrices = data;
      console.log('💾 [CUSTOMER-ARTICLE-PRICES] Daten in customerArticlePrices gespeichert');
      
      // Aktualisiere die Artikel mit den kundenspezifischen Preisen
      console.log('🔄 [CUSTOMER-ARTICLE-PRICES] Starte updateArtikelsWithCustomerPrices...');
      this.updateArtikelsWithCustomerPrices();
    })
    .catch(error => {
      console.error('❌ [CUSTOMER-ARTICLE-PRICES] Fehler beim API-Aufruf:', error);
      console.error('❌ [CUSTOMER-ARTICLE-PRICES] Fehler Details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      this.customerArticlePrices = [];
      console.log('🔄 [CUSTOMER-ARTICLE-PRICES] customerArticlePrices zurückgesetzt');
    });
  }

  // Methode zum Aktualisieren der Artikel mit kundenspezifischen Preisen
  updateArtikelsWithCustomerPrices() {
    console.log('🔄 [UPDATE-PRICES] Starte updateArtikelsWithCustomerPrices...');
    console.log('📊 [UPDATE-PRICES] customerArticlePrices Länge:', this.customerArticlePrices.length);
    console.log('📊 [UPDATE-PRICES] globalArtikels Länge:', this.globalArtikels.length);
    
    if (this.customerArticlePrices.length > 0) {
      console.log('✅ [UPDATE-PRICES] Kundenspezifische Preise vorhanden, erstelle Map...');
      
      // Erstelle eine Map für schnellen Zugriff auf die Kunden-Preise
      const customerPriceMap = new Map();
      this.customerArticlePrices.forEach(customerPrice => {
        customerPriceMap.set(customerPrice.article_number, customerPrice);
      });
      
      console.log('🗺️ [UPDATE-PRICES] Customer Price Map erstellt, Größe:', customerPriceMap.size);
      console.log('🗺️ [UPDATE-PRICES] Map Keys (erste 5):', Array.from(customerPriceMap.keys()).slice(0, 5));

      // Zähle Artikel mit kundenspezifischen Preisen
      let updatedCount = 0;
      let unchangedCount = 0;

      // Aktualisiere die globalen Artikel mit den kundenspezifischen Preisen
      this.globalArtikels = this.globalArtikels.map(artikel => {
        const customerPrice = customerPriceMap.get(artikel.article_number);
        if (customerPrice) {
          const originalPrice = artikel.sale_price;
          const newPrice = customerPrice.price;
          
          console.log(`💰 [UPDATE-PRICES] Artikel ${artikel.article_number} (${artikel.article_text}): ${originalPrice}€ → ${newPrice}€`);
          
          updatedCount++;
          return {
            ...artikel,
            sale_price: newPrice, // Verwende den kundenspezifischen Preis
            original_price: originalPrice // Behalte den ursprünglichen Preis
          };
        } else {
          unchangedCount++;
          return artikel;
        }
      });

      console.log('📊 [UPDATE-PRICES] Aktualisierte Artikel:', updatedCount);
      console.log('📊 [UPDATE-PRICES] Unveränderte Artikel:', unchangedCount);
      console.log('📊 [UPDATE-PRICES] Gesamt Artikel:', this.globalArtikels.length);

      // Aktualisiere auch die artikelData
      this.artikelData = [...this.globalArtikels];
      console.log('💾 [UPDATE-PRICES] artikelData aktualisiert');
      
      console.log('✅ [UPDATE-PRICES] Artikel mit kundenspezifischen Preisen erfolgreich aktualisiert');
    } else {
      console.log('⚠️ [UPDATE-PRICES] Keine kundenspezifischen Preise vorhanden, überspringe Update');
    }
  }
}
