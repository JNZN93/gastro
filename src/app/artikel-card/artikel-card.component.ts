import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { ArtikelDataService } from '../artikel-data.service';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../authentication.service';
import { Router, RouterModule } from '@angular/router';
import { WarenkorbComponent } from '../warenkorb/warenkorb.component';
import { GlobalService } from '../global.service';
import { UploadLoadingComponent } from '../upload-loading/upload-loading.component';

@Component({
  selector: 'app-artikel-card',
  imports: [CommonModule, FormsModule, RouterModule, WarenkorbComponent, UploadLoadingComponent],
  templateUrl: './artikel-card.component.html',
  styleUrl: './artikel-card.component.scss',
})
export class ArtikelCardComponent implements OnInit {
  private artikelService = inject(ArtikelDataService);
  artikelData: any[] = [];
  warenkorb: any[] = [];
  orderData: any = {};
  searchTerm: string = '';
  selectedCategory: string = '';
  globalArtikels: any[] = [];
  filteredData: any[] = [];
  isVisible: boolean = true;

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

    if (token) {
      this.authService.checkToken(token).subscribe({
        next: (response) => {
          console.log('Token gültig:', response);
          this.artikelService.getData().subscribe((res) => {
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
    return JSON.parse(localStorage.getItem('favoriteItems') || '[]').some((item: any) => item.article_number === artikel.article_number);
    
  }

  toggleFavorite(event: Event, artikel: any): void {
    const icon = event.target as HTMLElement; // Das angeklickte Element
    console.log(artikel.isFavorite);
  
    artikel.isFavorite = !artikel.isFavorite; // Zustand umkehren
    if (artikel.isFavorite) {
      this.globalService.favoriteItems = [...this.globalService.favoriteItems, artikel];
      console.log('Artikel hinzugefügt');
      icon.classList.add('fa-star'); // Füge den gefüllten Stern hinzu
    } else {
      this.globalService.favoriteItems = this.globalService.favoriteItems.filter((item: any) => item.id !== artikel.id);
      console.log('Artikel entfernt');
      icon.classList.remove('fa-star'); // Entferne den gefüllten Stern
    }
    console.log(this.globalService.favoriteItems);
    localStorage.setItem('favoriteItems', JSON.stringify(this.globalService.favoriteItems));
  }

  filteredArtikelData() {
    this.artikelData = this.globalArtikels;
    if (this.searchTerm) {
      const terms = this.searchTerm.toLowerCase().split(/\s+/);
      this.artikelData = this.artikelData.filter((artikel) =>
        terms.every((term) => artikel.article_text.toLowerCase().includes(term))
      );
    }
  }

  filterCategory(event: Event) {
    const category = (event.target as HTMLSelectElement).value; // Wert aus Event holen
    console.log('selected', category)
    this.selectedCategory = category; // Kategorie speichern
    // Seite nach oben scrollen
    window.scrollTo({ top: 0, behavior: 'smooth' });

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
      button.style.backgroundColor = "#000000"; // Zurück zu Schwarz
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
