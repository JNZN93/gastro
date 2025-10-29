import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { interval, Subscription } from 'rxjs';

// Leaflet TypeScript Deklarationen
declare var L: any;
declare global {
  interface Window {
    L: any;
  }
}

interface PositionData {
  id: number;
  attributes: {
    priority?: number;
    sat?: number;
    event?: number;
    ignition?: boolean;
    motion?: boolean;
    speed?: number;
    battery?: number;
    [key: string]: any;
  };
  deviceId: number;
  protocol: string;
  serverTime: string;
  deviceTime: string;
  fixTime: string;
  valid: boolean;
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number;
  course: number;
  address: string | null;
  accuracy: number;
  network: any;
  geofenceIds: any;
}

@Component({
  selector: 'app-device-tracking',
  imports: [CommonModule],
  templateUrl: './device-tracking.component.html',
  styleUrl: './device-tracking.component.scss',
})
export class DeviceTrackingComponent implements OnInit, OnDestroy {
  positions: PositionData[] = [];
  map: any = null;
  markers: any[] = [];
  mapInitialized = false;
  loading = false;
  error: string | null = null;
  private refreshSubscription?: Subscription;
  private readonly REFRESH_INTERVAL = 3000; // 3 seconds
  private readonly API_URL = 'https://server.traccar.org/api/positions';
  private readonly DEVICES_URL = 'https://server.traccar.org/api/devices';
  private readonly USERNAME = 'firat.tasyurdu@gmail.com';
  private readonly PASSWORD = 'oya0oz47';
  
  deviceColors: Map<number, string> = new Map();
  private colorIndex = 0;
  private readonly COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'
  ];

  // Mock data für Tests
  useMockData = true;
  mockPositions: PositionData[] = [];
  private baseLocations = [
    { lat: 49.6326, lng: 8.3594, name: 'Worms' },
    { lat: 49.68675, lng: 8.995845, name: 'Bensheim' },
    { lat: 49.4500, lng: 8.5500, name: 'Mannheim' },
    { lat: 49.4870, lng: 8.4660, name: 'Ludwigshafen' },
    { lat: 49.4769, lng: 8.4353, name: 'Heidelberg' }
  ];

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    if (this.useMockData) {
      this.initializeMockData();
    } else {
      this.loadPositions();
    }
    this.setupAutoRefresh();
    this.hideFooter();
  }

  ngOnDestroy(): void {
    this.showFooter();
    this.stopAutoRefresh();
    this.destroyMap();
  }

  private hideFooter(): void {
    const footer = document.querySelector('app-footer');
    if (footer) {
      (footer as HTMLElement).style.display = 'none';
    }
  }

  private showFooter(): void {
    const footer = document.querySelector('app-footer');
    if (footer) {
      (footer as HTMLElement).style.display = '';
    }
  }

  loadPositions(): void {
    // Nur bei initialem Laden den Loading-Indicator anzeigen
    if (this.positions.length === 0) {
      this.loading = true;
    }
    this.error = null;

    const credentials = btoa(`${this.USERNAME}:${this.PASSWORD}`);
    const headers = new HttpHeaders({
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json'
    });

    // Lade alle Positionsdaten
    this.http.get<PositionData[]>(this.API_URL, { headers }).subscribe({
      next: (data) => {
        console.log('Live-Daten vom Traccar-Endpunkt geladen:', data);
        console.log('Anzahl aktiver Geräte mit Positionen:', data.length);
        
        // Lade Geräte-Liste zum Vergleich
        this.http.get<any[]>(this.DEVICES_URL, { headers }).subscribe({
          next: (devices) => {
            console.log(`Gesamtanzahl registrierte Geräte: ${devices.length}`);
            console.log(`Aktive Geräte mit Positionen: ${data.length}`);
            
            // Zeige welche Geräte keine Positionen haben
            const activeDeviceIds = data.map(p => p.deviceId);
            const inactiveDevices = devices.filter(d => !activeDeviceIds.includes(d.id));
            if (inactiveDevices.length > 0) {
              console.log('Geräte ohne aktive Positionen:', inactiveDevices.map(d => ({ id: d.id, name: d.name || 'Unbekannt' })));
            }
          },
          error: (err) => console.error('Fehler beim Laden der Geräte:', err)
        });
        
        this.positions = data;
        this.updateMap();
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading positions from API:', error);
        this.error = 'Fehler beim Laden der Positionsdaten vom Live-Endpunkt';
        this.loading = false;
      }
    });
  }

  private setupAutoRefresh(): void {
    this.refreshSubscription = interval(this.REFRESH_INTERVAL).subscribe(() => {
      if (this.useMockData) {
        this.updateMockPositions();
      } else {
        this.loadPositions();
      }
    });
  }

  private stopAutoRefresh(): void {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
    }
  }

  getDeviceColor(deviceId: number): string {
    if (!this.deviceColors.has(deviceId)) {
      const color = this.COLORS[this.colorIndex % this.COLORS.length];
      this.deviceColors.set(deviceId, color);
      this.colorIndex++;
    }
    return this.deviceColors.get(deviceId) || '#333';
  }

  private initializeMap(): void {
    if (this.mapInitialized) return;
    
    // Check if Leaflet is already loaded
    if (typeof L !== 'undefined') {
      this.createMap();
    } else {
      this.loadLeaflet();
    }
  }

  private loadLeaflet(): void {
    // Load Leaflet CSS
    if (!document.querySelector('link[href*="leaflet.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    // Load Leaflet JS
    if (!window.L) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => {
        this.createMap();
      };
      document.head.appendChild(script);
    }
  }

  private createMap(): void {
    setTimeout(() => {
      const mapContainer = document.getElementById('tracking-map');
      if (!mapContainer) return;
      
      // Remove existing map if any
      if (this.map) {
        this.map.remove();
      }

      // Initialize map
      if (this.positions.length > 0) {
        // Use first position as center if available
        const firstPos = this.positions[0];
        this.map = L.map('tracking-map').setView([firstPos.latitude, firstPos.longitude], 10);
      } else {
        // Default center (can be adjusted)
        this.map = L.map('tracking-map').setView([49.6326, 8.3594], 10);
      }

      // Add OpenStreetMap tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(this.map);

      this.mapInitialized = true;
      this.updateMap();
    }, 100);
  }

  private updateMap(): void {
    if (!this.mapInitialized) {
      this.initializeMap();
      return;
    }

    if (!this.map || this.positions.length === 0) return;

    // Update existing markers instead of clearing them
    if (this.markers.length > 0 && this.positions.length === this.markers.length) {
      this.updateExistingMarkers();
      return;
    }

    // Clear existing markers only if no markers exist yet or count changed
    this.markers.forEach(marker => {
      this.map.removeLayer(marker);
    });
    this.markers = [];

    // Add new markers
    this.positions.forEach(position => {
      // Akzeptiere auch ungültige Positionen, aber nur wenn Koordinaten vorhanden
      if (position.latitude && position.longitude && !isNaN(position.latitude) && !isNaN(position.longitude)) {
        const color = this.getDeviceColor(position.deviceId);
        
        // Create custom icon with color
        const icon = L.divIcon({
          className: 'tracking-marker',
          html: `<div style="background-color: ${color}; border: 2px solid white; width: 24px; height: 24px; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        const marker = L.marker([position.latitude, position.longitude], { 
          icon: icon 
        }).addTo(this.map);

        // Create popup content
        const speedKmh = position.speed * 3.6; // Convert m/s to km/h
        const validIndicator = position.valid ? '🟢' : '🟡';
        const popupContent = `
          <div class="popup-content">
            <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">
              ${validIndicator} Gerät ${position.deviceId}
            </h4>
            <div style="font-size: 12px; line-height: 1.6;">
              ${position.address ? `<p style="margin: 4px 0;"><strong>Adresse:</strong><br>${position.address}</p>` : ''}
              <p style="margin: 4px 0;"><strong>Status:</strong> ${position.valid ? 'Gültig' : 'Ungültig'}</p>
              <p style="margin: 4px 0;"><strong>Geschwindigkeit:</strong> ${speedKmh.toFixed(1)} km/h</p>
              ${position.attributes?.battery ? `<p style="margin: 4px 0;"><strong>Batterie:</strong> ${position.attributes.battery.toFixed(2)}V</p>` : ''}
              ${position.attributes?.sat ? `<p style="margin: 4px 0;"><strong>Satelliten:</strong> ${position.attributes.sat}</p>` : ''}
              ${position.attributes?.ignition !== undefined ? `<p style="margin: 4px 0;"><strong>Zündung:</strong> ${position.attributes.ignition ? '🟢 An' : '🔴 Aus'}</p>` : ''}
              ${position.attributes?.motion !== undefined ? `<p style="margin: 4px 0;"><strong>Bewegung:</strong> ${position.attributes.motion ? '🟢 Ja' : '⚪ Nein'}</p>` : ''}
              <p style="margin: 4px 0;"><strong>Letztes Update:</strong><br>${this.formatDateTime(position.fixTime)}</p>
            </div>
          </div>
        `;

        marker.bindPopup(popupContent);
        this.markers.push(marker);
      }
    });

    // Fit map to show all markers
    if (this.markers.length > 0) {
      const group = new L.featureGroup(this.markers);
      if (group.getBounds().isValid()) {
        this.map.fitBounds(group.getBounds().pad(0.1));
      }
    }

    // Add legend
    this.addLegend();
  }

  private updateExistingMarkers(): void {
    // Update existing markers with new positions
    this.positions.forEach((position, index) => {
      // Akzeptiere auch ungültige Positionen, aber nur wenn Koordinaten vorhanden
      if (position.latitude && position.longitude && !isNaN(position.latitude) && !isNaN(position.longitude)) {
        const marker = this.markers[index];
        if (marker) {
          // Update marker position
          marker.setLatLng([position.latitude, position.longitude]);
          
          // Update popup content
          const speedKmh = position.speed * 3.6;
          const popupContent = `
            <div class="popup-content">
              <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">
                🚗 Gerät ${position.deviceId}
              </h4>
              <div style="font-size: 12px; line-height: 1.6;">
                ${position.address ? `<p style="margin: 4px 0;"><strong>Adresse:</strong><br>${position.address}</p>` : ''}
                <p style="margin: 4px 0;"><strong>Geschwindigkeit:</strong> ${speedKmh.toFixed(1)} km/h</p>
                ${position.attributes?.battery ? `<p style="margin: 4px 0;"><strong>Batterie:</strong> ${position.attributes.battery.toFixed(2)}V</p>` : ''}
                ${position.attributes?.sat ? `<p style="margin: 4px 0;"><strong>Satelliten:</strong> ${position.attributes.sat}</p>` : ''}
                ${position.attributes?.ignition !== undefined ? `<p style="margin: 4px 0;"><strong>Zündung:</strong> ${position.attributes.ignition ? '🟢 An' : '🔴 Aus'}</p>` : ''}
                ${position.attributes?.motion !== undefined ? `<p style="margin: 4px 0;"><strong>Bewegung:</strong> ${position.attributes.motion ? '🟢 Ja' : '⚪ Nein'}</p>` : ''}
                <p style="margin: 4px 0;"><strong>Letztes Update:</strong><br>${this.formatDateTime(position.fixTime)}</p>
              </div>
            </div>
          `;
          marker.setPopupContent(popupContent);
        }
      }
    });
  }

  private addLegend(): void {
    // Remove existing legend if any
    const existingLegend = document.querySelector('.map-legend');
    if (existingLegend) {
      existingLegend.remove();
    }

    if (this.markers.length === 0) return;

    const legend = L.control({ position: 'bottomright' });
    
    legend.onAdd = () => {
      const div = L.DomUtil.create('div', 'map-legend');
      
      const deviceGroups = new Map<number, any>();
      this.positions.forEach(pos => {
        if (!deviceGroups.has(pos.deviceId)) {
          deviceGroups.set(pos.deviceId, {
            deviceId: pos.deviceId,
            color: this.getDeviceColor(pos.deviceId)
          });
        }
      });

      let html = '<div class="legend-header"><strong>Geräte</strong></div>';
      deviceGroups.forEach((group, deviceId) => {
        html += `
          <div class="legend-item">
            <span class="legend-icon" style="background-color: ${group.color};"></span>
            <span>Gerät ${deviceId}</span>
          </div>
        `;
      });
      
      div.innerHTML = html;
      return div;
    };
    
    legend.addTo(this.map);
  }

  private destroyMap(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
      this.mapInitialized = false;
    }
  }

  refresh(): void {
    if (this.useMockData) {
      this.updateMockPositions();
    } else {
      this.loadPositions();
    }
  }

  formatDateTime(dateTime: string): string {
    return new Date(dateTime).toLocaleString('de-DE');
  }

  goBack(): void {
    history.back();
  }

  toggleMockMode(): void {
    this.useMockData = !this.useMockData;
    
    // Marker und Map zurücksetzen
    this.markers.forEach(marker => {
      if (this.map) {
        this.map.removeLayer(marker);
      }
    });
    this.markers = [];
    this.positions = [];
    
    // Neue Daten laden
    if (this.useMockData) {
      this.initializeMockData();
    } else {
      this.loadPositions();
    }
  }

  private initializeMockData(): void {
    console.log('Initialisiere Mock-Daten für Test-Modus');
    this.mockPositions = [];
    
    // Erstelle 4 Dummy-Geräte mit verschiedenen Standorten
    for (let i = 0; i < 4; i++) {
      const baseLoc = this.baseLocations[i % this.baseLocations.length];
      this.mockPositions.push({
        id: 1000 + i,
        attributes: {
          priority: 0,
          sat: 8 + Math.floor(Math.random() * 5),
          event: 240,
          ignition: Math.random() > 0.3,
          motion: Math.random() > 0.2,
          speed: Math.random() * 15, // 0-15 m/s
          battery: 3.8 + Math.random() * 0.5,
          io200: 0,
          io69: 1,
          pdop: 1.2,
          hdop: 0.9,
          power: 0.0,
          io68: 40,
          operator: 26201,
          odometer: 6430,
          distance: 2.5,
          totalDistance: 5603500,
          hours: 743000
        },
        deviceId: 9771 + i,
        protocol: 'teltonika',
        serverTime: new Date().toISOString(),
        deviceTime: new Date().toISOString(),
        fixTime: new Date().toISOString(),
        valid: true,
        latitude: baseLoc.lat + (Math.random() - 0.5) * 0.01,
        longitude: baseLoc.lng + (Math.random() - 0.5) * 0.01,
        altitude: 150 + Math.random() * 100,
        speed: Math.random() * 15,
        course: Math.random() * 360,
        address: `${baseLoc.name} (Testdaten)`,
        accuracy: 0.0,
        network: null,
        geofenceIds: null
      });
    }
    // Setze realistische Start-Geschwindigkeiten für Fahrzeuge
    this.mockPositions.forEach(pos => {
      pos.speed = 5 + Math.random() * 10; // 5-15 m/s = 18-54 km/h
      pos.attributes.motion = pos.speed > 5;
      pos.attributes.ignition = pos.attributes.motion;
    });
    
    this.positions = [...this.mockPositions];
    console.log('Mock-Daten erstellt:', this.positions.length, 'Geräte');
    this.updateMap();
    this.loading = false;
  }

  private updateMockPositions(): void {
    // Simuliere Bewegung der Geräte
    this.mockPositions.forEach(position => {
      // Größere zufällige Änderungen der Position - schnellere Bewegung
      position.latitude += (Math.random() - 0.5) * 0.008; // 4x schneller
      position.longitude += (Math.random() - 0.5) * 0.008; // 4x schneller
      
      // Größere Geschwindigkeitsänderung - realistischer für Fahrzeuge
      position.speed = Math.max(0, position.speed + (Math.random() - 0.5) * 5);
      // Geschwindigkeit zwischen 10-60 km/h halten (realistisch für Stadt/Land)
      position.speed = Math.min(Math.max(position.speed, 2.8), 16.7);
      
      // Aktualisiere Zeitstempel
      const now = new Date();
      position.serverTime = now.toISOString();
      position.deviceTime = now.toISOString();
      position.fixTime = now.toISOString();
      
      // Zufällig Bewegungsstatus ändern
      if (Math.random() > 0.7) {
        position.attributes.motion = !position.attributes.motion;
        if (position.attributes.motion) {
          position.attributes.ignition = true;
        }
      }
      
      // Zufällig Batterie-Status ändern
      if (Math.random() > 0.8 && position.attributes.battery) {
        position.attributes.battery = Math.max(3.5, position.attributes.battery + (Math.random() - 0.5) * 0.1);
      }
      
      // Adresse aktualisieren mit neuen Koordinaten
      position.address = `${this.getNearestLocationName(position.latitude, position.longitude)} (Testdaten)`;
    });
    
    this.positions = [...this.mockPositions];
    this.updateMap();
  }

  private getNearestLocationName(lat: number, lng: number): string {
    let nearest = this.baseLocations[0];
    let minDist = this.calculateDistance(lat, lng, nearest.lat, nearest.lng);
    
    this.baseLocations.forEach(loc => {
      const dist = this.calculateDistance(lat, lng, loc.lat, loc.lng);
      if (dist < minDist) {
        minDist = dist;
        nearest = loc;
      }
    });
    
    return nearest.name;
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Erdradius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

