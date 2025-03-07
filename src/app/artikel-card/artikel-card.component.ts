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
      this.artikelData = response.ROWDATA;
      console.log('Artikel-Card JSON Data:', this.artikelData);
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
      artikel.ARTIKELTEXT.toLowerCase().includes(this.searchTerm.toLowerCase())
    );
  }

  addToCard(artikel: any): void {
    const existingItem = this.warenkorb.find(
      (item) => item.DBINDEX === artikel.DBINDEX);


      if(!artikel.MENGE || parseInt(artikel.MENGE) < 1) {
        artikel.MENGE = "1";
      }

    if (existingItem) {
      // Falls ja, Einheit um 1 erhöhen
      existingItem.MENGE = (parseInt(existingItem.MENGE) + parseInt(artikel.MENGE)).toString();
    } else {
      // Falls nicht, Artikel mit Einheit = 1 in den Warenkorb legen
      this.warenkorb.push({ ...artikel, MENGE: artikel.MENGE.toString() });
    }

    artikel.MENGE = '';
    console.log('Warenkorb:', this.warenkorb);
  }
}
