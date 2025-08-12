import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { IndexedDBService, StoredImage } from '../indexeddb.service';

@Component({
  selector: 'app-recent-images-modal',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  template: `
    <div class="recent-images-modal">
      <div class="modal-header">
        <h2>Zuletzt hochgeladene Bilder</h2>
        <button class="close-btn" (click)="close()">
          <span>&times;</span>
        </button>
      </div>
      
      <div class="modal-content">
        @if (isLoading) {
          <div class="loading">Lade Bilder...</div>
        } @else if (images.length === 0) {
          <div class="no-images">Keine Bilder gefunden</div>
        } @else {
          <div class="images-grid">
            @for (image of images; track image.id) {
              <div class="image-item">
                <div class="image-preview">
                  <img [src]="getImageUrl(image)" [alt]="image.name" />
                </div>
                <div class="image-info">
                  <div class="image-name">{{ image.name }}</div>
                  <div class="image-details">
                    <span class="size">{{ formatFileSize(image.size) }}</span>
                    <span class="date">{{ formatDate(image.uploadDate) }}</span>
                  </div>
                  @if (image.customerNumber) {
                    <div class="customer-number">Kunde: {{ image.customerNumber }}</div>
                  }
                </div>
                <button class="delete-btn" (click)="deleteImage(image.id!)" title="Bild löschen">
                  <span>&times;</span>
                </button>
              </div>
            }
          </div>
          
          <div class="modal-actions">
            <button class="clear-all-btn" (click)="clearAllImages()" [disabled]="images.length === 0">
              Alle Bilder löschen
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .recent-images-modal {
      max-width: 95vw;
      width: 100%;
      max-height: 90vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px;
      border-bottom: 1px solid #e0e0e0;
      background: #f8f9fa;
    }
    
    .modal-header h2 {
      margin: 0;
      color: #333;
      font-size: 1.5rem;
    }
    
    .close-btn {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: #666;
      padding: 5px;
      border-radius: 4px;
    }
    
    .close-btn:hover {
      background: #e0e0e0;
      color: #333;
    }
    
    .modal-content {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }
    
    .loading, .no-images {
      text-align: center;
      padding: 40px;
      color: #666;
      font-size: 1.1rem;
    }
    
    .images-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
    }
    
    .image-item {
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      overflow: hidden;
      background: white;
      position: relative;
      transition: box-shadow 0.2s;
    }
    
    .image-item:hover {
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    
    .image-preview {
      width: 100%;
      height: 400px;
      overflow: visible;
      background: #f5f5f5;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    
    .image-preview img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    
    .image-info {
      padding: 12px;
    }
    
    .image-name {
      font-weight: 600;
      color: #333;
      margin-bottom: 6px;
      word-break: break-word;
      font-size: 0.95rem;
    }
    
    .image-details {
      display: flex;
      justify-content: space-between;
      font-size: 0.85rem;
      color: #666;
      margin-bottom: 6px;
    }
    
    .customer-number {
      font-size: 0.85rem;
      color: #007bff;
      font-weight: 500;
    }
    
    .delete-btn {
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(220, 53, 69, 0.9);
      color: white;
      border: none;
      border-radius: 50%;
      width: 30px;
      height: 30px;
      cursor: pointer;
      font-size: 1.2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
      z-index: 10;
    }
    
    .delete-btn:hover {
      background: rgba(220, 53, 69, 1);
    }
    
    .modal-actions {
      text-align: center;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
    }
    
    .clear-all-btn {
      background: #dc3545;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1rem;
      transition: background 0.2s;
    }
    
    .clear-all-btn:hover:not(:disabled) {
      background: #c82333;
    }
    
    .clear-all-btn:disabled {
      background: #6c757d;
      cursor: not-allowed;
    }
    
    /* Mobile Optimierungen */
    @media (max-width: 768px) {
      .recent-images-modal {
        max-width: 100vw;
        max-height: 100vh;
        width: 100vw;
        height: 100vh;
        border-radius: 0;
        margin-bottom: 100px;
      }
      
      .modal-header {
        padding: 12px;
      }
      
      .modal-header h2 {
        font-size: 1.2rem;
      }
      
      .modal-content {
        padding: 12px;
      }
      
      .images-grid {
        grid-template-columns: 1fr;
        gap: 12px;
      }
      
      .image-preview {
        height: 350px;
        width: 100%;
      }
      
      .image-preview img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
      
      .image-info {
        padding: 10px;
      }
      
      .image-name {
        font-size: 0.95rem;
        margin-bottom: 4px;
      }
      
      .image-details {
        flex-direction: column;
        gap: 3px;
        font-size: 0.8rem;
        margin-bottom: 4px;
      }
      
      .customer-number {
        font-size: 0.8rem;
      }
      
      .delete-btn {
        width: 32px;
        height: 32px;
        font-size: 1.3rem;
        top: 8px;
        right: 8px;
        z-index: 10;
      }
      
      .image-preview {
        height: auto;
        width: 100%;
        position: relative;
        overflow: visible;
      }
      
      .image-preview img {
        width: 100%;
        height: auto;
        object-fit: contain;
        position: relative;
        z-index: 1;
      }
    }
    
    /* Tablet Optimierungen */
    @media (min-width: 769px) and (max-width: 1024px) {
      .recent-images-modal {
        max-width: 95vw;
        max-height: 90vh;
        margin-bottom: 100px;
      }
      
      .images-grid {
        grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
        gap: 15px;
      }
      
      .image-preview {
        height: auto;
      }
      
      .image-preview img {
        height: auto;
      }
    }
    
    /* Desktop Optimierungen */
    @media (min-width: 1025px) {
      .recent-images-modal {
        max-width: 1400px;
        max-height: 90vh;
      }
      
      .images-grid {
        grid-template-columns: repeat(auto-fill, minmax(450px, 1fr));
        gap: 20px;
      }
      
      .image-preview {
        height: 450px;
      }
    }
  `]
})
export class RecentImagesModalComponent implements OnInit, OnDestroy {
  private indexedDBService = inject(IndexedDBService);
  private dialogRef = inject(MatDialogRef<RecentImagesModalComponent>);
  private data = inject(MAT_DIALOG_DATA);

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
      this.images = await this.indexedDBService.getRecentImages(20);
      
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
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
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

  close() {
    this.dialogRef.close();
  }
}
