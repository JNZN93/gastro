import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gastrodepot.app',
  appName: 'Gastro Kom',
  webDir: 'dist/gastro-kom/browser',
  server: {
    androidScheme: 'https',
  },
};

export default config;
