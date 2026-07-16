import { Capacitor } from '@capacitor/core';

/** True when running inside a Capacitor native shell (Android/iOS). */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** Camera barcode UI is for web only; handhelds use the hardware scanner. */
export function showCameraScanner(): boolean {
  return !isNativeApp();
}
