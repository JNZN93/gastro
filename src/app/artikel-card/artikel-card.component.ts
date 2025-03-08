import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ArtikelDataService } from '../artikel-data.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-artikel-card',
  imports: [CommonModule, FormsModule],
  templateUrl: './artikel-card.component.html',
  styleUrl: './artikel-card.component.scss',
})
export class ArtikelCardComponent implements OnInit {
  private artikelService = inject(ArtikelDataService);
  artikelData: any[] = [];
  warenkorb: any[] = [];
  searchTerm: string = '';

  ngOnInit(): void {
    this.artikelService.getData().subscribe((response) => {
      this.artikelData = response;
      console.log(response);
      //console.log('Artikel-Card JSON Data:', this.artikelData);
    });
  }

  logIndex(index: number): void {
    console.log('Artikel-Index:', index);
  }

  filteredArtikelData() {
    if (!this.searchTerm) {
      return this.artikelData;
    }

    return this.artikelData.filter(artikel =>
      artikel.article_text.toLowerCase().includes(this.searchTerm.toLowerCase())
    );
  }

  addToCart(artikel: any): void {
    const existingItem = this.warenkorb.find(
      (item) => item.db_index === artikel.db_index);


      if(!artikel.count || parseInt(artikel.count) < 1) {
        artikel.count = "1";
      }

    if (existingItem) {
      // Falls ja, Einheit um 1 erhöhen
      existingItem.count = (parseInt(existingItem.count) + parseInt(artikel.count)).toString();
    } else {
      // Falls nicht, Artikel mit Einheit = 1 in den Warenkorb legen
      this.warenkorb.push({ ...artikel, count: artikel.count.toString() });
    }

    artikel.count = '';
    console.log('Warenkorb:', this.warenkorb);
  }
}
