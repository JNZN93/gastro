import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { trigger, transition, style, animate } from '@angular/animations';
import { ZXingScannerComponent, ZXingScannerModule } from '@zxing/ngx-scanner';
import { BarcodeFormat } from '@zxing/browser';

interface Article {
  article_number: string;
  article_text: string;
  category: string;
  current_stock?: number;
  ean?: string;
}

interface InventoryEntry {
  article_number: string;
  quantity: number;
  article_text?: string;
}

@Component({
  selector: 'app-inventory',
  imports: [CommonModule, FormsModule, ZXingScannerModule],
  templateUrl: './inventory.component.html',
  styleUrls: ['./inventory.component.scss', './inventory-modal.scss'],
  animations: [
    trigger('fadeInOut', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-10px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('300ms ease-in', style({ opacity: 0, transform: 'translateY(-10px)' }))
      ])
    ])
  ]
})
export class InventoryComponent implements OnInit {
  @ViewChild(ZXingScannerComponent) scanner!: ZXingScannerComponent;
  
  articles: Article[] = [];
  filteredArticles: Article[] = [];
  inventoryEntries: InventoryEntry[] = [];
  savedInventoryEntries: InventoryEntry[] = []; // Gespeicherte Daten aus der DB
  inputText: string = '';
  searchTerm: string = '';
  isLoading: boolean = false;
  isLoadingSavedData: boolean = false; // Loading für gespeicherte Daten
  showSuccessMessage: boolean = false;
  successMessage: string = '';

  // Modal properties
  showQuantityModal: boolean = false;
  selectedArticle: Article | null = null;
  quantityInput: number = 1;

  // Scanner properties
  isScanning: boolean = false;
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

  constructor(private http: HttpClient) {}

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }

  // localStorage methods for inventory persistence
  private saveInventoryToStorage(): void {
    if (this.inventoryEntries.length > 0) {
      localStorage.setItem('inventory_entries', JSON.stringify(this.inventoryEntries));
    } else {
      localStorage.removeItem('inventory_entries');
    }
  }

  private loadInventoryFromStorage(): void {
    const savedEntries = localStorage.getItem('inventory_entries');
    if (savedEntries) {
      try {
        this.inventoryEntries = JSON.parse(savedEntries);
        console.log('Inventur-Einträge aus localStorage geladen:', this.inventoryEntries.length);
      } catch (error) {
        console.error('Fehler beim Laden der gespeicherten Inventur-Einträge:', error);
        localStorage.removeItem('inventory_entries');
      }
    }
  }

  private clearInventoryStorage(): void {
    localStorage.removeItem('inventory_entries');
  }

  ngOnInit(): void {
    this.loadArticles();
    this.loadInventoryFromStorage();
    this.loadSavedInventoryData();
  }

  loadArticles(): void {
    this.isLoading = true;
    this.http.get<any[]>(`${environment.apiUrl}/api/inventory/products`, { headers: this.getAuthHeaders() }).subscribe({
      next: (products) => {
        this.articles = products;
        this.filteredArticles = [...this.articles];
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Fehler beim Laden der Artikel:', error);
        this.isLoading = false;
      }
    });
  }

  loadSavedInventoryData(): void {
    this.isLoadingSavedData = true;
    this.http.get<any[]>(`${environment.apiUrl}/api/inventory`, { headers: this.getAuthHeaders() }).subscribe({
      next: (savedEntries) => {
        this.savedInventoryEntries = savedEntries;
        this.isLoadingSavedData = false;
        console.log('Gespeicherte Inventur-Daten geladen:', savedEntries.length, 'Einträge');
      },
      error: (error) => {
        console.error('Fehler beim Laden der gespeicherten Inventur-Daten:', error);
        this.isLoadingSavedData = false;
      }
    });
  }

  onSearchChange(): void {
    if (!this.searchTerm.trim()) {
      this.filteredArticles = [...this.articles];
    } else {
      this.filteredArticles = this.articles.filter(article =>
        article.article_number.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        article.article_text.toLowerCase().includes(this.searchTerm.toLowerCase())
      );
    }
  }

  parseInventoryInput(): void {
    if (!this.inputText.trim()) {
      return;
    }

    const lines = this.inputText.trim().split('\n');
    const newEntries: InventoryEntry[] = [];

    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine && trimmedLine.includes(';')) {
        const parts = trimmedLine.split(';');
        if (parts.length >= 2) {
          const articleNumber = parts[0].trim();
          const quantity = parseInt(parts[1].trim(), 10);

          if (articleNumber && !isNaN(quantity)) {
            // Prüfe ob Artikel existiert
            const existingArticle = this.articles.find(a => a.article_number === articleNumber);
            if (existingArticle) {
              const existingEntry = newEntries.find(e => e.article_number === articleNumber);
              if (existingEntry) {
                // Wenn Artikel bereits in der Eingabe vorhanden, Menge addieren
                existingEntry.quantity += quantity;
              } else {
                newEntries.push({
                  article_number: articleNumber,
                  quantity: quantity,
                  article_text: existingArticle.article_text
                });
              }
            }
          }
        }
      }
    });

    // Füge neue Einträge zu bestehenden hinzu
    newEntries.forEach(newEntry => {
      const existingIndex = this.inventoryEntries.findIndex(e => e.article_number === newEntry.article_number);
      if (existingIndex >= 0) {
        this.inventoryEntries[existingIndex].quantity += newEntry.quantity;
      } else {
        this.inventoryEntries.push(newEntry);
      }
    });

    // Sortiere nach Artikelnummer
    this.inventoryEntries.sort((a, b) => a.article_number.localeCompare(b.article_number));
    
    // Speichere in localStorage
    this.saveInventoryToStorage();
    
    // Leere Eingabe
    this.inputText = '';
  }

  removeEntry(articleNumber: string): void {
    this.inventoryEntries = this.inventoryEntries.filter(entry => entry.article_number !== articleNumber);
    // Speichere in localStorage
    this.saveInventoryToStorage();
  }

  clearAllEntries(): void {
    this.inventoryEntries = [];
    // Speichere in localStorage (leert den Storage)
    this.saveInventoryToStorage();
  }

  saveInventory(): void {
    if (this.inventoryEntries.length === 0) {
      return;
    }

    this.isLoading = true;
    
    const inventoryData = {
      entries: this.inventoryEntries.map(entry => ({
        article_number: entry.article_number,
        quantity: entry.quantity
      }))
    };

    this.http.post<any>(`${environment.apiUrl}/api/inventory`, inventoryData, { headers: this.getAuthHeaders() }).subscribe({
      next: (response) => {
        console.log('Lagerbestand gespeichert:', response);
        this.isLoading = false;
        this.showSuccessMessage = true;
        this.successMessage = response.message || `${this.inventoryEntries.length} Artikel wurden erfolgreich inventarisiert.`;
        
        // Inventur-Einträge zurücksetzen
        this.inventoryEntries = [];
        
        // localStorage nach erfolgreichem Speichern leeren
        this.clearInventoryStorage();
        
        // Gespeicherte Daten neu laden
        this.loadSavedInventoryData();
        
        // Nach 3 Sekunden Nachricht ausblenden
        setTimeout(() => {
          this.showSuccessMessage = false;
        }, 3000);
      },
      error: (error) => {
        console.error('Fehler beim Speichern des Lagerbestands:', error);
        this.isLoading = false;
        // Hier könnte eine Fehlermeldung angezeigt werden
      }
    });
  }

  exportInventory(): void {
    this.isLoading = true;
    
    // Lade alle Inventur-Einträge aus der Datenbank
    this.http.get<any[]>(`${environment.apiUrl}/api/inventory`, { headers: this.getAuthHeaders() }).subscribe({
      next: (dbEntries) => {
        if (dbEntries.length === 0) {
          alert('Keine Inventur-Einträge in der Datenbank gefunden.');
          this.isLoading = false;
          return;
        }

        // Erstelle CSV-Content aus DB-Daten
        const csvContent = dbEntries
          .map(entry => `${entry.article_number};${entry.quantity}`)
          .join('\n');
        
        // Download CSV
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `inventur_db_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.isLoading = false;
        console.log(`Export abgeschlossen: ${dbEntries.length} Einträge aus der Datenbank exportiert.`);
      },
      error: (error) => {
        console.error('Fehler beim Exportieren der Inventur-Daten:', error);
        alert('Fehler beim Laden der Inventur-Daten aus der Datenbank.');
        this.isLoading = false;
      }
    });
  }

  getTotalQuantity(): number {
    return this.inventoryEntries.reduce((sum, entry) => sum + entry.quantity, 0);
  }

  isArticleInInventory(articleNumber: string): boolean {
    return this.inventoryEntries.some(entry => entry.article_number === articleNumber);
  }

  getInventoryQuantity(articleNumber: string): number {
    const entry = this.inventoryEntries.find(entry => entry.article_number === articleNumber);
    return entry ? entry.quantity : 0;
  }

  getSavedInventoryQuantity(articleNumber: string): number {
    const entry = this.savedInventoryEntries.find(entry => entry.article_number === articleNumber);
    return entry ? entry.quantity : 0;
  }

  trackByArticleNumber(index: number, article: Article): string {
    return article.article_number;
  }

  trackByEntry(index: number, entry: InventoryEntry): string {
    return entry.article_number;
  }

  // Modal methods
  openQuantityModal(article: Article): void {
    this.selectedArticle = article;
    this.quantityInput = null as any; // Leeres Inputfeld
    this.showQuantityModal = true;
    
    // Fokus auf Inputfeld nach kurzer Verzögerung
    setTimeout(() => {
      const inputElement = document.getElementById('quantityInput') as HTMLInputElement;
      if (inputElement) {
        inputElement.focus();
      }
    }, 100);
  }

  closeQuantityModal(): void {
    this.showQuantityModal = false;
    this.selectedArticle = null;
    this.quantityInput = null as any; // Leeres Inputfeld
  }

  addToInventoryFromModal(): void {
    if (this.selectedArticle && this.quantityInput > 0) {
      const existingEntry = this.inventoryEntries.find(entry => entry.article_number === this.selectedArticle!.article_number);
      
      if (existingEntry) {
        existingEntry.quantity += this.quantityInput;
      } else {
        this.inventoryEntries.push({
          article_number: this.selectedArticle.article_number,
          quantity: this.quantityInput,
          article_text: this.selectedArticle.article_text
        });
      }
      
      // Sortiere nach Artikelnummer
      this.inventoryEntries.sort((a, b) => a.article_number.localeCompare(b.article_number));
      
      // Speichere in localStorage
      this.saveInventoryToStorage();
      
      this.closeQuantityModal();
    }
  }

  // Scanner methods
  openBarcodeScanner(): void {
    this.isScanning = true;
    this.loadAvailableDevices();
  }

  loadAvailableDevices(): void {
    navigator.mediaDevices.enumerateDevices().then((devices: MediaDeviceInfo[]) => {
      this.availableDevices = devices.filter(device => device.kind === 'videoinput');
      if (this.availableDevices.length > 0) {
        this.selectedDevice = this.availableDevices[0];
      }
    });
  }

  onCodeResult(result: string): void {
    this.playBeep();
    this.stopScanner();
    
    // Suche Artikel nach EAN oder Artikelnummer
    const foundArticle = this.articles.find(article => 
      article.article_number === result || 
      article.ean === result
    );
    
    if (foundArticle) {
      this.openQuantityModal(foundArticle);
    } else {
      // Zeige Fehlermeldung wenn Artikel nicht gefunden
      console.warn('Artikel nicht gefunden:', result);
      // Hier könnte eine Toast-Nachricht angezeigt werden
    }
  }

  stopScanner(): void {
    this.isScanning = false;
  }

  playBeep(): void {
    // Einfacher Beep-Sound
    const audio = new Audio();
    audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBS13yO/eizEIHWq+8+OWT';
    audio.play().catch(() => {
      // Fallback für Browser ohne Audio-Support
      console.log('Beep sound played');
    });
  }
}
