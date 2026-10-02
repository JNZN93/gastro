import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { PwaService } from './pwa.service';

const ENABLED_KEY = 'gastro.pushEnabled';

export type PushUiStatus = 'on' | 'off' | 'denied' | 'unsupported' | 'ios-install' | 'missing-key';

@Injectable({
  providedIn: 'root',
})
export class WebPushService {
  constructor(
    private http: HttpClient,
    private pwa: PwaService
  ) {}

  isEnabledPref(): boolean {
    try {
      return localStorage.getItem(ENABLED_KEY) === '1';
    } catch {
      return false;
    }
  }

  async status(): Promise<PushUiStatus> {
    if (this.isIos() && !this.isStandalone()) {
      return 'ios-install';
    }
    if (!this.canUse()) {
      return 'unsupported';
    }
    if (Notification.permission === 'denied') {
      return 'denied';
    }
    const registration = await this.registration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription && Notification.permission === 'granted' && this.isEnabledPref()) {
      return 'on';
    }
    return 'off';
  }

  async enable(): Promise<void> {
    if (this.isIos() && !this.isStandalone()) {
      throw new Error('Auf dem iPhone zuerst zum Home-Bildschirm hinzufügen und die App von dort öffnen.');
    }
    if (!this.canUse()) {
      throw new Error('Push wird hier nicht unterstützt. Auf Android Chrome öffnen und zum Home-Bildschirm hinzufügen.');
    }
    const vapidPublicKey = await this.fetchVapidPublicKey();
    if (!vapidPublicKey) {
      throw new Error('Push ist auf dem Server noch nicht eingerichtet.');
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Mitteilungen wurden nicht erlaubt.');
    }
    const registration = await this.waitUntilControlled();
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
    }
    await this.postSubscription(subscription);
    localStorage.setItem(ENABLED_KEY, '1');
    try {
      await registration.showNotification('Mitteilungen an', {
        body: 'Wenn eine Bestellung freigegeben wird, kommt die Nachricht auf dieses Gerät.',
        icon: '/logo.webp',
        tag: 'push-enabled',
        lang: 'de',
      });
    } catch {
      /* Test-Hinweis ist optional */
    }
  }

  async refreshIfEnabled(): Promise<void> {
    try {
      if (!this.isEnabledPref() || !this.canUse() || Notification.permission !== 'granted') {
        return;
      }
      const vapidPublicKey = await this.fetchVapidPublicKey();
      if (!vapidPublicKey) {
        return;
      }
      const registration = await this.registration();
      if (!registration) {
        return;
      }
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: this.urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
        });
      }
      await this.postSubscription(subscription);
    } catch {
      /* Kommissionierung soll auch ohne Push laden */
    }
  }

  async disable(): Promise<void> {
    const token = localStorage.getItem('token');
    const registration = await this.registration();
    const subscription = await registration?.pushManager.getSubscription();
    const endpoint = subscription?.endpoint;
    await subscription?.unsubscribe();
    localStorage.removeItem(ENABLED_KEY);
    this.pwa.clearCachedApi();
    if (!token || !endpoint) {
      return;
    }
    try {
      await firstValueFrom(
        this.http.post(
          `${environment.apiUrl}/api/push/unsubscribe`,
          { endpoint },
          { headers: this.headers(token) }
        )
      );
    } catch {
      /* lokales Abo ist bereits weg */
    }
  }

  private async postSubscription(subscription: PushSubscription): Promise<void> {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Bitte zuerst anmelden.');
    }
    const json = subscription.toJSON();
    await firstValueFrom(
      this.http.post(
        `${environment.apiUrl}/api/push/subscribe`,
        {
          subscription: json,
          deviceLabel: this.deviceLabel(),
        },
        { headers: this.headers(token) }
      )
    );
  }

  private headers(token: string): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });
  }

  private async fetchVapidPublicKey(): Promise<string | null> {
    try {
      const health = await firstValueFrom(
        this.http.get<{ vapidPublicKey?: string | null }>(`${environment.apiUrl}/api/health`)
      );
      return health?.vapidPublicKey?.trim() || null;
    } catch {
      return null;
    }
  }

  private async registration(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) {
      return null;
    }
    try {
      const existing = await navigator.serviceWorker.getRegistration();
      const registration =
        existing ?? (await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }));
      await navigator.serviceWorker.ready;
      return registration;
    } catch {
      return null;
    }
  }

  private async waitUntilControlled(): Promise<ServiceWorkerRegistration> {
    const registration = await this.registration();
    if (!registration) {
      throw new Error('Service Worker ist nicht bereit.');
    }
    if (navigator.serviceWorker.controller) {
      return registration;
    }
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
      window.setTimeout(() => resolve(), 4000);
    });
    return (await this.registration()) ?? registration;
  }

  private canUse(): boolean {
    return (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window
    );
  }

  private isIos(): boolean {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }

  private isStandalone(): boolean {
    const nav = navigator as Navigator & { standalone?: boolean };
    return (
      window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches ||
      nav.standalone === true
    );
  }

  private deviceLabel(): string {
    const ua = navigator.userAgent;
    if (/Android/i.test(ua)) {
      return 'Android';
    }
    if (/iPhone|iPad|iPod/i.test(ua)) {
      return 'iPhone';
    }
    return 'Browser';
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) {
      output[i] = raw.charCodeAt(i);
    }
    return new Uint8Array(output);
  }
}
