import { Injectable } from '@angular/core';

export interface StoredImage {
  id?: number;
  name: string;
  type: string;
  size: number;
  data: Blob;
  uploadDate: Date;
  customerNumber?: string;
}

@Injectable({
  providedIn: 'root'
})
export class IndexedDBService {
  private dbName = 'GastroImagesDB';
  private dbVersion = 1;
  private storeName = 'images';
  private db: IDBDatabase | null = null;

  async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        reject('IndexedDB konnte nicht geöffnet werden');
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          
          // Indizes für bessere Suche
          store.createIndex('uploadDate', 'uploadDate', { unique: false });
          store.createIndex('customerNumber', 'customerNumber', { unique: false });
          store.createIndex('name', 'name', { unique: false });
        }
      };
    });
  }

  async storeImage(file: File, customerNumber?: string): Promise<number> {
    if (!this.db) {
      await this.initDB();
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Datenbank nicht initialisiert');
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const imageData: Omit<StoredImage, 'id'> = {
        name: file.name,
        type: file.type,
        size: file.size,
        data: file,
        uploadDate: new Date(),
        customerNumber
      };

      const request = store.add(imageData);

      request.onsuccess = () => {
        resolve(request.result as number);
      };

      request.onerror = () => {
        reject('Fehler beim Speichern des Bildes');
      };
    });
  }

  async getRecentImages(limit: number = 10): Promise<StoredImage[]> {
    if (!this.db) {
      await this.initDB();
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Datenbank nicht initialisiert');
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('uploadDate');

      const request = index.openCursor(null, 'prev');
      const images: StoredImage[] = [];

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && images.length < limit) {
          images.push(cursor.value);
          cursor.continue();
        } else {
          resolve(images);
        }
      };

      request.onerror = () => {
        reject('Fehler beim Laden der Bilder');
      };
    });
  }

  async getImagesByCustomer(customerNumber: string): Promise<StoredImage[]> {
    if (!this.db) {
      await this.initDB();
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Datenbank nicht initialisiert');
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('customerNumber');

      const request = index.getAll(customerNumber);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject('Fehler beim Laden der Kundebilder');
      };
    });
  }

  async deleteImage(id: number): Promise<void> {
    if (!this.db) {
      await this.initDB();
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Datenbank nicht initialisiert');
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const request = store.delete(id);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject('Fehler beim Löschen des Bildes');
      };
    });
  }

  async clearAllImages(): Promise<void> {
    if (!this.db) {
      await this.initDB();
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Datenbank nicht initialisiert');
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject('Fehler beim Löschen aller Bilder');
      };
    });
  }

  async getImageCount(): Promise<number> {
    if (!this.db) {
      await this.initDB();
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Datenbank nicht initialisiert');
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);

      const request = store.count();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject('Fehler beim Zählen der Bilder');
      };
    });
  }
}
