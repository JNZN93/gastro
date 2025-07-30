# EAN Scanner - Artikelverwaltung

Diese Komponente ermöglicht das Scannen von EAN-Codes und deren Zuordnung zu Artikeln in der Multi-Mandant-E-Commerce-Anwendung.

## 🚀 Features

### EAN-Code Scannen
- **EAN-Validierung**: Automatische Validierung von 13-stelligen EAN-Codes
- **Artikel-Suche**: Schnelle Suche nach Artikeln basierend auf gescannten EAN-Codes
- **Echtzeit-Feedback**: Sofortige Rückmeldung über gefundene Artikel

### EAN-Zuordnung
- **Artikel-Auswahl**: Dropdown mit allen verfügbaren Artikeln
- **Autocomplete-Suche**: Intelligente Suche nach Artikelnummer oder -text
- **Bulk-Operationen**: Massenzuordnung von EAN-Codes zu Artikeln

### Produktlisten mit EANs
- **Gruppierte EANs**: Jedes Produkt mit allen zugehörigen EANs in einem Array
- **Vollständige Produktdaten**: Alle Felder aus der products Tabelle
- **Frontend-optimiert**: Perfekt für Produktlisten im Frontend
- **Case-insensitive Arrays**: EANs werden immer als Array zurückgegeben

### Verwaltung
- **Übersicht**: Tabellarische Darstellung aller EAN-Zuordnungen
- **CRUD-Operationen**: Vollständige Verwaltung (Erstellen, Lesen, Aktualisieren, Löschen)
- **Admin-Berechtigungen**: Geschützte Endpunkte für Administratoren

## 📁 Dateistruktur

```
src/
├── model/
│   └── productEan.js              # Datenbankmodel für EAN-Zuordnungen
├── services/
│   └── productEanService.js       # Geschäftslogik für EAN-Verwaltung
├── controllers/
│   └── productEanController.js    # HTTP-Controller für API-Endpunkte
├── routes/
│   └── productEanRoutes.js        # Express-Routen für EAN-API
└── public/
    └── ean-scanner.html           # Frontend-Interface für EAN-Scanning
```

## 🗄️ Datenbankstruktur

Die Komponente nutzt die bestehende `product_eans` Tabelle:

```sql
CREATE TABLE product_eans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    article_number VARCHAR(255) NOT NULL,
    ean VARCHAR(13) NOT NULL UNIQUE,
    FOREIGN KEY (article_number) REFERENCES products(article_number) ON DELETE CASCADE,
    INDEX idx_article_number (article_number),
    INDEX idx_ean (ean)
);
```

## 🔌 API-Endpunkte

> **Wichtig**: Alle API-Endpunkte verwenden `article_number` (mit Unterstrich) anstatt `articleNumber` (camelCase) in Request Bodies und URL-Parametern.

### Öffentliche Endpunkte (Authentifizierung erforderlich)

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| GET | `/api/product-eans` | Alle EAN-Zuordnungen abrufen |
| GET | `/api/product-eans/:id` | EAN-Zuordnung nach ID abrufen |
| GET | `/api/product-eans/ean/:ean` | EAN-Zuordnung nach EAN-Code abrufen |
| GET | `/api/product-eans/article/:article_number` | EAN-Zuordnungen nach Artikelnummer |
| GET | `/api/product-eans/articles/search` | Suche nach Artikeln |
| GET | `/api/product-eans/articles/all` | Alle verfügbaren Artikelnummern |
| GET | `/api/product-eans/products-with-eans` | Alle Produkte mit gruppierten EANs |
| POST | `/api/product-eans/scan` | EAN-Code scannen und Artikel finden |
| POST | `/api/product-eans/assign` | Artikelnummer auswählen und EAN zuordnen |

### Admin-Endpunkte (Admin-Berechtigung erforderlich)

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| POST | `/api/product-eans` | Neue EAN-Zuordnung erstellen |
| POST | `/api/product-eans/bulk` | Bulk EAN-Zuordnungen erstellen |
| PUT | `/api/product-eans/:id` | EAN-Zuordnung aktualisieren |
| DELETE | `/api/product-eans/:id` | EAN-Zuordnung löschen |

## 📋 Verwendung

### 1. EAN-Code scannen

```javascript
// EAN-Code scannen und Artikel finden
const response = await fetch('/api/product-eans/scan', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ ean: '1234567890123' })
});

const result = await response.json();
if (result.success) {
    console.log('Gefundener Artikel:', result.data);
}
```

### 2. EAN-Code einem Artikel zuordnen

```javascript
// Artikelnummer auswählen und EAN zuordnen
const response = await fetch('/api/product-eans/assign', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
        article_number: 'ART001',
        ean: '1234567890123'
    })
});

const result = await response.json();
if (result.success) {
    console.log('EAN erfolgreich zugeordnet');
}
```

### 3. Alle EAN-Zuordnungen abrufen

```javascript
// Alle EAN-Zuordnungen abrufen
const response = await fetch('/api/product-eans', {
    headers: {
        'Authorization': `Bearer ${token}`
    }
});

const result = await response.json();
if (result.success) {
    console.log('EAN-Zuordnungen:', result.data);
}
```

### 4. Alle Produkte mit gruppierten EANs abrufen

```javascript
// Alle Produkte mit ihren EANs abrufen (für Frontend-Produktlisten)
const response = await fetch('/api/product-eans/products-with-eans', {
    headers: {
        'Authorization': `Bearer ${token}`
    }
});

const products = await response.json();
console.log('Produkte mit EANs:', products);

// Beispiel-Response:
// [
//   {
//     "id": 1,
//     "article_number": "ART001",
//     "article_text": "Cola 330ml Dose",
//     "category": "Getränke",
//     "gross_price": 1.50,
//     "sale_price": 1.20,
//     "unit": "Stück",
//     "is_active": 1,
//     "eans": ["4001234567890", "4001234567891", "4001234567892"]
//   }
// ]
```

## 🎨 Frontend-Interface

Das Frontend-Interface (`/ean-scanner.html`) bietet:

### Produktlisten mit EANs
Der neue Endpunkt `/api/product-eans/products-with-eans` ist speziell für Frontend-Produktlisten optimiert:
- **Gruppierte EANs**: Jedes Produkt hat ein Array mit allen zugehörigen EANs
- **Vollständige Produktdaten**: Alle Felder aus der products Tabelle
- **Case-insensitive EANs**: EANs werden immer als Array zurückgegeben
- **Nur aktive Produkte**: Filtert automatisch inaktive Produkte aus

**Verwendung im Frontend:**
```javascript
// Produktliste mit EANs laden
const products = await fetch('/api/product-eans/products-with-eans', {
    headers: { 'Authorization': `Bearer ${token}` }
}).then(res => res.json());

// Über Produkte iterieren
products.forEach(product => {
    console.log(`Produkt: ${product.article_text}`);
    console.log(`EANs: ${product.eans.join(', ')}`);
});
```

### EAN Scannen Tab
- Eingabefeld für EAN-Codes
- Automatische Validierung
- Anzeige gefundener Artikel

### EAN zuordnen Tab
- Artikelsuche mit Autocomplete
- EAN-Code Eingabe
- Zuordnung speichern

### Alle Zuordnungen Tab
- Tabellarische Übersicht
- Löschfunktion für EAN-Zuordnungen
- Aktualisierungsfunktion

## 🔒 Sicherheit

- **Authentifizierung**: Alle Endpunkte erfordern gültige JWT-Token
- **Admin-Berechtigung**: CRUD-Operationen nur für Administratoren
- **Validierung**: EAN-Code Format-Validierung (13 Ziffern)
- **Datenbank-Constraints**: Unique-Constraint für EAN-Codes

## ⚡ Performance

- **Indizierung**: Optimierte Datenbankindizes für schnelle Abfragen
- **Debouncing**: Artikelsuche mit 300ms Verzögerung
- **Pagination**: Begrenzte Suchergebnisse (10 Artikel)
- **Caching**: Frontend-Caching für wiederholte Abfragen

## 🧪 Fehlerbehandlung

### Häufige Fehlermeldungen

| Fehler | Ursache | Lösung |
|--------|---------|--------|
| "EAN-Code muss genau 13 Ziffern enthalten" | Ungültiges EAN-Format | Korrekten 13-stelligen Barcode scannen |
| "EAN-Code nicht in der Datenbank gefunden" | EAN nicht zugeordnet | EAN-Code zuerst einem Artikel zuordnen |
| "Dieser EAN-Code ist bereits einem Artikel zugeordnet" | Duplikat | Anderen EAN-Code verwenden oder bestehende Zuordnung löschen |
| "Artikelnummer existiert nicht" | Ungültige Artikelnummer | Gültige Artikelnummer aus der Produktdatenbank verwenden |

## 🚀 Installation und Setup

1. **Datenbank-Migration ausführen** (bereits vorhanden):
   ```bash
   npm run migrate
   ```

2. **Server starten**:
   ```bash
   npm start
   ```

3. **Frontend aufrufen**:
   ```
   http://localhost:3000/ean-scanner.html
   ```

## 📝 Beispiel-Workflow

### Szenario 1: Neuen Artikel mit EAN-Code hinzufügen

1. **Artikelnummer auswählen**: Dropdown öffnen und gewünschten Artikel wählen
2. **EAN-Code eingeben**: 13-stelligen Barcode scannen oder manuell eingeben
3. **Zuordnung speichern**: "Zuordnung speichern" Button klicken
4. **Bestätigung**: Erfolgsmeldung bestätigt die Zuordnung

### Szenario 2: EAN-Code scannen und Artikel finden

1. **EAN-Code scannen**: Barcode scannen oder manuell eingeben
2. **Suchen**: "Suchen" Button klicken
3. **Ergebnis anzeigen**: Gefundener Artikel wird mit Details angezeigt

### Szenario 3: EAN-Zuordnung verwalten

1. **Übersicht öffnen**: "Alle Zuordnungen" Tab wählen
2. **Zuordnung löschen**: Lösch-Button bei gewünschter Zeile klicken
3. **Bestätigung**: Löschvorgang bestätigen

## 🔧 Konfiguration

### Umgebungsvariablen

Keine zusätzlichen Umgebungsvariablen erforderlich. Die Komponente nutzt die bestehende Datenbankverbindung.

### Berechtigungen

- **Benutzer**: Lesen von EAN-Zuordnungen, Scannen von EAN-Codes
- **Administratoren**: Vollständige CRUD-Operationen

## 📊 Monitoring und Logging

Die Komponente loggt folgende Ereignisse:

- EAN-Scan-Versuche
- Erfolgreiche/fehlgeschlagene Zuordnungen
- Datenbankfehler
- Authentifizierungsfehler

## 🤝 Beitragen

Bei Fragen oder Problemen:

1. Issue im Repository erstellen
2. Detaillierte Beschreibung des Problems
3. Schritte zur Reproduktion angeben
4. Erwartetes vs. tatsächliches Verhalten beschreiben

## 📄 Lizenz

Diese Komponente ist Teil der Multi-Mandant-E-Commerce-Anwendung und unterliegt den gleichen Lizenzbedingungen. 