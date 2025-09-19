# Environment-Konfiguration

## Übersicht

Das Frontend wurde so konfiguriert, dass es automatisch zwischen verschiedenen Backend-URLs umschaltet, abhängig von der Umgebung:

- **Entwicklung**: `http://localhost:10000`
- **Produktion**: `https://multi-mandant-ecommerce.onrender.com`

## Wie es funktioniert

### 1. Environment-Dateien

```typescript
// src/environments/environment.ts (Entwicklung)
export const environment = {
  production: false,
  apiUrl: 'http://localhost:10000'
};

// src/environments/environment.prod.ts (Produktion)
export const environment = {
  production: true,
  apiUrl: 'https://multi-mandant-ecommerce.onrender.com'
};
```

### 2. Angular-Konfiguration

Die `angular.json` wurde so konfiguriert, dass die richtige Environment-Datei für jeden Build-Typ verwendet wird:

- **Development Build**: Verwendet `environment.ts`
- **Production Build**: Verwendet `environment.prod.ts` (durch fileReplacements)

### 3. Services

Alle Services importieren und verwenden jetzt `environment.apiUrl`:

```typescript
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = `${environment.apiUrl}/api/auth/login`;
  // ...
}
```

## Verwendung

### Lokale Entwicklung

```bash
# Startet das Frontend im Entwicklungsmodus
ng serve

# Oder explizit:
ng serve --configuration=development
```

Das Frontend wird dann Anfragen an `http://localhost:10000` senden.

### Produktion

```bash
# Startet das Frontend im Produktionsmodus
ng serve --configuration=production

# Oder für den Build:
ng build --configuration=production
```

Das Frontend wird dann Anfragen an `https://multi-mandant-ecommerce.onrender.com` senden.

## Vorteile

1. **Automatische Umschaltung**: Kein manuelles Ändern von URLs nötig
2. **Build-spezifisch**: Entwicklung und Produktion verwenden automatisch die richtigen URLs
3. **Zentralisiert**: Alle URLs werden an einer Stelle definiert
4. **Typsicher**: TypeScript-Importe statt String-Literale

## Geänderte Dateien

### Services
- `authentication.service.ts`
- `artikel-data.service.ts`
- `offers.service.ts`
- `order.service.ts`
- `user.service.ts`
- `favorites.service.ts`

### Komponenten
- Alle Komponenten, die direkte HTTP-Aufrufe machen
- `customer-order-public.component.ts`
- `employees.component.ts`
- `customer-orders.component.ts`
- `admin.component.ts`
- `offers.component.ts`
- `product-management.component.ts`
- `category-detail.component.ts`
- `warenkorb.component.ts`
- Und viele weitere...

### Konfiguration
- `angular.json` (fileReplacements hinzugefügt)
- `src/environments/environment.ts` (neu erstellt)
- `src/environments/environment.prod.ts` (neu erstellt)

## Testen

Führen Sie das Test-Skript aus:

```bash
node test-environments.js
```

Oder überprüfen Sie die verwendete URL in der Browser-Konsole - alle API-Aufrufe zeigen die korrekte Basis-URL an.
