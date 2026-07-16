export const environment = {
  production: false,
  // Relative /api — locally proxied via proxy.conf.json → localhost:10000
  // On Capacitor native, main.ts overrides this with nativeApiUrl.
  apiUrl: '',
  nativeApiUrl: 'https://multi-mandant-ecommerce.onrender.com',
};
