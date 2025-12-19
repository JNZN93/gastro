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
            
            // Download CSV
            const exportType = this.isFullInventory ? 'gesamt' : 'teil';
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
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
    
    // Schreibe den gescannten Code in das Suchfeld
    this.searchTerm = result;
    this.onSearchChange();
    
    console.log('Barcode gescannt und in Suchfeld eingetragen:', result);
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
}
