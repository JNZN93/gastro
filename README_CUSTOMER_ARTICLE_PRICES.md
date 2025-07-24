# Customer Article Prices Service

Dieser Service verwaltet kundenspezifische Artikelpreise basierend auf XML-Rechnungsdaten.

## Funktionalität

Der Service ermöglicht es, XML-Rechnungsdateien hochzuladen und automatisch die Artikelpreise für einen bestimmten Kunden zu extrahieren und in der Datenbank zu speichern.

### Hauptfunktionen:

1. **XML-Upload und Verarbeitung**: Lädt XML-Rechnungsdateien hoch und extrahiert Artikelpositionen
2. **Automatische Preisverwaltung**: Prüft ob ein Artikel bereits für einen Kunden existiert und aktualisiert oder erstellt neue Einträge
3. **Intelligente Preisvergleichung**: Vergleicht nur den Nettopreis (mit 1 Cent Toleranz) und überspringt Updates bei unveränderten Preisen
4. **Neueste Rechnung**: Verwendet automatisch die neueste Rechnung für einen Kunden
5. **CRUD-Operationen**: Vollständige Verwaltung der Kunden-Artikel-Preise

## API-Endpunkte

### XML-Upload
```
POST /api/customer-article-prices/upload
```

**Parameter:**
- `file`: XML-Datei (multipart/form-data)

### CRUD-Operationen
```
GET    /api/customer-article-prices                    # Alle Preise abrufen
GET    /api/customer-article-prices/:id               # Preis nach ID abrufen
GET    /api/customer-article-prices/customer/:customerId  # Preise nach Kunde
GET    /api/customer-article-prices/product/:productId    # Preise nach Produkt
POST   /api/customer-article-prices                    # Neuen Preis erstellen
PUT    /api/customer-article-prices/:id               # Preis aktualisieren
DELETE /api/customer-article-prices/:id               # Preis löschen
```

## Verwendung

### 1. XML-Datei hochladen

```bash
curl -X POST \
  http://localhost:3000/api/customer-article-prices/upload \
  -H 'Content-Type: multipart/form-data' \
  -F 'file=@/path/to/Export_Rechnungen.xml'
```

### 2. Preise für einen Kunden abrufen

```bash
curl -X GET \
  http://localhost:3000/api/customer-article-prices/customer/10301
```

## Datenbankstruktur

Die Tabelle `customer_article_prices` enthält folgende Felder:

- `id`: Primärschlüssel (auto-increment)
- `customer_id`: Kunden-ID (varchar)
- `product_id`: Artikel-ID (varchar)
- `invoice_id`: Rechnungs-ID (int)
- `unit_price_net`: Einzelpreis netto (decimal)
- `unit_price_gross`: Einzelpreis brutto (decimal, nullable)
- `vat_percentage`: Mehrwertsteuer-Prozentsatz (decimal, nullable)
- `invoice_date`: Rechnungsdatum (timestamp, nullable)
- `created_at`: Erstellungsdatum (timestamp)
- `updated_at`: Aktualisierungsdatum (timestamp)

**Hinweis:** Die Felder `unit_price_gross` und `vat_percentage` wurden durch spätere Migrationen als nullable definiert.

## XML-Struktur

Der Service erwartet XML-Dateien im Format der Export_Rechnungen.xml mit folgenden Feldern:

### Rechnungskopf:
- `INVID`: Rechnungs-ID
- `KundenNr`: Kunden-Nummer
- `Rechnungsdatum`: Rechnungsdatum
- `RechnungsNr`: Rechnungsnummer

### Artikelpositionen:
- `P_ArtikelNr`: Artikelnummer
- `P_Artikeltext`: Artikelbeschreibung
- `P_Anzahl`: Menge
- `P_EinzelpreisNetto`: Einzelpreis netto
- `P_GesamtpreisNetto`: Gesamtpreis netto
- `P_MwStProzenz`: Mehrwertsteuer-Prozentsatz

## Verarbeitungslogik

1. **XML-Parsing**: Die XML-Datei wird geparst und alle Rows extrahiert
2. **Kundengruppierung**: Rechnungen werden automatisch nach Kunden gruppiert
3. **Neueste Rechnung**: Für jeden Kunden wird die Rechnung mit dem neuesten Datum ausgewählt
4. **Artikelpositionen**: Alle Artikelpositionen der ausgewählten Rechnungen werden extrahiert
5. **Preisberechnung**: Einzelpreise werden aus den XML-Daten extrahiert (P_EinzelpreisNetto wird direkt verwendet)
6. **Intelligente Upsert-Operation**: Für jeden Artikel wird geprüft, ob bereits ein Preis existiert:
   - **Existiert nicht**: Neuer Eintrag wird erstellt
   - **Existiert**: Preis wird nur aktualisiert, wenn sich der Nettopreis um mehr als 1 Cent geändert hat
   - **Preis unverändert**: Eintrag wird übersprungen (Performance-Optimierung)

## Beispiel-Response

```json
{
  "message": "XML-Rechnung erfolgreich verarbeitet.",
  "result": {
    "totalCustomers": 3,
    "results": [
      {
        "customerId": "10301",
        "invoiceNumber": "2025072301",
        "invoiceDate": "23.07.2025 00:00",
        "processedItems": [
          {
            "productId": "GEMEIS001",
            "action": "created",
            "price": 15.50
          },
          {
            "productId": "ekin",
            "action": "updated",
            "price": 12.75
          },
          {
            "productId": "DOSCOL001",
            "action": "skipped",
            "price": 8.90
          }
        ],
        "totalItems": 3
      },
      {
        "customerId": "10302",
        "invoiceNumber": "2025072302",
        "invoiceDate": "23.07.2025 00:00",
        "processedItems": [
          {
            "productId": "DOSCOL001",
            "action": "created",
            "price": 8.90
          }
        ],
        "totalItems": 1
      }
    ]
  }
}
```

**Mögliche Aktionen:**
- `created`: Neuer Eintrag erstellt
- `updated`: Bestehender Eintrag aktualisiert (Preis hat sich geändert)
- `skipped`: Eintrag übersprungen (Preis unverändert)

## Preisvergleichslogik

Der Service verwendet eine intelligente Preisvergleichung:

- **Verglichen wird nur der Nettopreis** (unit_price_net)
- **Toleranz**: ±1 Cent für Rundungsdifferenzen
- **Performance**: Überspringt Updates bei unveränderten Preisen
- **Logging**: Detaillierte Konsolenausgabe für Debugging

## Fehlerbehandlung

Der Service behandelt folgende Fehler:

- **Keine XML-Datei**: Fehler wenn keine Datei hochgeladen wurde
- **Keine Rechnungen**: Fehler wenn keine gültigen Rechnungen in der XML-Datei gefunden wurden
- **XML-Parsing-Fehler**: Fehler beim Parsen der XML-Datei
- **Datenbankfehler**: Fehler bei Datenbankoperationen

## Abhängigkeiten

- `express`: Web-Framework
- `multer`: File-Upload-Handling
- `knex`: Datenbank-Query-Builder
- `xml2js`: XML-Parsing (über utils.js) 