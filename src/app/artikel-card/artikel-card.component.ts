import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ArtikelDataService } from '../artikel-data.service';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../authentication.service';
import { Router, RouterModule } from '@angular/router';
import { WarenkorbComponent } from '../warenkorb/warenkorb.component';
import { GlobalService } from '../global.service';

@Component({
  selector: 'app-artikel-card',
  imports: [CommonModule, FormsModule, RouterModule, WarenkorbComponent],
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

  constructor(
    private router: Router,
    private authService: AuthService,
    private globalService: GlobalService
  ) {}

  ngOnInit(): void {
    const token = localStorage.getItem('token');

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
          });
        },
        error: (error) => {
          console.error('Token ungültig oder Fehler:', error);
          this.router.navigate(['/login']);
        },
      });
    } else {
      console.log('Kein Token gefunden.');
      this.router.navigate(['/login']);
    }
  }

  logIndex(index: number): void {
    console.log('Artikel-Index:', index);
  }


filteredArtikelData() {
  this.artikelData = this.globalArtikels;
  console.log(this.artikelData)
  console.log(this.searchTerm)
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
    if (this.selectedCategory == "") {
      this.artikelData = this.globalArtikels;
      console.log(this.artikelData)
      return;
    }
    this.getItemsFromCategory(category);
  }

  getItemsFromCategory(category:string) {
    this.artikelData = this.globalArtikels
    this.artikelData = this.artikelData.map((article)=> article).filter((article)=> article?.category == category)
    console.log(this.artikelData)
  }


  get categories(): string[] {
    return [
      ...new Set(
        this.globalArtikels?.map((a) => a.category).filter((cat) => cat)
      ),
    ];
  }

  addToCart(artikel: any): void {
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

    // Den Gesamtpreis aktualisieren
    // this.getTotalPrice();
    this.getTotalPrice();

    console.log('Warenkorb nach Hinzufügen:', this.globalService.warenkorb);
  }


  getTotalPrice() {
    this.globalService.totalPrice = this.globalService.warenkorb.reduce((summe, artikel) => summe + (artikel.sale_price * parseInt(artikel.quantity)), 0);
    console.log(this.globalService.totalPrice);
  }


  collectOrderData(response: any) {
    this.orderData.user_id = response.user.id;
    this.orderData.email = response.user.email;
  }
}
