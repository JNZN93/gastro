# Android App (Capacitor) — Hardware-Scanner

Die Web-App bleibt unverändert. Zusätzlich gibt es eine Android-APK für Handhelds mit eingebautem Barcode-Scanner (Keyboard-Wedge).

## APK bauen (GitHub Actions)

1. Code ins Frontend-Repo pushen (Branch `main`) **oder** Actions → **Build Android APK** → **Run workflow**
2. Nach dem Lauf: Artifact **`gastro-kom-debug-apk`** herunterladen
3. Datei `app-debug.apk` auf das Handheld kopieren und installieren  
   („Unbekannte Quellen“ / „Apps aus dieser Quelle zulassen“ aktivieren)

Lokal (optional, braucht Android SDK/Java):

```bash
npm run build:android
cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

## Handheld einrichten

1. Scanner-Einstellungen auf **Keyboard / Keystroke / Wedge** stellen (herstellerspezifisch; oft Default)
2. App öffnen → Login → **Picking** öffnen
3. EAN-Feld ist fokussiert — gelbe Scan-Taste drücken
4. Scan tippt EAN + Enter → Position wird gebucht

Kein Kamera-Dialog: der Kamera-Scanner-Button ist in der Native-App ausgeblendet.

## Web vs. Native

| Target | API | Kamera-Scanner |
|--------|-----|----------------|
| Browser / Vercel | relative `/api` (Proxy) | sichtbar |
| Capacitor Android | `https://multi-mandant-ecommerce.onrender.com` | ausgeblendet |

## Tipps

- Scan-Flow im Browser testen: EAN tippen + Enter im Picking-Feld
- Emulator hat keinen Hardware-Scanner — nur echtes Gerät
- App-ID: `com.gastrodepot.app`
