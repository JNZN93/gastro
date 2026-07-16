import { bootstrapApplication } from '@angular/platform-browser';
import { Capacitor } from '@capacitor/core';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { environment } from './environments/environment';

registerLocaleData(localeDe);

// Capacitor WebView has no Vercel/dev proxy — call the backend directly.
if (Capacitor.isNativePlatform() && environment.nativeApiUrl) {
  environment.apiUrl = environment.nativeApiUrl;
}

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
