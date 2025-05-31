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

@Component({
  selector: 'app-artikel-card',
  imports: [CommonModule, FormsModule, RouterModule, WarenkorbComponent, UploadLoadingComponent, ZXingScannerModule],
  templateUrl: './artikel-card.component.html',
  styleUrl: './artikel-card.component.scss',
})
export class ArtikelCardComponent implements OnInit {
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
  selectedDevice: MediaDeviceInfo | undefined;

    videoConstraints: MediaTrackConstraints = {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1920 },
    height: { ideal: 1080 }
  };

  constructor(
    private router: Router,
    private authService: AuthService,
    private globalService: GlobalService
  ) {}

  ngOnInit(): void {
    const token = localStorage.getItem('token');
    const loadedWarenkorb = localStorage.getItem('warenkorb')

    if(loadedWarenkorb) {
      this.globalService.warenkorb = JSON.parse(loadedWarenkorb);
    }

    console.log(this.globalService.warenkorb)

    if (token) {
      this.authService.checkToken(token).subscribe({
        next: (response) => {
          console.log('Token gültig:', response);
          this.artikelService.getData().subscribe((res) => {
            if(response.user.role == 'admin') {
              this.globalService.isAdmin = true;
            }
            this.globalArtikels = res;
            this.artikelData = res;
            this.collectOrderData(response);
            this.globalService.orderData = this.orderData;
            console.log('global', this.globalService.orderData);
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
      console.log('Artikel entfernt');
    } else {
      // Artikel hinzufügen
      favorites.push(artikel);
      console.log('Artikel hinzugefügt');
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
    this.stopScanner(); // optional Kamera nach Scan stoppen
    console.log('Scan erfolgreich:', result);
    this.searchTerm = result;
    this.filteredArtikelData();
  }

  startScanner() {
    this.isScanning = true;
    this.scanner?.scanStart(); // aktiviert Kamera

    navigator.mediaDevices.enumerateDevices().then(devices => {
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      this.selectedDevice = videoDevices.find(d => d.label.toLowerCase().includes('back')) || videoDevices[0];
    });

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

  filterCategory(event: Event) {
    const category = (event.target as HTMLSelectElement).value; // Wert aus Event holen
    console.log('selected', category)
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
}
