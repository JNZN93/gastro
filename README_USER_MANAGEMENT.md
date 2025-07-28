# User Management Komponente

## Übersicht

Die User-Management Komponente ist eine vollständige Verwaltungsoberfläche für Benutzer im Admin-Bereich der Gastro-Anwendung. Sie bietet eine moderne, responsive Benutzeroberfläche im gleichen Design wie das Admin Dashboard.

## Features

### 📊 Dashboard-Statistiken
- **Gesamt User**: Anzahl aller registrierten Benutzer
- **Administratoren**: Anzahl der Admin-Benutzer
- **Reguläre User**: Anzahl der Standard-Benutzer
- **Aktive User**: Benutzer, die in den letzten 30 Tagen erstellt wurden

### 👥 Benutzerverwaltung
- **Benutzer auflisten**: Alle Benutzer mit detaillierten Informationen anzeigen
- **Benutzer erstellen**: Neue Benutzer mit allen erforderlichen Daten anlegen
- **Benutzer bearbeiten**: Bestehende Benutzerdaten aktualisieren
- **Benutzer löschen**: Benutzer entfernen (mit Sicherheitsabfrage)
- **Passwort zurücksetzen**: Passwörter für Benutzer zurücksetzen

### 🔍 Such- und Filterfunktionen
- **Live-Suche**: Durchsuchen nach Name, E-Mail, Firma oder Kundennummer
- **Rollenfilter**: Filtern nach Administrator oder Standard-User
- **Responsive Design**: Optimiert für Desktop, Tablet und Mobile

### 🎨 Benutzerfreundliche Oberfläche
- **Modernes Design**: Im gleichen Stil wie das Admin Dashboard
- **Intuitive Navigation**: Klare Struktur und einfache Bedienung
- **Responsive Layout**: Funktioniert auf allen Bildschirmgrößen
- **Loading-States**: Visuelle Rückmeldung bei API-Aufrufen
- **Fehlerbehandlung**: Benutzerfreundliche Fehlermeldungen

## API-Endpunkte

### GET /api/users
Lädt alle Benutzer aus der Datenbank.

**Response Schema:**
```json
[
  {
    "id": 1,
    "email": "admin@example.com",
    "password": "$2b$10$hashedPassword...",
    "name": "Admin User",
    "company": "Example Company",
    "role": "admin",
    "externalCustomerId": "EXT123",
    "resetPasswordToken": null,
    "resetPasswordExpires": null,
    "created_at": "2025-01-27T10:00:00.000Z",
    "updated_at": "2025-01-27T10:00:00.000Z"
  }
]
```

### PUT /api/users/:userId
Aktualisiert einen bestehenden Benutzer.

**Request Body:**
```json
{
  "role": "admin",
  "email": "user@example.com",
  "customer_number": "CUST123",
  "company": "Company Name",
  "name": "User Name"
}
```

### POST /api/users
Erstellt einen neuen Benutzer.

**Request Body:**
```json
{
  "role": "user",
  "email": "newuser@example.com",
  "customer_number": "CUST456",
  "company": "New Company",
  "name": "New User"
}
```

### DELETE /api/users/:userId
Löscht einen Benutzer.

### PUT /api/users/:userId/password
Setzt das Passwort eines Benutzers zurück.

**Request Body:**
```json
{
  "password": "newPassword123"
}
```

## Komponenten-Struktur

```
src/app/user-management/
├── user-management.component.html    # Template
├── user-management.component.scss    # Styles
├── user-management.component.ts      # TypeScript Logic
└── user-management.component.spec.ts # Tests

src/app/
└── user.service.ts                   # API Service
```

## Verwendung

### 1. Navigation
Die User-Management Komponente ist über das Admin Dashboard erreichbar:
- Admin Dashboard → "User Management" Button

### 2. Benutzer erstellen
1. Klicken Sie auf "Neuen User erstellen"
2. Füllen Sie alle Pflichtfelder aus:
   - Name (erforderlich)
   - E-Mail (erforderlich)
   - Rolle (erforderlich)
3. Optionale Felder:
   - Firma
   - Kundennummer
4. Klicken Sie auf "Erstellen"
5. **Hinweis**: Passwörter werden über den Passwort-Reset-Prozess verwaltet

### 3. Benutzer bearbeiten
1. Klicken Sie auf "Bearbeiten" bei dem gewünschten Benutzer
2. Ändern Sie die gewünschten Felder
3. Klicken Sie auf "Aktualisieren"

### 4. Passwort zurücksetzen
1. Klicken Sie auf "Passwort" bei dem gewünschten Benutzer
2. Geben Sie das neue Passwort ein (mindestens 6 Zeichen)
3. Bestätigen Sie das Passwort
4. Klicken Sie auf "Passwort zurücksetzen"

### 5. Benutzer löschen
1. Klicken Sie auf "Löschen" bei dem gewünschten Benutzer
2. Bestätigen Sie die Löschung im Modal
3. **Hinweis**: Der letzte Administrator kann nicht gelöscht werden

## Sicherheitsfeatures

### 🔐 Authentifizierung
- Nur Administratoren haben Zugriff auf die User-Management Komponente
- Automatische Weiterleitung zum Login bei fehlenden Berechtigungen
- Token-basierte API-Authentifizierung

### 🛡️ Validierung
- Client-seitige Formularvalidierung
- Server-seitige Datenvalidierung
- E-Mail-Format-Validierung
- Passwort-Management über E-Mail-Reset-Prozess

### ⚠️ Sicherheitsabfragen
- Bestätigungsdialog beim Löschen von Benutzern
- Schutz vor dem Löschen des letzten Administrators
- Passwort-Bestätigung beim Zurücksetzen

## Responsive Design

### Desktop (1024px+)
- Vollständige Tabellenansicht
- Alle Aktionen sichtbar
- Optimale Nutzung des verfügbaren Platzes

### Tablet (768px - 1023px)
- Angepasste Tabellenansicht
- Kompakte Aktionsbuttons
- Responsive Grid-Layout

### Mobile (bis 767px)
- Vertikale Layout-Anpassung
- Scrollbare Tabellen
- Touch-optimierte Buttons
- Vollbild-Modals

## Technische Details

### Dependencies
- Angular 17+
- RxJS für reaktive Programmierung
- Angular Forms für Formularverwaltung
- Angular Router für Navigation

### Styling
- SCSS für erweiterte CSS-Funktionen
- CSS Grid und Flexbox für Layout
- CSS Custom Properties für Theming
- Responsive Breakpoints

### Performance
- Lazy Loading der Komponente
- Optimierte API-Aufrufe
- Debounced Suchfunktion
- Effiziente Change Detection

## Erweiterte Features

### 🔄 Automatische Aktualisierung
- Die Benutzerliste wird nach jeder Aktion automatisch aktualisiert
- Real-time Feedback bei allen Operationen

### 📱 Mobile Optimierung
- Touch-freundliche Bedienelemente
- Optimierte Tabelle für kleine Bildschirme
- Responsive Modal-Dialoge

### 🎯 Benutzerfreundlichkeit
- Klare visuelle Hierarchie
- Konsistente Farbgebung
- Intuitive Icons und Labels
- Hilfreiche Tooltips

## Fehlerbehandlung

### Netzwerkfehler
- Automatische Wiederholung bei temporären Fehlern
- Benutzerfreundliche Fehlermeldungen
- Fallback-Mechanismen

### Validierungsfehler
- Sofortige Rückmeldung bei Formularfehlern
- Detaillierte Fehlermeldungen
- Hilfestellung zur Behebung

### Berechtigungsfehler
- Automatische Weiterleitung bei fehlenden Rechten
- Klare Kommunikation der erforderlichen Berechtigungen

## Zukünftige Erweiterungen

### Geplante Features
- [ ] Bulk-Operationen (mehrere User gleichzeitig bearbeiten)
- [ ] Erweiterte Filteroptionen (Datum, Status, etc.)
- [ ] Export-Funktionen (CSV, PDF)
- [ ] Benutzer-Aktivitäts-Logs
- [ ] Zwei-Faktor-Authentifizierung
- [ ] Benutzer-Gruppen und Berechtigungen

### Performance-Optimierungen
- [ ] Virtual Scrolling für große Benutzerlisten
- [ ] Caching-Strategien
- [ ] Progressive Web App Features
- [ ] Offline-Funktionalität

## Support

Bei Fragen oder Problemen mit der User-Management Komponente:

1. Überprüfen Sie die Browser-Konsole auf Fehlermeldungen
2. Stellen Sie sicher, dass Sie Administrator-Rechte haben
3. Überprüfen Sie die API-Verfügbarkeit
4. Kontaktieren Sie das Entwicklungsteam

---

**Entwickelt für die Gastro-Anwendung**  
*Version 1.0.0*  
*Letzte Aktualisierung: Januar 2025* 