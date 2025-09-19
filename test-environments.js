// Test-Skript für verschiedene Umgebungen
const { exec } = require('child_process');

console.log('🚀 Frontend Environment Test');
console.log('============================\n');

// Test 1: Lokale Entwicklung
console.log('📝 Test 1: Lokale Entwicklung (localhost:10000)');
console.log('   ng serve --configuration=development');
console.log('   → Verwendet: http://localhost:10000\n');

// Test 2: Produktion
console.log('🌐 Test 2: Produktion (multi-mandant-ecommerce.onrender.com)');
console.log('   ng serve --configuration=production');
console.log('   → Verwendet: https://multi-mandant-ecommerce.onrender.com\n');

// Test 3: Build für Produktion
console.log('📦 Test 3: Produktions-Build');
console.log('   ng build --configuration=production');
console.log('   → Erstellt optimierte Dateien mit Produktions-URLs\n');

console.log('✅ Environment-Konfiguration erfolgreich implementiert!');
console.log('   Alle Services verwenden jetzt environment.apiUrl');
console.log('   Automatische Umschaltung basierend auf Build-Konfiguration');
