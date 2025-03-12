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
            console.log(this.artikelData);
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
    if (!this.searchTerm) {
      return this.artikelData;
    }

    const searchTerm = this.searchTerm?.toLowerCase() || '';
    const terms = this.searchTerm.toLowerCase().split(/\s+/);

    return this.artikelData.filter((artikel) => {
      const matchesSearch = terms.every((term) =>
        artikel.article_text.toLowerCase().includes(term)
      );
      const matchesCategory =
        !this.selectedCategory || artikel.category === this.selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }

  filterCategory(event: Event) {
    const selectedValue = (event.target as HTMLSelectElement).value; // Wert aus Event holen
    this.selectedCategory = selectedValue; // Kategorie speichern
    this.filterArtikel(); // Artikel filtern
  }

  filterArtikel() {
    if (!this.artikelData) {
      this.filteredData = [];
      return;
    }

    const searchTerm = this.searchTerm.toLowerCase().trim();
    const terms = searchTerm.split(/\s+/);

    this.filteredData = this.artikelData.filter(artikel => {
      const matchesSearch = terms.every(term =>
        artikel.article_text.toLowerCase().includes(term)
      );

      const matchesCategory = !this.selectedCategory || artikel.category === this.selectedCategory;

      return matchesCategory && matchesSearch;
    });
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
      (item) => item.db_index === artikel.db_index
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
