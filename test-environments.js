// Hinweis zur API-URL-Konfiguration (Proxy / Vercel Rewrite)
console.log('🚀 Frontend API routing');
console.log('========================\n');

console.log('📝 Lokal (ng serve)');
console.log('   apiUrl = "" → Requests an /api/*');
console.log('   proxy.conf.json → http://localhost:10000\n');

console.log('🌐 Produktion (Vercel)');
console.log('   apiUrl = "" → Requests an /api/*');
console.log('   vercel.json rewrite → https://multi-mandant-ecommerce.onrender.com\n');

console.log('✅ Kein manuelles Umschalten der API-URL nötig.');
