export const environment = {
  production: true,
  // Relative /api — Vercel rewrites /api/* → Render backend
  // On Capacitor native, main.ts overrides this with nativeApiUrl.
  apiUrl: '',
  nativeApiUrl: 'https://multi-mandant-ecommerce.onrender.com',
};
