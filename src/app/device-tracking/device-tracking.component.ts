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
  private readonly REFRESH_INTERVAL = 10000; // 10 seconds
  private readonly API_URL = 'https://server.traccar.org/api/positions';
  private readonly USERNAME = 'firat.tasyurdu@gmail.com';
  private readonly PASSWORD = 'oya0oz47';
  
  deviceColors: Map<number, string> = new Map();
  private colorIndex = 0;
  private readonly COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'
  ];

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadPositions();
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
    // Avoid showing loading indicator on background refresh
    if (!this.loading) {
      this.loading = true;
    }
    this.error = null;

    const credentials = btoa(`${this.USERNAME}:${this.PASSWORD}`);
    const headers = new HttpHeaders({
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json'
    });

    this.http.get<PositionData[]>(this.API_URL, { headers }).subscribe({
      next: (data) => {
        this.positions = data;
        this.updateMap();
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading positions:', error);
        this.error = 'Fehler beim Laden der Positionsdaten';
        this.loading = false;
      }
    });
  }

  private setupAutoRefresh(): void {
    this.refreshSubscription = interval(this.REFRESH_INTERVAL).subscribe(() => {
      this.loadPositions();
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

    // Clear existing markers
    this.markers.forEach(marker => {
      this.map.removeLayer(marker);
    });
    this.markers = [];

    // Add new markers
    this.positions.forEach(position => {
      if (position.valid && position.latitude && position.longitude) {
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
    this.loadPositions();
  }

  formatDateTime(dateTime: string): string {
    return new Date(dateTime).toLocaleString('de-DE');
  }

  goBack(): void {
    history.back();
  }
}

