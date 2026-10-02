import { Injectable } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root',
})
export class PwaService {
  private started = false;

  constructor(private router: Router) {}

  start(): void {
    if (this.started || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }
    this.started = true;

    void navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch((error) => console.error('Service Worker:', error));

    navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | undefined;
      if (data?.type !== 'NAVIGATE' || typeof data.url !== 'string' || !data.url.startsWith('/')) {
        return;
      }
      void this.router.navigateByUrl(data.url);
    });
  }

  clearCachedApi(): void {
    navigator.serviceWorker?.controller?.postMessage('CLEAR_API_CACHE');
  }
}
