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
  eans?: string[]; // Array von EANs aus product_eans Tabelle
  article_notes?: string; // Artikel-Notizen
}

interface InventoryEntry {
  article_number: string;
  quantity: number;
  article_text?: string;
}

interface InventoryHistoryEntry {
  article_number: string;
  article_text?: string;
  quantity: number;
  timestamp: string; // ISO string
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
  inventoryHistory: InventoryHistoryEntry[] = []; // Historie der eingegebenen Mengen
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
  showConfirmClearModal: boolean = false;
  showConfirmDeleteModal: boolean = false;
  selectedEntryToDelete: InventoryEntry | null = null;
  showConfirmClearAllSavedModal: boolean = false;
  showConfirmRemoveModal: boolean = false;
  selectedEntryToRemove: InventoryEntry | null = null;
  showConfirmSaveModal: boolean = false;

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

  // Export type toggle: true = Gesamtinventur (alle Artikel), false = Teilinventur (nur gezählte)
  isFullInventory: boolean = true;

  // Collapse/expand state for saved inventory section
  isSavedInventoryExpanded: boolean = true;
  isHistoryExpanded: boolean = false; // Historie ein-/ausklappen

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

  // Historie localStorage methods
  private saveHistoryToStorage(): void {
    if (this.inventoryHistory.length > 0) {
      // Begrenze Historie auf die letzten 1000 Einträge
      const limitedHistory = this.inventoryHistory.slice(-1000);
      localStorage.setItem('inventory_history', JSON.stringify(limitedHistory));
    } else {
      localStorage.removeItem('inventory_history');
    }
  }

  private loadHistoryFromStorage(): void {
    const savedHistory = localStorage.getItem('inventory_history');
    if (savedHistory) {
      try {
        this.inventoryHistory = JSON.parse(savedHistory);
        console.log('Inventur-Historie aus localStorage geladen:', this.inventoryHistory.length, 'Einträge');
      } catch (error) {
        console.error('Fehler beim Laden der Inventur-Historie:', error);
        localStorage.removeItem('inventory_history');
      }
    }
  }

  private addToHistory(articleNumber: string, articleText: string | undefined, quantity: number): void {
    const historyEntry: InventoryHistoryEntry = {
      article_number: articleNumber,
      article_text: articleText,
      quantity: quantity,
      timestamp: new Date().toISOString()
    };
    
    this.inventoryHistory.push(historyEntry);
    
    // Begrenze Historie auf die letzten 1000 Einträge
    if (this.inventoryHistory.length > 1000) {
      this.inventoryHistory = this.inventoryHistory.slice(-1000);
    }
    
    this.saveHistoryToStorage();
  }

  ngOnInit(): void {
    this.loadArticles();
    this.loadInventoryFromStorage();
    this.loadHistoryFromStorage();
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
      const trimmedTerm = this.searchTerm.trim();
      
      // Mindestlänge prüfen (außer bei EAN)
      const isEanSearch = /^\d{8}$|^\d{13}$/.test(trimmedTerm);
      if (!isEanSearch && trimmedTerm.length < 3) {
        this.filteredArticles = [];
        return;
      }

      // Mehrere Suchbegriffe unterstützen (getrennt durch Leerzeichen)
      const terms = trimmedTerm.toLowerCase().split(/\s+/);
      
      // Filtere Artikel: Alle Begriffe müssen gefunden werden (AND-Logik)
      const filtered = this.articles.filter((article) => {
        return terms.every((term) => {
          // Suche nach Artikelnummer
          if (article.article_number.toLowerCase().includes(term)) {
            return true;
          }
          // Suche nach Artikeltext
          if (article.article_text.toLowerCase().includes(term)) {
            return true;
          }
          // Suche nach EAN aus products.ean (falls vorhanden)
          if (article.ean && article.ean.toLowerCase().includes(term)) {
            return true;
          }
          // Suche nach EANs aus product_eans Tabelle (Array)
          if (article.eans && Array.isArray(article.eans)) {
            const foundEan = article.eans.some(ean => 
              ean && ean.toLowerCase().includes(term)
            );
            if (foundEan) {
              return true;
            }
          }
          return false;
        });
      });

      // Intelligente Sortierung: exakte Matches zuerst, dann "starts with", dann alphabetisch
      const searchTermLower = trimmedTerm.toLowerCase();
      this.filteredArticles = filtered.sort((a, b) => {
        const aArticleNumberExact = a.article_number?.toLowerCase() === searchTermLower;
        const bArticleNumberExact = b.article_number?.toLowerCase() === searchTermLower;
        const aArticleTextExact = a.article_text.toLowerCase() === searchTermLower;
        const bArticleTextExact = b.article_text.toLowerCase() === searchTermLower;
        const aEanExact = a.ean?.toLowerCase() === searchTermLower;
        const bEanExact = b.ean?.toLowerCase() === searchTermLower;

        const aArticleNumberStartsWith = a.article_number?.toLowerCase().startsWith(searchTermLower);
        const bArticleNumberStartsWith = b.article_number?.toLowerCase().startsWith(searchTermLower);
        const aArticleTextStartsWith = a.article_text.toLowerCase().startsWith(searchTermLower);
        const bArticleTextStartsWith = b.article_text.toLowerCase().startsWith(searchTermLower);
        const aEanStartsWith = a.ean?.toLowerCase().startsWith(searchTermLower);
        const bEanStartsWith = b.ean?.toLowerCase().startsWith(searchTermLower);

        // Exakte Matches zuerst
        if (aArticleNumberExact && !bArticleNumberExact) return -1;
        if (!aArticleNumberExact && bArticleNumberExact) return 1;
        if (aArticleTextExact && !bArticleTextExact) return -1;
        if (!aArticleTextExact && bArticleTextExact) return 1;
        if (aEanExact && !bEanExact) return -1;
        if (!aEanExact && bEanExact) return 1;
        
        // Dann "starts with" Matches
        if (aArticleNumberStartsWith && !bArticleNumberStartsWith) return -1;
        if (!aArticleNumberStartsWith && bArticleNumberStartsWith) return 1;
        if (aArticleTextStartsWith && !bArticleTextStartsWith) return -1;
        if (!aArticleTextStartsWith && bArticleTextStartsWith) return 1;
        if (aEanStartsWith && !bEanStartsWith) return -1;
        if (!aEanStartsWith && bEanStartsWith) return 1;

        // Dann nach Artikelnummer sortieren (intelligent)
        const articleNumberComparison = this.compareArticleNumbers(a.article_number, b.article_number);
        if (articleNumberComparison !== 0) {
          return articleNumberComparison;
        }
        
        // Zuletzt alphabetisch nach Artikeltext
        return a.article_text.localeCompare(b.article_text);
      });
    }
  }

  /**
   * Vergleicht zwei Artikelnummern intelligent (numerisch und alphabetisch)
   * @param a Erste Artikelnummer
   * @param b Zweite Artikelnummer
   * @returns -1 wenn a < b, 0 wenn a = b, 1 wenn a > b
   */
  private compareArticleNumbers(a: string | undefined, b: string | undefined): number {
    // Behandle undefined/null Werte
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    
    // Versuche numerischen Vergleich für reine Zahlen
    const aNum = parseFloat(a);
    const bNum = parseFloat(b);
    
    // Wenn beide Artikelnummern reine Zahlen sind, vergleiche sie numerisch
    if (!isNaN(aNum) && !isNaN(bNum) && a.toString() === aNum.toString() && b.toString() === bNum.toString()) {
      return aNum - bNum;
    }
    
    // Ansonsten alphabetischen Vergleich
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.onSearchChange();
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
      // Historie speichern
      this.addToHistory(
        newEntry.article_number,
        newEntry.article_text,
        newEntry.quantity
      );
      
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
    const entry = this.inventoryEntries.find(e => e.article_number === articleNumber);
    if (entry) {
      this.selectedEntryToRemove = entry;
      this.showConfirmRemoveModal = true;
    }
  }

  confirmRemoveEntry(): void {
    if (!this.selectedEntryToRemove) {
      return;
    }

    const articleNumber = this.selectedEntryToRemove.article_number;
    this.inventoryEntries = this.inventoryEntries.filter(entry => entry.article_number !== articleNumber);
    // Speichere in localStorage
    this.saveInventoryToStorage();
    this.showConfirmRemoveModal = false;
    this.selectedEntryToRemove = null;
  }

  cancelRemoveEntry(): void {
    this.showConfirmRemoveModal = false;
    this.selectedEntryToRemove = null;
  }

  clearAllEntries(): void {
    if (this.inventoryEntries.length === 0) {
      return;
    }
    this.showConfirmClearModal = true;
  }

  confirmClearAllEntries(): void {
    this.inventoryEntries = [];
    // Speichere in localStorage (leert den Storage)
    this.saveInventoryToStorage();
    this.showConfirmClearModal = false;
  }

  cancelClearAllEntries(): void {
    this.showConfirmClearModal = false;
  }

  saveInventory(): void {
    if (this.inventoryEntries.length === 0) {
      return;
    }
    this.showConfirmSaveModal = true;
  }

  confirmSaveInventory(): void {
    if (this.inventoryEntries.length === 0) {
      this.showConfirmSaveModal = false;
      return;
    }

    this.isLoading = true;
    this.showConfirmSaveModal = false;
    
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

  cancelSaveInventory(): void {
    this.showConfirmSaveModal = false;
  }

  exportInventory(): void {
    this.isLoading = true;
    
    // Lade alle verfügbaren Artikel für Inventur und alle Inventur-Einträge parallel
    this.http.get<any[]>(`${environment.apiUrl}/api/inventory/products`, { headers: this.getAuthHeaders() }).subscribe({
      next: (availableProducts) => {
        // Lade alle Inventur-Einträge aus der Datenbank
        this.http.get<any[]>(`${environment.apiUrl}/api/inventory`, { headers: this.getAuthHeaders() }).subscribe({
          next: (dbEntries) => {
            // Erstelle Map für schnellen Zugriff auf Inventur-Einträge
            const inventoryMap = new Map<string, number>();
            dbEntries.forEach(entry => {
              inventoryMap.set(entry.article_number, entry.quantity);
            });

            // Erstelle Export-Liste: Alle verfügbaren Artikel mit ihren Mengen (0 wenn kein Eintrag)
            let exportEntries = availableProducts.map(product => {
              const quantity = inventoryMap.get(product.article_number) || 0;
              return {
                article_number: product.article_number,
                quantity: quantity
              };
            });

            // Bei Teilinventur: Nur Artikel mit Menge > 0 exportieren
            if (!this.isFullInventory) {
              exportEntries = exportEntries.filter(entry => entry.quantity > 0);
            }

            // Sortiere nach Artikelnummer
            exportEntries.sort((a, b) => a.article_number.localeCompare(b.article_number));

            // Erstelle CSV-Content
            const csvContent = exportEntries
              .map(entry => `${entry.article_number};${entry.quantity}`)
              .join('\n');
            
            // Download CSV mit UTF-8 BOM für korrekte Erkennung von Umlauten in Excel
            const exportType = this.isFullInventory ? 'gesamt' : 'teil';
            // UTF-8 BOM: EF BB BF (explizit als Bytes für maximale Kompatibilität)
            const BOM = new Uint8Array([0xEF, 0xBB, 0xBF]);
            const blob = new Blob([BOM, csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `inventur_${exportType}_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            this.isLoading = false;
            const entriesWithQuantity = exportEntries.filter(e => e.quantity > 0).length;
            const exportTypeLabel = this.isFullInventory ? 'Gesamtinventur' : 'Teilinventur';
            console.log(`${exportTypeLabel} abgeschlossen: ${exportEntries.length} Artikel exportiert (${entriesWithQuantity} mit Menge > 0${this.isFullInventory ? `, ${exportEntries.length - entriesWithQuantity} mit Menge 0` : ''}).`);
          },
          error: (error) => {
            console.error('Fehler beim Laden der Inventur-Einträge:', error);
            alert('Fehler beim Laden der Inventur-Einträge aus der Datenbank.');
            this.isLoading = false;
          }
        });
      },
      error: (error) => {
        console.error('Fehler beim Laden der verfügbaren Artikel:', error);
        alert('Fehler beim Laden der verfügbaren Artikel.');
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

  deleteSavedInventoryEntry(articleNumber: string): void {
    const entry = this.savedInventoryEntries.find(e => e.article_number === articleNumber);
    if (entry) {
      this.selectedEntryToDelete = entry;
      this.showConfirmDeleteModal = true;
    }
  }

  confirmDeleteSavedEntry(): void {
    if (!this.selectedEntryToDelete) {
      return;
    }

    const articleNumber = this.selectedEntryToDelete.article_number;
    this.isLoadingSavedData = true;
    this.showConfirmDeleteModal = false;
    
    this.http.delete(`${environment.apiUrl}/api/inventory/${articleNumber}`, { headers: this.getAuthHeaders() }).subscribe({
      next: (response) => {
        console.log('Gespeicherter Inventur-Eintrag gelöscht:', response);
        
        // Entferne den Eintrag aus der lokalen Liste
        this.savedInventoryEntries = this.savedInventoryEntries.filter(entry => entry.article_number !== articleNumber);
        
        this.isLoadingSavedData = false;
        
        // Zeige Erfolgsmeldung
        this.showSuccessMessage = true;
        this.successMessage = `Inventur-Eintrag für Artikel ${articleNumber} wurde gelöscht.`;
        
        // Nach 3 Sekunden Nachricht ausblenden
        setTimeout(() => {
          this.showSuccessMessage = false;
        }, 3000);
      },
      error: (error) => {
        console.error('Fehler beim Löschen des gespeicherten Inventur-Eintrags:', error);
        alert('Fehler beim Löschen des Inventur-Eintrags.');
        this.isLoadingSavedData = false;
      }
    });

    this.selectedEntryToDelete = null;
  }

  cancelDeleteSavedEntry(): void {
    this.showConfirmDeleteModal = false;
    this.selectedEntryToDelete = null;
  }

  clearAllSavedEntries(): void {
    if (this.savedInventoryEntries.length === 0) {
      return;
    }
    this.showConfirmClearAllSavedModal = true;
  }

  confirmClearAllSavedEntries(): void {
    this.isLoadingSavedData = true;
    this.showConfirmClearAllSavedModal = false;
    
    this.http.delete(`${environment.apiUrl}/api/inventory`, { headers: this.getAuthHeaders() }).subscribe({
      next: (response) => {
        console.log('Alle gespeicherten Inventur-Einträge gelöscht:', response);
        
        // Leere die lokale Liste
        this.savedInventoryEntries = [];
        
        this.isLoadingSavedData = false;
        
        // Zeige Erfolgsmeldung
        this.showSuccessMessage = true;
        this.successMessage = 'Alle gespeicherten Inventur-Einträge wurden erfolgreich gelöscht.';
        
        // Nach 3 Sekunden Nachricht ausblenden
        setTimeout(() => {
          this.showSuccessMessage = false;
        }, 3000);
      },
      error: (error) => {
        console.error('Fehler beim Löschen aller gespeicherten Inventur-Einträge:', error);
        alert('Fehler beim Löschen aller gespeicherten Inventur-Einträge.');
        this.isLoadingSavedData = false;
      }
    });
  }

  cancelClearAllSavedEntries(): void {
    this.showConfirmClearAllSavedModal = false;
  }

  trackByArticleNumber(index: number, article: Article): string {
    return article.article_number;
  }

  trackByEntry(index: number, entry: InventoryEntry): string {
    return entry.article_number;
  }

  trackByHistoryEntry(index: number, entry: InventoryHistoryEntry): string {
    return `${entry.article_number}-${entry.timestamp}`;
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
    if (this.selectedArticle && this.quantityInput !== null && this.quantityInput !== 0) {
      const existingEntry = this.inventoryEntries.find(entry => entry.article_number === this.selectedArticle!.article_number);
      
      // Historie speichern
      this.addToHistory(
        this.selectedArticle.article_number,
        this.selectedArticle.article_text,
        this.quantityInput
      );
      
      if (existingEntry) {
        existingEntry.quantity += this.quantityInput;
        // Wenn Menge 0 oder weniger, entferne den Eintrag
        if (existingEntry.quantity <= 0) {
          this.removeEntry(this.selectedArticle.article_number);
        }
      } else {
        // Nur hinzufügen, wenn Menge positiv ist
        if (this.quantityInput > 0) {
          this.inventoryEntries.push({
            article_number: this.selectedArticle.article_number,
            quantity: this.quantityInput,
            article_text: this.selectedArticle.article_text
          });
        }
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
    
    // Prüfe ob es ein EAN-Code ist (8 oder 13 Ziffern)
    const trimmedResult = result.trim();
    const isEanCode = /^\d{8}$|^\d{13}$/.test(trimmedResult);
    
    if (isEanCode) {
      // EAN-Code: Suche Artikel über API
      console.log('EAN-Code erkannt, suche Artikel:', trimmedResult);
      this.searchArticleByEan(trimmedResult);
    } else {
      // Kein EAN-Code: Normale Suche
      this.searchTerm = result;
      this.onSearchChange();
      console.log('Barcode gescannt und in Suchfeld eingetragen:', result);
    }
  }

  searchArticleByEan(ean: string): void {
    const eanLower = ean.toLowerCase().trim();
    
    // Zuerst in lokalen Artikeln suchen (schneller, kein API-Call nötig)
    const foundArticle = this.articles.find(article => {
      // Suche in products.ean
      if (article.ean && article.ean.toLowerCase() === eanLower) {
        return true;
      }
      // Suche in product_eans Array
      if (article.eans && Array.isArray(article.eans)) {
        return article.eans.some(e => e && e.toLowerCase() === eanLower);
      }
      return false;
    });
    
    if (foundArticle) {
      // Artikel lokal gefunden: Öffne direkt Mengen-Modal
      console.log('Artikel lokal gefunden für EAN:', ean, 'Artikelnummer:', foundArticle.article_number);
      this.openQuantityModal(foundArticle);
      return;
    }
    
    // Nicht lokal gefunden: Suche über API
    console.log('EAN nicht lokal gefunden, suche über API:', ean);
    this.isLoading = true;
    
    this.http.post<any>(`${environment.apiUrl}/api/product-eans/scan`, 
      { ean: ean }, 
      { headers: this.getAuthHeaders() }
    ).subscribe({
      next: (response) => {
        this.isLoading = false;
        
        if (response.success && response.data) {
          const articleNumber = response.data.article_number;
          console.log('Artikel über API gefunden für EAN:', ean, 'Artikelnummer:', articleNumber);
          
          // Suche Artikel in der lokalen Liste
          const article = this.articles.find(a => a.article_number === articleNumber);
          
          if (article) {
            // Artikel gefunden: Öffne Mengen-Modal
            this.openQuantityModal(article);
          } else {
            // Artikel nicht in lokaler Liste: Lade Artikel neu und öffne dann Modal
            console.log('Artikel nicht in lokaler Liste, lade Artikel neu...');
            this.loadArticles();
            
            // Warte kurz und versuche erneut
            setTimeout(() => {
              const reloadedArticle = this.articles.find(a => a.article_number === articleNumber);
              if (reloadedArticle) {
                this.openQuantityModal(reloadedArticle);
              } else {
                // Artikel konnte nicht geladen werden
                alert(`Artikel mit EAN ${ean} gefunden (${articleNumber}), aber konnte nicht geladen werden.`);
                this.searchTerm = articleNumber;
                this.onSearchChange();
              }
            }, 500);
          }
        } else {
          // EAN nicht gefunden
          console.log('EAN nicht in Datenbank gefunden:', ean);
          alert(`EAN-Code ${ean} wurde nicht gefunden. Bitte ordnen Sie ihn zuerst einem Artikel zu.`);
          this.searchTerm = ean;
          this.onSearchChange();
        }
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Fehler beim Suchen nach EAN:', error);
        
        // Bei 404: EAN nicht gefunden
        if (error.status === 404) {
          alert(`EAN-Code ${ean} wurde nicht gefunden. Bitte ordnen Sie ihn zuerst einem Artikel zu.`);
        } else {
          alert(`Fehler beim Suchen nach EAN: ${error.error?.message || error.message}`);
        }
        
        // Fallback: Normale Suche
        this.searchTerm = ean;
        this.onSearchChange();
      }
    });
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

  toggleSavedInventory(): void {
    this.isSavedInventoryExpanded = !this.isSavedInventoryExpanded;
  }

  toggleHistory(): void {
    this.isHistoryExpanded = !this.isHistoryExpanded;
  }

  formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
      return 'gerade eben';
    } else if (diffMins < 60) {
      return `vor ${diffMins} Min.`;
    } else if (diffHours < 24) {
      return `vor ${diffHours} Std.`;
    } else if (diffDays < 7) {
      return `vor ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`;
    } else {
      // Format: DD.MM.YYYY HH:MM
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${day}.${month}.${year} ${hours}:${minutes}`;
    }
  }

  getHistoryForArticle(articleNumber: string): InventoryHistoryEntry[] {
    return this.inventoryHistory
      .filter(entry => entry.article_number === articleNumber)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  clearHistory(): void {
    if (confirm('Möchten Sie wirklich die gesamte Historie löschen?')) {
      this.inventoryHistory = [];
      this.saveHistoryToStorage();
    }
  }
}
