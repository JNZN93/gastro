import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IndexedDBService, StoredImage } from '../indexeddb.service';

@Component({
  selector: 'app-images-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="images-panel-large">
      <div class="panel-header">
        <h3>📷 Bildergalerie</h3>
        <div class="header-actions">
          <button class="clear-all-btn" (click)="clearAllImages()" [disabled]="images.length === 0">
            <span class="material-icons">delete_sweep</span>
            Alle löschen
          </button>
          <button class="close-btn" (click)="closePanel()" title="Split-View schließen">
            <span class="material-icons">close_fullscreen</span>
          </button>
        </div>
      </div>
      
      <div class="panel-content">
        @if (isLoading) {
          <div class="loading">
            <div class="loading-spinner"></div>
            <span>Lade Bilder...</span>
          </div>
        } @else if (images.length === 0) {
          <div class="no-images">
            <span class="material-icons">photo_library</span>
            <h4>Keine Bilder gefunden</h4>
            <p>Laden Sie Bilder hoch, um sie hier anzuzeigen</p>
          </div>
        } @else {
          <div class="images-grid-large">
            @for (image of images; track image.id) {
              <div class="image-card-large">
                <div class="image-container-large">
                  <img [src]="getImageUrl(image)" [alt]="image.name" (click)="openImageFullscreen(image)" />
                  <div class="image-overlay">
                    <button class="delete-btn" (click)="deleteImage(image.id!)" title="Bild löschen">
                      <span class="material-icons">delete</span>
                    </button>
                    <button class="fullscreen-btn" (click)="openImageFullscreen(image)" title="Vollbild">
                      <span class="material-icons">fullscreen</span>
                    </button>
                  </div>
                </div>
                <div class="image-info-compact">
                  <div class="image-name-compact">{{ image.name }}</div>
                  <div class="image-meta-compact">
                    <span class="size">{{ formatFileSize(image.size) }}</span>
                    <span class="date">{{ formatDate(image.uploadDate) }}</span>
                    @if (image.customerNumber) {
                      <span class="customer">{{ image.customerNumber }}</span>
                    }
                  </div>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .images-panel-large {
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.1);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid #e2e8f0;
    }
    
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 24px 32px;
      border-bottom: 2px solid #e2e8f0;
      background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    
    .panel-header h3 {
      margin: 0;
      color: #1e293b;
      font-size: 1.5rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .header-actions {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    
    .clear-all-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: white;
      border: none;
      padding: 10px 16px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 600;
      transition: all 0.2s ease;
      box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
    }
    
    .clear-all-btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4);
    }
    
    .clear-all-btn:disabled {
      background: #94a3b8;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }
    
    .close-btn {
      background: linear-gradient(135deg, #64748b 0%, #475569 100%);
      color: white;
      border: none;
      padding: 10px;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(100, 116, 139, 0.3);
    }
    
    .close-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(100, 116, 139, 0.4);
    }
    
    .close-btn .material-icons {
      font-size: 20px;
    }
    
    .panel-content {
      flex: 1;
      padding: 24px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }
    
    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px;
      color: #64748b;
      gap: 20px;
      flex: 1;
    }
    
    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #e2e8f0;
      border-top: 4px solid #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    .no-images {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px;
      color: #94a3b8;
      gap: 16px;
      flex: 1;
      text-align: center;
    }
    
    .no-images .material-icons {
      font-size: 64px;
      opacity: 0.5;
      margin-bottom: 8px;
    }
    
    .no-images h4 {
      margin: 0;
      font-size: 1.25rem;
      color: #64748b;
    }
    
    .no-images p {
      margin: 0;
      font-size: 0.875rem;
    }
    
    .images-grid-large {
      display: flex;
      flex-direction: column;
      gap: 20px;
      flex: 1;
    }
    
    .image-card-large {
      background: white;
      border-radius: 16px;
      overflow: hidden;
      transition: all 0.3s ease;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      border: 1px solid #e2e8f0;
    }
    
    .image-card-large:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 28px rgba(0,0,0,0.15);
      border-color: #cbd5e1;
    }
    
    .image-container-large {
      position: relative;
      width: 100%;
      height: 400px;
      overflow: hidden;
      background: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    
    .image-container-large img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      transition: transform 0.3s ease;
    }
    
    .image-card-large:hover .image-container-large img {
      transform: scale(1.02);
    }
    
    .image-overlay {
      position: absolute;
      top: 12px;
      right: 12px;
      display: flex;
      gap: 8px;
      opacity: 0;
      transform: translateY(-10px);
      transition: all 0.3s ease;
    }
    
    .image-card-large:hover .image-overlay {
      opacity: 1;
      transform: translateY(0);
    }
    
    .delete-btn, .fullscreen-btn {
      background: rgba(0, 0, 0, 0.7);
      color: white;
      border: none;
      border-radius: 8px;
      width: 36px;
      height: 36px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      backdrop-filter: blur(8px);
    }
    
    .delete-btn:hover {
      background: rgba(239, 68, 68, 0.9);
      transform: scale(1.1);
    }
    
    .fullscreen-btn:hover {
      background: rgba(59, 130, 246, 0.9);
      transform: scale(1.1);
    }
    
    .delete-btn .material-icons, .fullscreen-btn .material-icons {
      font-size: 18px;
    }
    
    .image-info-compact {
      padding: 16px 20px;
      background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
    }
    
    .image-name-compact {
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 8px;
      font-size: 0.95rem;
      line-height: 1.4;
      word-break: break-word;
    }
    
    .image-meta-compact {
      display: flex;
      gap: 16px;
      font-size: 0.8rem;
      color: #64748b;
      flex-wrap: wrap;
    }
    
    .image-meta-compact .customer {
      color: #3b82f6;
      font-weight: 500;
      background: #eff6ff;
      padding: 2px 8px;
      border-radius: 12px;
    }
    
    /* Scrollbar Styling */
    .panel-content::-webkit-scrollbar {
      width: 8px;
    }
    
    .panel-content::-webkit-scrollbar-track {
      background: #f1f5f9;
      border-radius: 4px;
    }
    
    .panel-content::-webkit-scrollbar-thumb {
      background: linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%);
      border-radius: 4px;
    }
    
    .panel-content::-webkit-scrollbar-thumb:hover {
      background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%);
    }
  `]
})
export class ImagesPanelComponent implements OnInit, OnDestroy {
  @Input() isOpen: boolean = false;
  @Output() close = new EventEmitter<void>();

  private indexedDBService = inject(IndexedDBService);

  images: StoredImage[] = [];
  isLoading = true;
  private blobUrls: string[] = [];

  ngOnInit() {
    this.loadRecentImages();
  }

  ngOnDestroy() {
    // Gib alle Blob-URLs frei
    this.blobUrls.forEach(url => URL.revokeObjectURL(url));
    this.blobUrls = [];
  }

  async loadRecentImages() {
    try {
      this.isLoading = true;
      this.images = await this.indexedDBService.getRecentImages(50); // Mehr Bilder laden
      
      // Erstelle Blob-URLs für alle Bilder
      this.blobUrls = this.images.map(image => URL.createObjectURL(image.data));
    } catch (error) {
      console.error('Fehler beim Laden der Bilder:', error);
    } finally {
      this.isLoading = false;
    }
  }

  getImageUrl(image: StoredImage): string {
    const index = this.images.indexOf(image);
    return index >= 0 && index < this.blobUrls.length ? this.blobUrls[index] : '';
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  async deleteImage(id: number) {
    if (confirm('Möchten Sie dieses Bild wirklich löschen?')) {
      try {
        await this.indexedDBService.deleteImage(id);
        
        // Finde den Index des zu löschenden Bildes
        const imageIndex = this.images.findIndex(img => img.id === id);
        if (imageIndex >= 0) {
          // Gib die entsprechende Blob-URL frei
          if (imageIndex < this.blobUrls.length) {
            URL.revokeObjectURL(this.blobUrls[imageIndex]);
            this.blobUrls.splice(imageIndex, 1);
          }
          
          // Entferne das Bild aus der Liste
          this.images.splice(imageIndex, 1);
        }
      } catch (error) {
        console.error('Fehler beim Löschen des Bildes:', error);
        alert('Fehler beim Löschen des Bildes');
      }
    }
  }

  async clearAllImages() {
    if (confirm('Möchten Sie wirklich alle Bilder löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
      try {
        await this.indexedDBService.clearAllImages();
        
        // Gib alle Blob-URLs frei
        this.blobUrls.forEach(url => URL.revokeObjectURL(url));
        this.blobUrls = [];
        this.images = [];
      } catch (error) {
        console.error('Fehler beim Löschen aller Bilder:', error);
        alert('Fehler beim Löschen aller Bilder');
      }
    }
  }

  openImageFullscreen(image: StoredImage) {
    // Fullscreen Modal implementieren (optional)
    const imageUrl = this.getImageUrl(image);
    if (imageUrl) {
      window.open(imageUrl, '_blank', 'width=800,height=600');
    }
  }

  closePanel() {
    this.close.emit();
  }
}
