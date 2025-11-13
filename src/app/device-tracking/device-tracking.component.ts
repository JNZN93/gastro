import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  imports: [CommonModule, FormsModule],
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
  selectedDeviceId: number | null = null;
  private refreshSubscription?: Subscription;
  private readonly REFRESH_INTERVAL = 3000; // 3 seconds
  private readonly API_URL = 'https://server.traccar.org/api/positions';
  private readonly DEVICES_URL = 'https://server.traccar.org/api/devices';
  private readonly ROUTE_URL = 'https://server.traccar.org/api/reports/route';
  private readonly USERNAME = 'firat.tasyurdu@gmail.com';
  private readonly PASSWORD = 'oya0oz47';
  
  // Tab navigation
  activeTab: 'live' | 'route' = 'live';
  
  // Route tracking properties
  availableDevices: any[] = [];
  selectedRouteDeviceId: number | null = null;
  routeFromDate: string = '';
  routeFromTime: string = '';
  routeToDate: string = '';
  routeToTime: string = '';
  routePositions: PositionData[] = [];
  routePolyline: any = null;
  routeMarkers: any[] = [];
  loadingRoute = false;
  routeError: string | null = null;
  
  // Route marker details modal
  showRouteMarkerModal = false;
  selectedRouteMarker: PositionData | null = null;
  selectedRouteMarkerIndex: number = 0;
  selectedRouteMarkerProgress: number = 0;
  
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
    this.loadDevices();
    this.hideFooter();
    
    // Wait for DOM to be ready before initializing map
    setTimeout(() => {
      if (this.activeTab === 'live') {
    if (this.useMockData) {
      this.initializeMockData();
    } else {
      this.loadPositions();
    }
    this.setupAutoRefresh();
      } else {
        // For route tab, initialize map after a delay
        setTimeout(() => {
          this.initializeMapForRoute();
        }, 200);
      }
    }, 100);
  }

  ngOnDestroy(): void {
    this.showFooter();
    this.stopAutoRefresh();
    this.destroyMap();
    this.clearRoute(true);
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
    if (this.mapInitialized && this.map) return;
    
    // Check if Leaflet is already loaded
    if (typeof L !== 'undefined') {
      this.createMapWithRetry();
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
        // Wait a bit for CSS to be applied
        setTimeout(() => {
          this.createMapWithRetry();
        }, 100);
      };
      script.onerror = () => {
        console.error('Fehler beim Laden von Leaflet');
        this.error = 'Fehler beim Laden der Kartenbibliothek';
      };
      document.head.appendChild(script);
    } else {
      // Leaflet already loaded, try to create map
      setTimeout(() => {
        this.createMapWithRetry();
      }, 100);
    }
  }

  private createMapWithRetry(retries: number = 10, delay: number = 200): void {
      const mapContainer = document.getElementById('tracking-map');
    
    if (!mapContainer) {
      if (retries > 0) {
        console.log(`Warte auf Kartencontainer... (${retries} Versuche übrig)`);
        setTimeout(() => {
          this.createMapWithRetry(retries - 1, delay);
        }, delay);
      } else {
        console.error('Kartencontainer konnte nicht gefunden werden');
        this.error = 'Karte konnte nicht initialisiert werden. Bitte Seite neu laden.';
      }
      return;
    }

    // Check if container is visible (not hidden by tab switch)
    const rect = mapContainer.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      if (retries > 0) {
        setTimeout(() => {
          this.createMapWithRetry(retries - 1, delay);
        }, delay);
      }
      return;
    }

    try {
      // Remove existing map if any
      if (this.map) {
        try {
        this.map.remove();
        } catch (e) {
          console.warn('Fehler beim Entfernen der alten Karte:', e);
        }
        this.map = null;
      }

      // Clear container content in case of leftover elements
      mapContainer.innerHTML = '';

      // Initialize map
      let center: [number, number] = [49.6326, 8.3594];
      let zoom = 10;

      if (this.activeTab === 'live' && this.positions.length > 0) {
        const firstPos = this.positions[0];
        if (firstPos.latitude && firstPos.longitude) {
          center = [firstPos.latitude, firstPos.longitude];
        }
      }

      this.map = L.map('tracking-map', {
        preferCanvas: false
      }).setView(center, zoom);

      // Add OpenStreetMap tiles with error handling
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
        errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
      }).addTo(this.map);

      // Wait for map to be ready
      this.map.whenReady(() => {
      this.mapInitialized = true;
        console.log('Karte erfolgreich initialisiert');
        
        if (this.activeTab === 'live') {
      this.updateMap();
        }
        
        // Trigger resize to fix potential rendering issues
        setTimeout(() => {
          if (this.map) {
            this.map.invalidateSize();
          }
    }, 100);
      });

    } catch (error) {
      console.error('Fehler beim Erstellen der Karte:', error);
      this.error = 'Fehler beim Initialisieren der Karte: ' + (error as Error).message;
      this.mapInitialized = false;
      this.map = null;
    }
  }

  private createMap(): void {
    this.createMapWithRetry();
  }

  private updateMap(): void {
    if (!this.mapInitialized || !this.map) {
      this.initializeMap();
      return;
    }

    // Invalidate size to fix rendering issues
    if (this.map) {
      setTimeout(() => {
        if (this.map) {
          this.map.invalidateSize();
        }
      }, 50);
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
      try {
      this.map.remove();
      } catch (e) {
        console.warn('Fehler beim Entfernen der Karte:', e);
      }
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

  selectAndZoomToDevice(position: PositionData): void {
    // Setze ausgewähltes Gerät
    this.selectedDeviceId = position.deviceId;
    
    // Finde den Marker für dieses Gerät
    const markerIndex = this.positions.findIndex(p => p.deviceId === position.deviceId);
    
    if (markerIndex !== -1 && this.markers[markerIndex] && this.map) {
      const marker = this.markers[markerIndex];
      
      // Öffne nur das Popup, ohne zu zoomen
      marker.openPopup();
    }
  }

  isDeviceSelected(deviceId: number): boolean {
    return this.selectedDeviceId === deviceId;
  }

  hasValidCoordinates(position: PositionData): boolean {
    return position.latitude != null && 
           position.longitude != null && 
           !isNaN(position.latitude) && 
           !isNaN(position.longitude);
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

  // Tab navigation
  switchTab(tab: 'live' | 'route'): void {
    this.activeTab = tab;
    this.error = null;
    this.routeError = null;
    
    if (tab === 'live') {
      this.stopAutoRefresh();
      this.clearRoute(true);
      
      // Wait for Angular to render the tab content
      setTimeout(() => {
        // Force map reinitialization for live tracking
        if (this.map) {
          try {
            this.map.remove();
          } catch (e) {
            console.warn('Fehler beim Entfernen der Karte:', e);
          }
          this.map = null;
        }
        this.mapInitialized = false;
        
        // Small delay to ensure DOM is ready
        setTimeout(() => {
          this.initializeMap();
        }, 100);
      }, 50);
      
      if (this.useMockData) {
        this.initializeMockData();
      } else {
        this.loadPositions();
      }
      this.setupAutoRefresh();
    } else {
      this.stopAutoRefresh();
      this.clearLiveData();
      
      // Wait for Angular to render the tab content
      setTimeout(() => {
        // Force map reinitialization for route tracking
        if (this.map) {
          try {
            this.map.remove();
          } catch (e) {
            console.warn('Fehler beim Entfernen der Karte:', e);
          }
          this.map = null;
        }
        this.mapInitialized = false;
        
        // Small delay to ensure DOM is ready
        setTimeout(() => {
          this.initializeMapForRoute();
        }, 100);
      }, 50);
      
      // Always set default dates to today from 00:00 to 23:59 when entering route tab
      const today = new Date();
      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 0, 0);
      
      this.routeFromDate = this.formatDateForInput(todayStart);
      this.routeFromTime = '00:00';
      this.routeToDate = this.formatDateForInput(todayEnd);
      this.routeToTime = '23:59';
    }
  }

  private formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatTimeForInput(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  // Load available devices
  loadDevices(): void {
    const credentials = btoa(`${this.USERNAME}:${this.PASSWORD}`);
    const headers = new HttpHeaders({
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json'
    });

    this.http.get<any[]>(this.DEVICES_URL, { headers }).subscribe({
      next: (devices) => {
        this.availableDevices = devices;
        console.log('Verfügbare Geräte geladen:', devices.length);
      },
      error: (err) => {
        console.error('Fehler beim Laden der Geräte:', err);
        this.availableDevices = [];
      }
    });
  }

  // Load route data
  loadRoute(): void {
    if (!this.selectedRouteDeviceId) {
      this.routeError = 'Bitte wählen Sie ein Gerät aus';
      return;
    }

    if (!this.routeFromDate || !this.routeFromTime || !this.routeToDate || !this.routeToTime) {
      this.routeError = 'Bitte wählen Sie einen vollständigen Zeitraum aus';
      return;
    }

    // Combine date and time
    const fromDateTime = new Date(`${this.routeFromDate}T${this.routeFromTime}:00`);
    const toDateTime = new Date(`${this.routeToDate}T${this.routeToTime}:00`);

    if (isNaN(fromDateTime.getTime()) || isNaN(toDateTime.getTime())) {
      this.routeError = 'Ungültiges Datumsformat';
      return;
    }

    if (fromDateTime >= toDateTime) {
      this.routeError = 'Das Enddatum muss nach dem Startdatum liegen';
      return;
    }

    this.loadingRoute = true;
    this.routeError = null;

    // Format dates in ISO 8601 format
    const fromISO = fromDateTime.toISOString();
    const toISO = toDateTime.toISOString();

    const credentials = btoa(`${this.USERNAME}:${this.PASSWORD}`);
    const headers = new HttpHeaders({
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json'
    });

    // Build query parameters
    const params = {
      deviceId: this.selectedRouteDeviceId.toString(),
      from: fromISO,
      to: toISO
    };

    // Ensure map is initialized before loading route
    if (!this.mapInitialized || !this.map) {
      console.log('Initialisiere Karte vor dem Laden der Route...');
      this.initializeMapForRoute();
    }

    console.log('Lade Route mit Parametern:', params);
    
    this.http.get<any>(this.ROUTE_URL, { 
      headers,
      params: params as any
    }).subscribe({
      next: (data) => {
        console.log('=== ROUTE API RESPONSE ===');
        console.log('Response Type:', typeof data);
        console.log('Is Array:', Array.isArray(data));
        console.log('Data length:', Array.isArray(data) ? data.length : 'N/A');
        console.log('Full Response:', JSON.stringify(data).substring(0, 500));
        
        // Handle different response formats
        let positions: PositionData[] = [];
        
        if (Array.isArray(data)) {
          // Direct array response
          positions = data;
        } else if (data && Array.isArray(data.data)) {
          // Wrapped in data property
          positions = data.data;
        } else if (data && Array.isArray(data.positions)) {
          // Wrapped in positions property
          positions = data.positions;
        } else if (data && typeof data === 'object') {
          // Single object response, wrap in array
          positions = [data];
        } else {
          console.error('Unbekanntes Response-Format:', data);
          this.routeError = 'Unerwartetes Datenformat von der API';
          this.loadingRoute = false;
          return;
        }
        
        console.log('Verarbeitete Positionen:', positions.length);
        if (positions.length > 0) {
          console.log('Erste Position:', JSON.stringify(positions[0], null, 2));
          console.log('Letzte Position:', JSON.stringify(positions[positions.length - 1], null, 2));
          
          // Check if coordinates exist
          const firstPos = positions[0];
          console.log('Erste Position Koordinaten:', {
            latitude: firstPos.latitude,
            longitude: firstPos.longitude,
            hasLat: !!firstPos.latitude,
            hasLng: !!firstPos.longitude
          });
        }
        
        this.routePositions = positions;
        
        // Ensure map is ready before drawing
        if (!this.mapInitialized || !this.map) {
          console.log('Warte auf Karteninitialisierung...');
          setTimeout(() => {
            this.drawRouteWithRetry();
          }, 500);
        } else {
          // Small delay to ensure everything is ready
          setTimeout(() => {
            this.drawRoute();
          }, 100);
        }
        
        this.loadingRoute = false;
      },
      error: (error) => {
        console.error('Fehler beim Laden der Route:', error);
        console.error('Error details:', error.error || error);
        this.routeError = 'Fehler beim Laden der Route. Bitte versuchen Sie es erneut.';
        this.loadingRoute = false;
      }
    });
  }

  // Draw route on map with retry logic
  private drawRouteWithRetry(retries: number = 5): void {
    if (!this.mapInitialized || !this.map) {
      if (retries > 0) {
        console.log(`Warte auf Karte... (${retries} Versuche übrig)`);
        setTimeout(() => {
          this.drawRouteWithRetry(retries - 1);
        }, 300);
      } else {
        console.error('Karte konnte nicht initialisiert werden');
        this.routeError = 'Karte konnte nicht initialisiert werden. Bitte Seite neu laden.';
      }
      return;
    }
    
    this.drawRoute();
  }

  // Draw route on map
  private drawRoute(): void {
    console.log('Zeichne Route...');
    console.log('Karte initialisiert:', this.mapInitialized);
    console.log('Karte vorhanden:', !!this.map);
    console.log('Route-Positionen:', this.routePositions.length);
    
    if (!this.mapInitialized || !this.map) {
      console.warn('Karte nicht initialisiert, versuche es erneut...');
      this.initializeMapForRoute();
      setTimeout(() => {
        if (this.mapInitialized && this.map) {
          this.drawRoute();
        } else {
          this.drawRouteWithRetry();
        }
      }, 500);
      return;
    }

    // Clear existing route layers but keep data
    this.clearRoute(false);

    if (!this.map || this.routePositions.length === 0) {
      return;
    }

    // Filter valid positions - handle different property names
    // Accept positions even if valid: false, as long as coordinates exist
    const validPositions = this.routePositions.filter((pos: any) => {
      // Check for latitude/longitude in different possible formats
      const lat = pos.latitude || pos.lat || pos.y;
      const lng = pos.longitude || pos.lng || pos.lon || pos.x;
      
      const isValid = lat != null && lng != null && 
                     !isNaN(Number(lat)) && !isNaN(Number(lng)) &&
                     // Allow 0,0 coordinates (they might be valid)
                     Number(lat) >= -90 && Number(lat) <= 90 &&
                     Number(lng) >= -180 && Number(lng) <= 180;
      
      if (!isValid && pos) {
        console.warn('Ungültige Position gefunden:', {
          original: pos,
          lat: lat,
          lng: lng
        });
      }
      
      return isValid;
    }).map((pos: any) => {
      // Normalize position data to ensure consistent format
      const normalized = {
        ...pos,
        latitude: pos.latitude || pos.lat || pos.y,
        longitude: pos.longitude || pos.lng || pos.lon || pos.x,
        deviceId: pos.deviceId || pos.device_id || (pos.device && pos.device.id) || this.selectedRouteDeviceId
      } as PositionData;
      
      return normalized;
    });

    console.log('Gültige Positionen:', validPositions.length, 'von', this.routePositions.length);
    
    if (validPositions.length > 0) {
      console.log('Beispiel Position:', {
        lat: validPositions[0].latitude,
        lng: validPositions[0].longitude,
        valid: validPositions[0].valid
      });
    }

    if (validPositions.length === 0) {
      console.error('Keine gültigen Positionen gefunden!');
      this.routeError = 'Keine gültigen Positionsdaten für den ausgewählten Zeitraum gefunden';
      return;
    }

    if (validPositions.length < 2) {
      console.warn('Nur eine Position gefunden, kann keine Route zeichnen');
      this.routeError = 'Zu wenige Positionen für eine Route (mindestens 2 erforderlich)';
      return;
    }

    // Create polyline coordinates
    const latlngs = validPositions.map(pos => [pos.latitude, pos.longitude] as [number, number]);
    
    console.log('Erstelle Polylinie mit', latlngs.length, 'Punkten');
    console.log('Erster Punkt:', latlngs[0]);
    console.log('Letzter Punkt:', latlngs[latlngs.length - 1]);

    // Get device color
    const deviceId = validPositions[0].deviceId;
    
    // Use a nice blue color for routes (different from red)
    const routeColor = '#2563eb'; // Blue-600
    const routeWeight = 5;
    
    console.log('Verwende Farbe:', routeColor, 'für Route von Gerät', deviceId);

    try {
      // Check if Leaflet is available
      if (typeof L === 'undefined') {
        console.error('Leaflet ist nicht verfügbar!');
        this.routeError = 'Kartenbibliothek nicht geladen';
        return;
      }
      
      // Verify map exists and is ready
      if (!this.map) {
        console.error('Karte existiert nicht!');
        this.routeError = 'Karte ist nicht initialisiert';
        return;
      }
      
      console.log('Erstelle Polylinie mit', latlngs.length, 'Punkten auf Karte:', !!this.map);
      
      // Draw polyline with arrow markers to show direction
      this.routePolyline = L.polyline(latlngs, {
        color: routeColor,
        weight: routeWeight,
        opacity: 0.8,
        smoothFactor: 1
      });
      
      // Add to map
      this.routePolyline.addTo(this.map);
      
      console.log('Polylinie erfolgreich erstellt und zur Karte hinzugefügt');
      console.log('Polylinie Layer-ID:', this.routePolyline._leaflet_id);
      
      // Force map update
      this.map.invalidateSize();
      
    } catch (error) {
      console.error('Fehler beim Erstellen der Polylinie:', error);
      console.error('Error stack:', (error as Error).stack);
      this.routeError = 'Fehler beim Zeichnen der Route: ' + (error as Error).message;
      return;
    }

    // Add numbered markers along the route to show progression
    // Calculate how many markers we want (more for longer routes)
    const totalPositions = validPositions.length;
    let markerInterval = Math.max(1, Math.floor(totalPositions / 15)); // Max 15 markers
    if (markerInterval < 1) markerInterval = 1;
    
    console.log(`Erstelle ${Math.floor(totalPositions / markerInterval)} nummerierte Marker mit Intervall ${markerInterval}`);
    
    let markerNumber = 1;
    const markerPositions: { pos: PositionData, index: number, number: number }[] = [];
    
    // Always include start (first position)
    markerPositions.push({ pos: validPositions[0], index: 0, number: markerNumber++ });
    
    // Add markers at regular intervals
    for (let i = markerInterval; i < totalPositions - 1; i += markerInterval) {
      if (markerNumber <= 20) { // Limit to 20 markers max
        markerPositions.push({ pos: validPositions[i], index: i, number: markerNumber++ });
      }
    }
    
    // Always include end (last position) if not already added
    if (markerPositions[markerPositions.length - 1].index !== totalPositions - 1) {
      markerPositions.push({ pos: validPositions[totalPositions - 1], index: totalPositions - 1, number: markerNumber });
    }
    
    // Create markers
    markerPositions.forEach(({ pos, index, number }) => {
      const progress = Math.round((index / (totalPositions - 1)) * 100);
      const isStart = number === 1;
      const isEnd = number === markerPositions.length;
      
      // Different colors for start/end
      let backgroundColor = '#3b82f6'; // Blue
      let size = 26;
      
      if (isStart) {
        backgroundColor = '#10b981'; // Green
        size = 28;
      } else if (isEnd) {
        backgroundColor = '#ef4444'; // Red
        size = 28;
      }
      
      const icon = L.divIcon({
        className: 'route-marker',
        html: `<div style="background-color: ${backgroundColor}; border: 3px solid white; width: ${size}px; height: ${size}px; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: ${isStart || isEnd ? '14px' : '12px'};">${number}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
      });
      
      const marker = L.marker([pos.latitude, pos.longitude], { icon: icon });
      
      // Store position data in marker for modal
      (marker as any).routePositionData = pos;
      (marker as any).routeMarkerIndex = index;
      (marker as any).routeMarkerNumber = number;
      (marker as any).routeMarkerProgress = progress;
      
      // Add click handler to show modal
      marker.on('click', () => {
        this.showMarkerDetails(pos, index, number, progress);
      });
      
      marker.addTo(this.map);
      
      // Simple popup on hover
      const label = isStart ? 'Start' : isEnd ? 'Ende' : `Station ${number}`;
      marker.bindPopup(`${label}<br>${progress}% der Route`);
      
      this.routeMarkers.push(marker);
    });
    
    console.log(`${this.routeMarkers.length} Marker erstellt`);

    // Fit map to show entire route
    if (this.routePolyline) {
      try {
        const bounds = this.routePolyline.getBounds();
        console.log('Route-Grenzen:', bounds);
        
        if (bounds.isValid()) {
          console.log('Passe Kartenansicht an Route an...');
          this.map.fitBounds(bounds.pad(0.1));
          
          // Invalidate size after fitting bounds to ensure proper rendering
          setTimeout(() => {
            if (this.map) {
              this.map.invalidateSize();
              console.log('Kartengröße aktualisiert');
            }
          }, 100);
        } else {
          console.warn('Ungültige Grenzen für Route');
        }
      } catch (error) {
        console.error('Fehler beim Anpassen der Kartenansicht:', error);
      }
    }
    
    console.log('Route erfolgreich gezeichnet!');
  }

  private initializeMapForRoute(): void {
    if (this.mapInitialized && this.map && this.activeTab === 'route') {
      // Map already initialized for route tab, just invalidate size
      setTimeout(() => {
        if (this.map) {
          this.map.invalidateSize();
        }
      }, 100);
      return;
    }
    
    // Reset initialization flag if switching tabs
    if (this.activeTab === 'route') {
      this.mapInitialized = false;
    }
    
    if (typeof L !== 'undefined') {
      this.createMapWithRetry();
    } else {
      this.loadLeaflet();
    }
  }

  private clearRoute(resetPositions: boolean = false): void {
    // Remove polyline
    if (this.routePolyline && this.map) {
      this.map.removeLayer(this.routePolyline);
      this.routePolyline = null;
    }

    // Remove markers
    this.routeMarkers.forEach(marker => {
      if (this.map) {
        this.map.removeLayer(marker);
      }
    });
    this.routeMarkers = [];
    
    if (resetPositions) {
      this.routePositions = [];
    }
  }

  private clearLiveData(): void {
    // Clear live tracking markers
    this.markers.forEach(marker => {
      if (this.map) {
        this.map.removeLayer(marker);
      }
    });
    this.markers = [];
    this.positions = [];
  }

  // Show marker details modal
  showMarkerDetails(position: PositionData, index: number, markerNumber: number, progress: number): void {
    this.selectedRouteMarker = position;
    this.selectedRouteMarkerIndex = index;
    this.selectedRouteMarkerProgress = progress;
    this.showRouteMarkerModal = true;
  }

  // Close marker details modal
  closeMarkerModal(): void {
    this.showRouteMarkerModal = false;
    this.selectedRouteMarker = null;
  }

  // Calculate distance between two positions
  calculateDistanceBetweenPositions(pos1: PositionData, pos2: PositionData): number {
    return this.calculateDistance(pos1.latitude, pos1.longitude, pos2.latitude, pos2.longitude);
  }

  // Get time difference
  getTimeDifference(startTime: string, endTime: string): string {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffMs = end.getTime() - start.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const diffSeconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    
    if (diffHours > 0) {
      return `${diffHours}h ${diffMinutes}m`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes}m ${diffSeconds}s`;
    } else {
      return `${diffSeconds}s`;
    }
  }

  // Get selected marker number for display
  getSelectedMarkerNumber(): number {
    if (!this.selectedRouteMarker) return 0;
    
    const markerIndex = this.routeMarkers.findIndex((m: any) => 
      m.routePositionData === this.selectedRouteMarker
    );
    
    if (markerIndex >= 0 && (this.routeMarkers[markerIndex] as any).routeMarkerNumber) {
      return (this.routeMarkers[markerIndex] as any).routeMarkerNumber;
    }
    
    // Fallback to index-based numbering
    return this.selectedRouteMarkerIndex + 1;
  }
}

