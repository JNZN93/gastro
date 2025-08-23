# Angebotssystem (Offer System)

Das Angebotssystem ermöglicht es, globale Angebote für alle Kunden zu erstellen, unabhängig von individuellen Kundenpreisen.

## 🏗️ Architektur

### Datenbankstruktur

#### `offers` Tabelle
- **id**: Primärschlüssel
- **name**: Name des Angebots
- **description**: Beschreibung des Angebots
- **discount_percentage**: Rabatt in Prozent (0.00 - 100.00)
- **discount_amount**: Fester Rabattbetrag
- **offer_type**: Typ des Angebots (`percentage`, `fixed_amount`, `buy_x_get_y`) - **Default: `fixed_amount`**
- **start_date**: Startdatum des Angebots
- **end_date**: Enddatum des Angebots
- **is_active**: Aktivierungsstatus
- **company**: Mandant-String (Multi-Mandant-Support, references users.company) - **Nullable**
- **created_at**, **updated_at**: Zeitstempel

#### `offer_products` Tabelle (Verknüpfung)
- **id**: Primärschlüssel
- **offer_id**: Referenz auf Angebot
- **product_id**: Referenz auf Produkt
- **company**: Mandant-String (references users.company) - **Nullable**
- **offer_price**: Direkter Angebotspreis (optional, nullable)
- **use_offer_price**: Ob direkter Preis verwendet werden soll (Default: false)
- **min_quantity**: Mindestmenge für Angebot (optional, nullable)
- **max_quantity**: Maximalmenge für Angebot (optional, nullable)
- **created_at**, **updated_at**: Zeitstempel

### Index-Optimierung
```sql
-- Für schnelle Angebotssuche
CREATE INDEX idx_offers_dates ON offers(start_date, end_date);
CREATE INDEX idx_offer_products ON offer_products(offer_id, product_id);
CREATE INDEX idx_offer_products_product ON offer_products(product_id);
```

## 🚀 API-Endpunkte

### Basis-URL: `/api/offers`

#### GET-Endpunkte (Lesen, Auth erforderlich)
- `GET /` - Alle Angebote des Mandanten abrufen
- `GET /active` - Aktive Angebote abrufen
- `GET /all-with-products` - **Alle Angebote mit allen Produkten (komplette Übersicht)**
- `GET /:id` - Spezifisches Angebot abrufen
- `GET /:id/with-products` - **Angebot mit allen Produkten (detaillierte Ansicht)**
- `GET /:offerId/products` - Produkte eines Angebots abrufen
- `GET /product/:productId` - Angebote für ein Produkt abrufen
- `GET /products/with-offers` - Produkte mit aktuellen Angeboten

#### POST-Endpunkte (Admin erforderlich)
- `POST /create` - Neues Angebot erstellen
- `POST /add-product` - Produkt zu Angebot hinzufügen
- `POST /remove-product` - Produkt aus Angebot entfernen
- `POST /calculate-price` - Endpreis mit Angeboten berechnen

#### PUT-Endpunkte (Admin erforderlich)
- `PUT /update/:id` - Angebot aktualisieren

#### DELETE-Endpunkte (Admin erforderlich)
- `DELETE /delete/:id` - Angebot löschen

## 📝 Verwendung

### 1. Angebot erstellen

```javascript
const offerData = {
  name: "Sommerschlussverkauf 2025",
  description: "20% Rabatt auf alle Sommerartikel",
  discount_percentage: 20.00,
  offer_type: "percentage",        // oder weglassen für "fixed_amount" (Default)
  start_date: "2025-01-15",
  end_date: "2025-01-31",
  is_active: true
  // company wird automatisch aus dem JWT-Token gesetzt
};

const response = await fetch('/api/offers/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify(offerData)
});
```

### 2. Alle Angebote mit Produkten abrufen

```javascript
const response = await fetch('/api/offers/all-with-products', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Response:
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Sommerschlussverkauf 2025",
      "description": "20% Rabatt auf alle Sommerartikel",
      "discount_percentage": 20.00,
      "offer_type": "percentage",
      "start_date": "2025-01-15",
      "end_date": "2025-01-31",
      "is_active": true,
      "company": "gastro-berlin",
      "products": [
        {
          "id": 5,
          "name": "Produkt A",
          "offer_price": 75.00,
          "use_offer_price": true,
          "min_quantity": 1,
          "max_quantity": 10
        }
      ]
    },
    {
      "id": 2,
      "name": "Winterrabatt",
      "description": "€10 Rabatt auf alle Winterartikel",
      "discount_amount": 10.00,
      "offer_type": "fixed_amount",
      "start_date": "2025-02-01",
      "end_date": "2025-02-28",
      "is_active": true,
      "company": "gastro-berlin",
      "products": [
        {
          "id": 6,
          "name": "Produkt B",
          "offer_price": null,
          "use_offer_price": false,
          "min_quantity": null,
          "max_quantity": null
        }
      ]
    }
  ],
  "total": 2
}
```

### 3. Einzelnes Angebot mit Produkten abrufen

```javascript
const response = await fetch('/api/offers/1/with-products', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Response: Ein einzelnes Angebot mit Produkten (wie oben)
```

### 2. Produkt zu Angebot hinzufügen

#### Einfache Verknüpfung (nur Rabatt)
```javascript
const productData = {
  offerId: 1,
  productId: 5
};

const response = await fetch('/api/offers/add-product', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify(productData)
});
```

#### Mit direktem Angebotspreis
```javascript
const productData = {
  offerId: 1,
  productId: 5,
  offerPrice: 75.00,        // Direkter Angebotspreis
  useOfferPrice: true,       // Direkten Preis verwenden
  minQuantity: 1,            // Mindestmenge (optional)
  maxQuantity: 10            // Maximalmenge (optional)
};

const response = await fetch('/api/offers/add-product', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify(productData)
});
```

### 3. Endpreis mit Angeboten berechnen

```javascript
const priceData = {
  productId: 5,
  customerId: 3,
  basePrice: 100.00
};

const response = await fetch('/api/offers/calculate-price', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify(priceData)
});

// Response:
{
  "success": true,
  "data": {
    "basePrice": 100.00,
    "finalPrice": 80.00,
    "appliedOffers": [
      {
        "offerId": 1,
        "offerName": "Sommerschlussverkauf 2025",
        "discountAmount": 20.00,
        "offerType": "percentage"
      }
    ],
    "totalDiscount": 20.00
  }
}
```

## 🔧 Angebotstypen

### 1. Prozentualer Rabatt (`percentage`)
- **discount_percentage**: Rabatt in Prozent (0.00 - 100.00)
- **Beispiel**: 20% Rabatt auf €100 = €80 Endpreis

### 2. Fester Rabattbetrag (`fixed_amount`) - **DEFAULT**
- **discount_amount**: Fester Rabattbetrag
- **Beispiel**: €10 Rabatt auf €50 = €40 Endpreis
- **Hinweis**: Standard-Angebotstyp bei der Erstellung

### 3. Kauf X bekomme Y (`buy_x_get_y`)
- **Status**: Noch nicht implementiert
- **Zukunft**: "Kaufe 2, bekomme 1 gratis"

### 4. Direkter Angebotspreis (`direct_price`)
- **offer_price**: Fester Angebotspreis in `offer_products` (nullable)
- **use_offer_price**: Boolean-Flag für direkten Preis (Default: false)
- **min_quantity/max_quantity**: Mengenlimits (optional, nullable)
- **Beispiel**: Normalpreis €100, Angebotspreis €75

## 📊 Preisberechnung

### Ablauf der Preisberechnung

1. **Basispreis ermitteln**: Kundenpreis aus `customer_article_prices`
2. **Aktive Angebote finden**: Angebote im aktuellen Zeitraum
3. **Rabatte anwenden**: Angebote der Reihe nach verarbeiten
4. **Endpreis berechnen**: Finaler Preis nach allen Rabatten

### Beispiel-Berechnung

```javascript
// Basispreis: €100
// Angebot 1: 20% Rabatt
// Angebot 2: €10 fester Rabatt

// Schritt 1: 20% von €100 = €20 Rabatt
// Zwischenpreis: €100 - €20 = €80

// Schritt 2: €10 fester Rabatt
// Endpreis: €80 - €10 = €70

// Gesamtrabatt: €30
```

## 🛡️ Sicherheit

### Authentifizierung
- Alle Endpunkte erfordern gültigen JWT-Token
- Token muss `company` enthalten (aus users.company)

### Multi-Mandant-Support
- **company**: String-Referenz auf users.company (nullable)
- **Globale Angebote**: company = null (für alle Mandanten)
- **Mandant-spezifische Angebote**: company = "gastro-berlin" (nur für einen Mandanten)
- **Flexibilität**: Ein Angebot kann global oder mandant-spezifisch sein

### Autorisierung
- **Lesen**: Alle authentifizierten Benutzer
- **Schreiben/Bearbeiten**: Nur Admin-Benutzer

### Datenvalidierung
- Angebotsdaten werden vor dem Speichern validiert
- Datumsbereich muss gültig sein
- Rabattwerte müssen im erlaubten Bereich liegen

## 🧪 Testing

### Test-Script ausführen

```bash
node scripts/testOffers.js
```

Das Script testet:
- Angebot erstellen
- Produkte hinzufügen/entfernen
- Preisberechnung
- Alle CRUD-Operationen

### Manuelle Tests

```bash
# Angebot erstellen
curl -X POST http://localhost:3000/api/offers/create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Angebot",
    "description": "Test Beschreibung",
    "discount_percentage": 15.00,
    "offer_type": "percentage",
    "start_date": "2025-01-15",
    "end_date": "2025-01-31"
  }'
```

## 🔮 Erweiterungen

### Geplante Features
- **Buy X Get Y**: Komplexere Angebotslogik
- **Kategorien**: Angebote für Produktkategorien
- **Kundengruppen**: Spezielle Angebote für bestimmte Kundengruppen
- **Automatisierung**: Automatische Aktivierung/Deaktivierung
- **Analytics**: Angebotsstatistiken und Performance

## 🌍 Multi-Mandant-Beispiele

### Globale Angebote (company = null)
```javascript
// Gilt für alle Mandanten
{
  name: "Black Friday 2025",
  company: null,                    // Global
  discount_percentage: 25.00,
  offer_type: "percentage"
}
```

### Mandant-spezifische Angebote
```javascript
// Gilt nur für einen Mandanten
{
  name: "Berliner Sommerfest",
  company: "gastro-berlin",         // Nur für diesen Mandanten
  discount_amount: 15.00,
  offer_type: "fixed_amount"        // Default
}
```

### Hybrid-Ansatz
```javascript
// Ein Mandant kann beide Arten von Angeboten haben
const globalOffers = await Offer.findByCompany(null);           // Globale Angebote
const companyOffers = await Offer.findByCompany("gastro-berlin"); // Mandant-spezifische
```

### Performance-Optimierungen
- **Caching**: Redis-Cache für aktive Angebote
- **Batch-Processing**: Massenverarbeitung von Angeboten
- **Background Jobs**: Asynchrone Angebotsverarbeitung

## 📚 Verwandte Dokumentation

- [README.md](./README.md) - Hauptdokumentation
- [README_CUSTOMER_ARTICLE_PRICES.md](./README_CUSTOMER_ARTICLE_PRICES.md) - Kundenpreise
- [README_PRODUCT_IMAGES.md](./README_PRODUCT_IMAGE.md) - Produktbilder

## 🤝 Support

Bei Fragen oder Problemen:
1. Überprüfe die Logs
2. Teste mit dem Test-Script
3. Überprüfe die Datenbankverbindung
4. Kontaktiere das Entwicklungsteam
