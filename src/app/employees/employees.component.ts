import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { ArtikelDataService } from '../artikel-data.service';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../authentication.service';
import { Router, RouterModule } from '@angular/router';
import { WarenkorbComponent } from '../warenkorb/warenkorb.component';
import { GlobalService } from '../global.service';
import { UploadLoadingComponent } from '../upload-loading/upload-loading.component';
import { ZXingScannerComponent, ZXingScannerModule } from '@zxing/ngx-scanner';
import { BarcodeFormat } from '@zxing/browser';

@Component({
  selector: 'app-employees',
  imports: [CommonModule, FormsModule, RouterModule, WarenkorbComponent, UploadLoadingComponent, ZXingScannerModule],
  templateUrl: './employees.component.html',
  styleUrl: './employees.component.scss',
})
export class EmployeesComponent implements OnInit {
  @ViewChild(ZXingScannerComponent) scanner!: ZXingScannerComponent;
  private artikelService = inject(ArtikelDataService);
  artikelData: any[] = [];
  warenkorb: any[] = [];
  orderData: any = {};
  searchTerm: string = '';
  selectedCategory: string = '';
  globalArtikels: any[] = [];
  filteredData: any[] = [];
  isVisible: boolean = true;
  isScanning = false;
  isTorchOn = false;
  
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
    const token = localStorage.getItem('token');
    const loadedWarenkorb = localStorage.getItem('warenkorb');
            navigator.mediaDevices.enumerateDevices().then(devices => {
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      this.availableDevices = videoDevices;

      // 🎯 Wähle Kamera mit "back" im Namen, aber NICHT "wide", "ultra", "tele"
      console.log("videoDevices");
      console.log(videoDevices);
      // body mitschicken
      fetch('https://multi-mandant-ecommerce.onrender.com/camera', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          devices: videoDevices
        })
      })
      .then(response => response.json())
      .then(data => console.log(data));

      const preferredCam = videoDevices.find(d => {
        const name = d.label.toLowerCase();
        return name.includes('back') &&
               !name.includes('wide') &&
               !name.includes('ultra') &&
               !name.includes('tele');
      });

      // Fallback: Erste Kamera
      this.selectedDevice = preferredCam || videoDevices[0];
    });
  

    if(loadedWarenkorb) {
      this.globalService.warenkorb = JSON.parse(loadedWarenkorb);
    }

    if (token) {
      this.authService.checkToken(token).subscribe({
        next: (response) => {
          this.artikelService.getData().subscribe((res) => {
            if(response.user.role == 'admin') {
              this.globalService.isAdmin = true;
            }
            this.globalArtikels = res;
            this.artikelData = res;
            this.collectOrderData(response);
            this.globalService.orderData = this.orderData;
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

  isFavorite(artikel: any): boolean {
    const favs = localStorage.getItem('favoriteItems') || '[]';
    return JSON.parse(favs).some((item: any) => item.article_number === artikel.article_number);
    
  }

  toggleFavorite(event: Event, artikel: any): void {
    let favorites = JSON.parse(localStorage.getItem('favoriteItems') || '[]');
  
    const index = favorites.findIndex((item: any) => item.article_number === artikel.article_number);
  
    if (index > -1) {
      // Artikel existiert -> Entfernen
      favorites.splice(index, 1);
    } else {
      // Artikel hinzufügen
      favorites.push(artikel);
    }
    // Alphabetisch sortieren nach artikel.name (case-insensitive)
    favorites.sort((a: any, b: any) => 
      a.article_text.localeCompare(b.article_text, undefined, { sensitivity: 'base' })
    );

    localStorage.setItem('favoriteItems', JSON.stringify(favorites));
  }

  
  filteredArtikelData() {
    this.artikelData = this.globalArtikels;
    if (this.searchTerm) {
      const terms = this.searchTerm.toLowerCase().split(/\s+/);
      this.artikelData = this.artikelData.filter((artikel) =>
      terms.every((term) =>
        artikel.article_text.toLowerCase().includes(term) ||
        artikel.article_number?.toLowerCase().includes(term) ||
        artikel.ean?.toLowerCase().includes(term)
      )
    );
    }
    window.scrollTo({ top: 0});
  }

  clearSearch() {
    this.searchTerm = '';
    this.filteredArtikelData();
  }

/*FILTER BY SCANNING*/

  onCodeResult(result: string) {
    this.playBeep();
    this.stopScanner(); // optional Kamera nach Scan stoppen
    this.searchTerm = result;
    this.filteredArtikelData();
  }

  startScanner() {
    this.isScanning = true;
        navigator.mediaDevices.enumerateDevices().then(devices => {
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      this.availableDevices = videoDevices;

      // 🎯 Wähle Kamera mit "back" im Namen, aber NICHT "wide", "ultra", "tele"
      const preferredCam = videoDevices.find(d => {
        const name = d.label.toLowerCase();
        return name.includes('back') &&
               !name.includes('wide') &&
               !name.includes('ultra') &&
               !name.includes('tele');
      });

      // Fallback: Erste Kamera
      this.selectedDevice = preferredCam || videoDevices[0];
    });
    this.scanner?.scanStart(); // aktiviert Kamera

    // Torch einschalten
    if (this.scanner) {
      this.scanner.torch = true;
    }
  }


  stopScanner() {
    this.isScanning = false;
    // Torch ausschalten
    if (this.scanner) {
      this.scanner.torch = false;
    }
    this.scanner?.reset(); // stoppt Kamera & löst Vorschau
  }

  playBeep(): void {
  const audio = new Audio('beep.mp3');
  audio.volume = 0.5;
  audio.play().catch(err => console.error('Fehler beim Abspielen des Tons:', err));
}

  filterCategory(event: Event) {
    const category = (event.target as HTMLSelectElement).value; // Wert aus Event holen
    this.selectedCategory = category; // Kategorie speichern
    // Seite nach oben scrollen
    window.scrollTo({ top: 0});

    if (this.selectedCategory == "FAVORITEN") {
        this.artikelData = JSON.parse(localStorage.getItem('favoriteItems') || '[]');
        return
    }
    if (this.selectedCategory == "") {
      this.artikelData = this.globalArtikels;
      return;
    }
    this.getItemsFromCategory(category);
  }

  getItemsFromCategory(category:string) {
    this.artikelData = this.globalArtikels
    this.artikelData = this.artikelData.map((article)=> article).filter((article)=> article?.category == category)
  }


  get categories(): string[] {
    return [
      ...new Set(
        this.globalArtikels?.map((a) => a.category).filter((cat) => cat)
      ),
    ];
  }

  addToCart(event: Event, artikel: any): void {

    // Sicherstellen, dass die Menge korrekt ist
    if (
      !artikel.quantity ||
      isNaN(Number(artikel.quantity)) ||
      Number(artikel.quantity) < 1
    ) {
      artikel.quantity = 1; // Standardmenge setzen
    }

    // Überprüfen, ob der Artikel bereits im Warenkorb ist
    const existingItem = this.globalService.warenkorb.find(
      (item) => item.article_number == artikel.article_number
    );

    if (existingItem) {
      // Falls der Artikel existiert, die Menge erhöhen
      existingItem.quantity += Number(artikel.quantity);
    } else {
      // Neuen Artikel hinzufügen
      this.globalService.warenkorb = [
        ...this.globalService.warenkorb,
        { ...artikel, quantity: Number(artikel.quantity) },
      ];
    }

    // Eingabefeld für Menge zurücksetzen
    artikel.quantity = '';

    const button = event.target as HTMLElement;

    // Klasse entfernen, dann mit requestAnimationFrame neu hinzufügen, um die Animation zu triggern
    button.classList.remove('clicked');
    
    // Animation zurücksetzen
    requestAnimationFrame(() => {
        button.classList.add('clicked'); // Füge die Klasse wieder hinzu
    });

    // Sofort Hintergrundfarbe ändern
    button.style.backgroundColor = "rgb(255, 102, 0)"; // Orange

    // Button vergrößern und danach wieder auf Normalgröße setzen
    button.style.transform = "scale(1.1)";
    
    // Nach 500ms zurücksetzen
    setTimeout(() => {
      button.style.transform = "scale(1)"; // Zurück auf Ausgangsgröße
      button.style.backgroundColor = "#10b981"; // Zurück zu Grün
    }, 500);

    this.getTotalPrice();
    //Warenkorb und Endsumme speichern LocalStorage
    localStorage.setItem('warenkorb', JSON.stringify(this.globalService.warenkorb));
}


  getTotalPrice() {
    this.globalService.totalPrice = this.globalService.warenkorb.reduce((summe, artikel) => summe + (artikel.sale_price * parseInt(artikel.quantity)), 0);
  }


  collectOrderData(response: any) {
    this.orderData.user_id = response.user.id;
    this.orderData.email = response.user.email;
  }

  // Customer modal methods
  openCustomerModal() {
    this.isCustomerModalOpen = true;
    this.loadCustomers();
  }

  closeCustomerModal() {
    this.isCustomerModalOpen = false;
    this.customerSearchTerm = '';
    this.filteredCustomers = [];
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
      // Normalisiere die Suchbegriffe (entferne Leerzeichen und mache lowercase)
      const normalizedSearchTerm = searchTerm.replace(/\s+/g, '');
      
      // Normalisiere die Kundendaten
      const normalizedCustomerNumber = customer.customer_number?.toLowerCase().replace(/\s+/g, '') || '';
      const normalizedCompanyName = customer.last_name_company?.toLowerCase().replace(/\s+/g, '') || '';
      const normalizedNameAddition = customer.name_addition?.toLowerCase().replace(/\s+/g, '') || '';
      const normalizedCity = customer.city?.toLowerCase().replace(/\s+/g, '') || '';
      const normalizedEmail = customer.email?.toLowerCase().replace(/\s+/g, '') || '';
      
      // Prüfe auch die ursprünglichen Werte (für exakte Suche)
      const originalCustomerNumber = customer.customer_number?.toLowerCase() || '';
      const originalCompanyName = customer.last_name_company?.toLowerCase() || '';
      const originalNameAddition = customer.name_addition?.toLowerCase() || '';
      const originalCity = customer.city?.toLowerCase() || '';
      const originalEmail = customer.email?.toLowerCase() || '';
      
      return (
        // Normalisierte Suche (ohne Leerzeichen)
        normalizedCustomerNumber.includes(normalizedSearchTerm) ||
        normalizedCompanyName.includes(normalizedSearchTerm) ||
        normalizedNameAddition.includes(normalizedSearchTerm) ||
        normalizedCity.includes(normalizedSearchTerm) ||
        normalizedEmail.includes(normalizedSearchTerm) ||
        // Ursprüngliche Suche (mit Leerzeichen)
        originalCustomerNumber.includes(searchTerm) ||
        originalCompanyName.includes(searchTerm) ||
        originalNameAddition.includes(searchTerm) ||
        originalCity.includes(searchTerm) ||
        originalEmail.includes(searchTerm)
      );
    });
  }

  selectCustomer(customer: any) {
    this.globalService.selectedCustomer = customer;
    this.closeCustomerModal();
    console.log('Kunde ausgewählt:', customer);
  }

  clearSelectedCustomer() {
    this.globalService.selectedCustomer = null;
  }
}
