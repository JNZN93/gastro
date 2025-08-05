import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpClientModule } from '@angular/common/http';
import { Router } from '@angular/router';

// Leaflet TypeScript Deklarationen
declare var L: any;
declare global {
  interface Window {
    L: any;
  }
}

interface Customer {
  id: number;
  name: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  // Zusätzliche Felder aus der API
  last_name_company?: string;
  name_addition?: string;
  street?: string;
  email?: string;
  phone?: string;
  customer_number?: string;
  selected?: boolean;
}

interface CustomerConstraint {
  customerId: number;
  customerName: string;
  timeWindowStart: string;
  timeWindowEnd: string;
  priority: number; // 1 = höchste Priorität, 5 = niedrigste
  stayDuration: number; // Aufenthaltsdauer in Minuten
}

interface RouteWaypoint {
  location: [number, number]; // [longitude, latitude]
  name: string;
  customerId: number;
}

// RouteResponse Interface wurde entfernt, da wir die echte API-Struktur verwenden

@Component({
  selector: 'app-route-planning',
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './route-planning.component.html',
  styleUrl: './route-planning.component.scss',
})
export class RoutePlanningComponent implements OnInit, OnDestroy, AfterViewInit {
  customers: Customer[] = [];
  filteredCustomers: Customer[] = [];
  selectedCustomers: Customer[] = [];
  searchTerm: string = '';
  isLoading: boolean = false;
  isLoadingCustomers: boolean = false;
  routeData: any = null;
  totalDistance: number = 0;
  totalDuration: number = 0;
  routeSteps: any[] = [];
  showRoute: boolean = false;
  optimalOrder: any[] = [];
  waypoints: RouteWaypoint[] = [];
  showMap: boolean = false;
  map: any = null;
  startTime: string = '';
  endTime: Date | null = null;
  
  // Neue Eigenschaften für das Modal
  showConstraintsModal: boolean = false;
  customerConstraints: CustomerConstraint[] = [];
  isSettingConstraints: boolean = false;
  
  // OpenRoute Service API Key
  private readonly OPENROUTE_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImQ4N2IyM2NjZTA1NTQyNTNiNDZmODhhZmQ1NDE1NDBhIiwiaCI6Im11cm11cjY0In0=';
  private readonly OPENROUTE_API_URL = 'https://api.openrouteservice.org/v2/directions/driving-car';
  private readonly OPENROUTE_OPTIMIZATION_URL = 'https://api.openrouteservice.org/optimization/v2/driving-car';
  
  // Fester Startpunkt: Im Winkel 6, 67547 Worms
  private readonly START_LOCATION: [number, number] = [8.3594, 49.6326]; // Koordinaten für Worms

  constructor(
    private http: HttpClient,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadCustomers();
    this.hideFooter();
    this.startTime = this.getCurrentTime();
  }

  ngOnDestroy(): void {
    this.showFooter();
    this.destroyMap();
  }

  private hideFooter(): void {
    const footer = document.querySelector('app-footer');
    if (footer) {
      (footer as HTMLElement).style.display = 'none';
    }
  }

  private   showFooter(): void {
    const footer = document.querySelector('app-footer');
    if (footer) {
      (footer as HTMLElement).style.display = '';
    }
  }

  ngAfterViewInit(): void {
    // Map wird später initialisiert
  }

  toggleMap(): void {
    this.showMap = !this.showMap;
    if (this.showMap && this.optimalOrder.length > 0) {
      setTimeout(() => {
        this.initializeMap();
      }, 100);
    } else if (!this.showMap && this.map) {
      // Map zerstören beim Ausblenden
      this.map.remove();
      this.map = null;
    }
  }

  private initializeMap(): void {
    // Leaflet Map initialisieren
    if (typeof L !== 'undefined') {
      this.createMap();
    } else {
      // Leaflet CSS und JS laden
      this.loadLeaflet();
    }
  }

  private destroyMap(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  private loadLeaflet(): void {
    // Leaflet CSS laden
    if (!document.querySelector('link[href*="leaflet.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    // Leaflet JS laden
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
    const mapContainer = document.getElementById('route-map');
    if (!mapContainer) return;
    
    // Bestehende Map entfernen falls vorhanden
    if (this.map) {
      this.map.remove();
      this.map = null;
    }

    // Map initialisieren (Koordinaten umkehren: [lng, lat] -> [lat, lng])
    const initialCoords: [number, number] = [this.START_LOCATION[1], this.START_LOCATION[0]];
    this.map = L.map('route-map').setView(initialCoords, 10);

    // OpenStreetMap Tiles hinzufügen
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    // Custom Icons erstellen
    const startIcon = L.divIcon({
      className: 'custom-marker start-marker',
      html: '<div class="marker-content">🏢<br><span class="marker-label">Gastro Depot</span></div>',
      iconSize: [40, 60],
      iconAnchor: [20, 60]
    });

    const customerIcon = (number: number, companyName: string) => L.divIcon({
      className: 'custom-marker customer-marker',
      html: `<div class="marker-content">${number}<br><span class="marker-label">${companyName}</span></div>`,
      iconSize: [40, 60],
      iconAnchor: [20, 60]
    });

    // Startpunkt markieren (Koordinaten umkehren: [lng, lat] -> [lat, lng])
    const startCoords: [number, number] = [this.START_LOCATION[1], this.START_LOCATION[0]];
    const startMarker = L.marker(startCoords, { icon: startIcon })
      .addTo(this.map)
      .bindPopup(`
        <div class="popup-content">
          <h4>🏢 Gastro Depot</h4>
          <p><strong>Adresse:</strong><br>Im Winkel 6<br>67547 Worms</p>
          <p><strong>Status:</strong> Ausgangspunkt für alle Touren</p>
        </div>
      `);

    // Kundenstandorte markieren (Koordinaten umkehren: [lng, lat] -> [lat, lng])
    const customerMarkers: any[] = [];
    this.optimalOrder.forEach((stop, index) => {
      const waypoint = this.waypoints.find(wp => wp.customerId === stop.customer.id);
      if (waypoint) {
        const customerCoords: [number, number] = [waypoint.location[1], waypoint.location[0]];
        const marker = L.marker(customerCoords, { icon: customerIcon(index + 1, stop.name) })
          .addTo(this.map)
          .bindPopup(`
            <div class="popup-content">
              <h4>📍 ${index + 1}. ${stop.name}</h4>
              <p><strong>Adresse:</strong><br>${stop.address}</p>
              ${stop.customerNumber ? `<p><strong>Kundennummer:</strong> ${stop.customerNumber}</p>` : ''}
              <p><strong>Reihenfolge:</strong> Stopp ${index + 1} von ${this.optimalOrder.length}</p>
              <p><strong>Ankunft:</strong> ${this.formatTime(stop.arrivalTime)}</p>
              ${stop.stayDuration > 0 ? `<p><strong>Aufenthalt:</strong> ${stop.stayDuration} min</p>` : ''}
            </div>
          `);
        customerMarkers.push(marker);
      }
    });

    // Route-Linie zeichnen (falls verfügbar) - Koordinaten umkehren: [lng, lat] -> [lat, lng]
    if (this.routeData && this.routeData.routes && this.routeData.routes[0].geometry) {
      const routeGeometry = this.routeData.routes[0].geometry;
      if (routeGeometry.coordinates) {
        const routeCoords = routeGeometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]]);
        const routeLine = L.polyline(routeCoords, {
          color: '#667eea',
          weight: 6,
          opacity: 0.9,
          dashArray: '10, 5'
        }).addTo(this.map);

        // Route-Beschriftung hinzufügen
        const routeLabel = L.tooltip({
          permanent: true,
          direction: 'center',
          className: 'route-label'
        }).setContent('🚗 Optimale Route');

        // Label in der Mitte der Route platzieren
        const midPoint = Math.floor(routeCoords.length / 2);
        if (routeCoords[midPoint]) {
          routeLine.bindTooltip(routeLabel).openTooltip();
        }
      }
    }

    // Verbindungslinien entfernt

    // Route-Pfeile für Richtung hinzufügen
    this.addRouteArrows();

    // Map auf alle Marker zoomen
    const group = new L.featureGroup([startMarker, ...customerMarkers]);
    if (group.getBounds().isValid()) {
      this.map.fitBounds(group.getBounds().pad(0.1));
    } else {
      // Fallback: Auf Startpunkt zoomen wenn keine gültigen Bounds
      this.map.setView(initialCoords, 12);
    }

    // Legende hinzufügen
    this.addLegend();
  }

  private addRouteArrows(): void {
    if (!this.routeData || !this.routeData.routes || !this.routeData.routes[0].geometry) return;

    const coordinates = this.routeData.routes[0].geometry.coordinates;
    if (coordinates.length < 2) return;

    // Pfeile alle 5 Koordinaten hinzufügen (Koordinaten umkehren: [lng, lat] -> [lat, lng])
    for (let i = 5; i < coordinates.length - 5; i += 5) {
      const current = coordinates[i];
      const next = coordinates[i + 1];
      
      if (current && next) {
        const angle = Math.atan2(next[1] - current[1], next[0] - current[0]) * 180 / Math.PI;
        
        const arrowIcon = L.divIcon({
          className: 'route-arrow',
          html: '➡️',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });

        // Koordinaten umkehren: [lng, lat] -> [lat, lng]
        const arrowCoords: [number, number] = [current[1], current[0]];
        L.marker(arrowCoords, { icon: arrowIcon })
          .addTo(this.map)
          .setRotationAngle(angle);
      }
    }
  }

  // drawConnectionLines Methode entfernt

  private addLegend(): void {
    const legend = L.control({ position: 'bottomright' });
    
    legend.onAdd = () => {
      const div = L.DomUtil.create('div', 'map-legend');
      div.innerHTML = `
        <h4>Legende</h4>
        <div class="legend-item">
          <span class="legend-icon start-icon">🏢</span>
          <span>Gastro Depot</span>
        </div>
        <div class="legend-item">
          <span class="legend-icon customer-icon">1</span>
          <span>Firmenstandorte</span>
        </div>
        <div class="legend-item">
          <span class="legend-icon route-icon">🚗</span>
          <span>Optimale Route</span>
        </div>
        <div class="legend-item">
          <span class="legend-icon route-icon">🚗</span>
          <span>Optimale Route</span>
        </div>
      `;
      return div;
    };
    
    legend.addTo(this.map);
  }

  loadCustomers() {
    this.isLoadingCustomers = true;
    const token = localStorage.getItem('token');
    
    fetch('https://multi-mandant-ecommerce.onrender.com/api/customers', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Fehler beim Laden der Kunden');
      }
      return response.json();
    })
    .then(data => {
      this.customers = data.map((customer: any) => ({
        ...customer,
        selected: false
      }));
      this.filteredCustomers = [...this.customers];
      this.isLoadingCustomers = false;
    })
    .catch(error => {
      console.error('Fehler beim Laden der Kunden:', error);
      this.isLoadingCustomers = false;
    });
  }

  filterCustomers() {
    if (!this.searchTerm.trim()) {
      this.filteredCustomers = [...this.customers];
    } else {
      // Normalisiere Suchbegriff: Leerzeichen entfernen, Kleinbuchstaben, Umlaute normalisieren
      const normalizedSearchTerm = this.normalizeSearchTerm(this.searchTerm);
      
      this.filteredCustomers = this.customers.filter(customer => {
        // Normalisiere alle Kundendaten für den Vergleich
        const normalizedName = this.normalizeSearchTerm(customer.name || '');
        const normalizedAddress = this.normalizeSearchTerm(customer.address || '');
        const normalizedCity = this.normalizeSearchTerm(customer.city || '');
        const normalizedPostalCode = this.normalizeSearchTerm(customer.postal_code || '');
        const normalizedCountry = this.normalizeSearchTerm(customer.country || '');
        const normalizedCompany = this.normalizeSearchTerm(customer.last_name_company || '');
        const normalizedAddition = this.normalizeSearchTerm(customer.name_addition || '');
        const normalizedStreet = this.normalizeSearchTerm(customer.street || '');
        const normalizedEmail = this.normalizeSearchTerm(customer.email || '');
        const normalizedPhone = this.normalizeSearchTerm(customer.phone || '');
        const normalizedCustomerNumber = this.normalizeSearchTerm(customer.customer_number || '');
        
        // Direkte Übereinstimmung
        const directMatches = 
          normalizedName.includes(normalizedSearchTerm) ||
          normalizedAddress.includes(normalizedSearchTerm) ||
          normalizedCity.includes(normalizedSearchTerm) ||
          normalizedPostalCode.includes(normalizedSearchTerm) ||
          normalizedCountry.includes(normalizedSearchTerm) ||
          normalizedCompany.includes(normalizedSearchTerm) ||
          normalizedAddition.includes(normalizedSearchTerm) ||
          normalizedStreet.includes(normalizedSearchTerm) ||
          normalizedEmail.includes(normalizedSearchTerm) ||
          normalizedPhone.includes(normalizedSearchTerm) ||
          normalizedCustomerNumber.includes(normalizedSearchTerm);
        
        // Wort-für-Wort Suche (mehr Toleranz)
        const wordMatches = 
          this.hasWordMatch(normalizedName, normalizedSearchTerm) ||
          this.hasWordMatch(normalizedCompany, normalizedSearchTerm) ||
          this.hasWordMatch(normalizedAddress, normalizedSearchTerm) ||
          this.hasWordMatch(normalizedCity, normalizedSearchTerm);
        
        return directMatches || wordMatches;
      });
    }
  }

  // Normalisiert Suchbegriffe für bessere Toleranz
  private normalizeSearchTerm(term: string): string {
    return term
      .toLowerCase()
      .trim()
      // Mehrere Leerzeichen durch ein Leerzeichen ersetzen
      .replace(/\s+/g, ' ')
      // Umlaute normalisieren
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      // Sonderzeichen entfernen (außer Leerzeichen und Bindestriche)
      .replace(/[^a-z0-9\s\-]/g, '')
      // Mehrere Bindestriche durch einen ersetzen
      .replace(/-+/g, '-');
  }

  // Prüft, ob Suchbegriff in einzelnen Wörtern enthalten ist
  private hasWordMatch(text: string, searchTerm: string): boolean {
    if (!text || !searchTerm) return false;
    
    const words = text.split(/\s+/);
    const searchWords = searchTerm.split(/\s+/);
    
    // Jedes Suchwort muss in mindestens einem Textwort enthalten sein
    return searchWords.every(searchWord => 
      words.some(word => word.includes(searchWord))
    );
  }

  toggleCustomerSelection(customer: Customer) {
    customer.selected = !customer.selected;
    this.updateSelectedCustomers();
  }

  updateSelectedCustomers() {
    this.selectedCustomers = this.customers.filter(customer => customer.selected);
  }

  selectAllCustomers() {
    this.filteredCustomers.forEach(customer => {
      customer.selected = true;
    });
    this.updateSelectedCustomers();
  }

  deselectAllCustomers() {
    this.customers.forEach(customer => {
      customer.selected = false;
    });
    this.updateSelectedCustomers();
  }

  openConstraintsModal(): void {
    // Constraints für alle ausgewählten Kunden initialisieren
    this.customerConstraints = this.selectedCustomers.map(customer => ({
      customerId: customer.id,
      customerName: customer.last_name_company || customer.name,
      timeWindowStart: '', // Leer - kein Standard-Zeitfenster
      timeWindowEnd: '',   // Leer - kein Standard-Zeitfenster
      priority: 3, // Standard-Priorität
      stayDuration: 15 // Standard-Aufenthaltsdauer
    }));
    
    this.showConstraintsModal = true;
  }

  closeConstraintsModal(): void {
    this.showConstraintsModal = false;
  }

  async startRouteWithConstraints(): Promise<void> {
    this.closeConstraintsModal();
    await this.calculateRouteWithConstraints();
  }

  getCustomerNumber(customerId: number): string | undefined {
    const customer = this.selectedCustomers.find(c => c.id === customerId);
    return customer?.customer_number;
  }

  resetTimeWindow(constraint: CustomerConstraint): void {
    constraint.timeWindowStart = '';
    constraint.timeWindowEnd = '';
  }

  async calculateRoute() {
    if (this.selectedCustomers.length < 1) {
      alert('Bitte wählen Sie mindestens 1 Kunden aus.');
      return;
    }

    // Bei mehreren Kunden: Modal für Constraints öffnen
    if (this.selectedCustomers.length > 1) {
      this.openConstraintsModal();
      return;
    }

    // Bei einem Kunden: Direkt Route berechnen
    await this.calculateRouteWithConstraints();
  }

  async calculateRouteWithConstraints(): Promise<void> {
    this.isLoading = true;
    this.showRoute = false;

    try {
      // Geocoding für alle ausgewählten Kunden
      const waypoints: RouteWaypoint[] = [];
      
      const failedCustomers: string[] = [];
      
      for (const customer of this.selectedCustomers) {
        const customerName = customer.last_name_company || customer.name;
        const address = `${customer.street || customer.address}, ${customer.postal_code} ${customer.city}`;
        console.log(`Geocoding für: ${customerName} - ${address}`);
        
        const coordinates = await this.geocodeAddress(customer);
        if (coordinates) {
          console.log(`Koordinaten gefunden: ${coordinates[0]}, ${coordinates[1]}`);
          waypoints.push({
            location: coordinates,
            name: customerName,
            customerId: customer.id
          });
        } else {
          console.warn(`Keine Koordinaten gefunden für: ${customerName} - ${address}`);
          failedCustomers.push(`${customerName} (${address})`);
        }
      }

      // Warnung anzeigen wenn Kunden nicht geocodiert werden konnten
      if (failedCustomers.length > 0) {
        const warningMessage = `Folgende Kunden konnten nicht geocodiert werden:\n${failedCustomers.join('\n')}\n\nDiese werden von der Routenberechnung ausgeschlossen.`;
        console.warn(warningMessage);
        alert(warningMessage);
      }

      this.waypoints = waypoints;

      if (waypoints.length < 1) {
        alert('Konnte keine Adressen geocodieren. Bitte überprüfen Sie die Adressen der ausgewählten Kunden.');
        this.isLoading = false;
        return;
      }

      console.log(`Route berechnen für ${waypoints.length} Wegpunkte:`, waypoints);

      // Route berechnen - bei nur einem Kunden normale Directions API verwenden
      let route;
      if (waypoints.length === 1) {
        route = await this.calculateSingleCustomerRoute(waypoints[0]);
      } else {
        route = await this.calculateOptimalRouteWithConstraints(waypoints);
      }
      
      if (route) {
        console.log('Route erfolgreich berechnet:', route);
        this.routeData = route;
        this.calculateRouteStats(route);
        this.showRoute = true;
      }

    } catch (error) {
      console.error('Fehler bei der Routenberechnung:', error);
      alert(`Fehler bei der Routenberechnung: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
    } finally {
      this.isLoading = false;
    }
  }

  private async geocodeAddress(customer: Customer): Promise<[number, number] | null> {
    const street = customer.street || customer.address;
    const postalCode = customer.postal_code;
    const city = customer.city;
    const country = customer.country || 'Deutschland';
    
    // Verschiedene Adressformate versuchen
    const addressAttempts = [
      `${street}, ${postalCode} ${city}, ${country}`,
      `${street}, ${city}, ${country}`,
      `${street} ${postalCode}, ${city}, ${country}`,
      `${street}, ${city} ${postalCode}, ${country}`,
      `${city}, ${country}` // Fallback auf Stadt
    ];
    
    for (let i = 0; i < addressAttempts.length; i++) {
      const address = addressAttempts[i];
      console.log(`Geocoding Versuch ${i + 1} für: ${address}`);
      
      try {
        const response = await fetch(`https://api.openrouteservice.org/geocode/search?api_key=${this.OPENROUTE_API_KEY}&text=${encodeURIComponent(address)}&size=1`);
        
        if (!response.ok) {
          console.error(`Geocoding HTTP error für ${customer.last_name_company || customer.name}: ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
          const feature = data.features[0];
          const coordinates = feature.geometry.coordinates;
          
          // Prüfen ob es eine spezifische Straße ist oder nur Stadt
          const isSpecificAddress = feature.properties.layer === 'address' || 
                                   feature.properties.layer === 'street' ||
                                   feature.properties.accuracy === 'point';
          
          console.log(`Koordinaten gefunden für ${address}: [${coordinates[0]}, ${coordinates[1]}] - Layer: ${feature.properties.layer}, Accuracy: ${feature.properties.accuracy}`);
          
          // Wenn es eine spezifische Adresse ist oder der letzte Versuch (Stadt), verwenden
          if (isSpecificAddress || i === addressAttempts.length - 1) {
            return [coordinates[0], coordinates[1]]; // [longitude, latitude]
          }
        }
      } catch (error) {
        console.error(`Geocoding-Fehler für ${customer.last_name_company || customer.name} (Versuch ${i + 1}):`, error);
      }
    }
    
    console.warn(`Keine Koordinaten gefunden für: ${customer.last_name_company || customer.name}`);
    return null;
  }

  private async calculateSingleCustomerRoute(waypoint: RouteWaypoint): Promise<any> {
    // Normale Directions API für einen einzelnen Kunden verwenden
    const coordinates = `${this.START_LOCATION[0]},${this.START_LOCATION[1]};${waypoint.location[0]},${waypoint.location[1]};${this.START_LOCATION[0]},${this.START_LOCATION[1]}`;
    
    try {
      const response = await fetch(`${this.OPENROUTE_API_URL}?api_key=${this.OPENROUTE_API_KEY}&coordinates=${coordinates}&format=geojson&instructions=true&preference=fastest&units=km`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Daten in das gleiche Format wie die Optimization API konvertieren
      const route = data.features[0];
      console.log('Directions API Response:', route.properties.summary);
      return {
        routes: [{
          distance: route.properties.summary.distance / 1000, // Konvertiere Meter zu Kilometer
          duration: route.properties.summary.duration,
          geometry: route.geometry,
          steps: route.properties.segments.map((segment: any, index: number) => ({
            distance: segment.distance / 1000, // Konvertiere Meter zu Kilometer
            duration: segment.duration,
            location: index === 0 ? this.START_LOCATION : waypoint.location
          }))
        }]
      };
      
    } catch (error) {
      console.error('Fehler bei der Einzelkunden-Routenberechnung:', error);
      throw error;
    }
  }

  private async calculateOptimalRouteWithConstraints(waypoints: RouteWaypoint[]): Promise<any> {
    // Optimization API mit Constraints verwenden
    const jobs = waypoints.map((wp, index) => {
      const constraint = this.customerConstraints.find(c => c.customerId === wp.customerId);
      const job: any = {
        id: index,
        location: wp.location
      };

      // Zeitfenster hinzufügen falls definiert
      if (constraint) {
        // Nur Zeitfenster hinzufügen wenn beide Werte gesetzt sind
        if (constraint.timeWindowStart && constraint.timeWindowEnd) {
          const [startHours, startMinutes] = constraint.timeWindowStart.split(':').map(Number);
          const [endHours, endMinutes] = constraint.timeWindowEnd.split(':').map(Number);
          
          // Startzeit in Sekunden seit Mitternacht
          const startTimeSeconds = startHours * 3600 + startMinutes * 60;
          const endTimeSeconds = endHours * 3600 + endMinutes * 60;
          
          job.time_windows = [[startTimeSeconds, endTimeSeconds]];
        }
        // Service-Zeit immer hinzufügen
        job.service = constraint.stayDuration * 60; // Service-Zeit in Sekunden
      }

      return job;
    });

    const requestBody = {
      jobs: jobs,
      vehicles: [{
        id: 1,
        profile: 'driving-car', // Standard-Profil ohne Verkehrsdaten
        start: this.START_LOCATION,
        end: this.START_LOCATION,
        time_window: [0, 86400] // Ganzer Tag verfügbar
      }],
      options: {
        g: true, // Geometrie einschließen
        optimize: true // Optimierung aktivieren
      }
    };

    console.log('Optimization Request mit Constraints:', requestBody);

    try {
      const response = await fetch(this.OPENROUTE_OPTIMIZATION_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.OPENROUTE_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error Response:', errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Fehler bei der API-Anfrage:', error);
      throw error;
    }
  }

  private calculateRouteStats(optimizationResult: any) {
    if (optimizationResult.routes && optimizationResult.routes.length > 0) {
      const route = optimizationResult.routes[0];
      
      // Distanz und Dauer aus der Route
      this.totalDistance = route.distance; // Bereits in Kilometern
      this.totalDuration = route.duration; // Bereits in Sekunden
      
      // Optimale Reihenfolge aus den Steps extrahieren
      this.calculateOptimalOrderFromSteps(route.steps);
      
      // Schritte für die Anzeige erstellen
      this.routeSteps = route.steps.map((step: any, index: number) => ({
        instruction: `Fahrt zu ${step.location ? this.getCustomerNameByLocation(step.location) : 'Kunde'}`,
        distance: step.distance, // Bereits in Kilometern
        duration: step.duration
      }));
      
      console.log('Optimization Stats berechnet:', {
        distance: this.totalDistance,
        duration: this.totalDuration,
        steps: this.routeSteps.length,
        optimalOrder: this.optimalOrder
      });
    }
  }

  private calculateOptimalOrderFromSteps(steps: any[]) {
    if (steps && steps.length > 0) {
      // Filtere nur die Schritte, die zu unseren Kunden gehören (nicht Start/End)
      const customerSteps = steps.filter(step => {
        const customer = this.getCustomerByLocation(step.location);
        return customer !== null;
      });

      // Bei nur einem Kunden: Start -> Kunde -> Start
      if (this.selectedCustomers.length === 1) {
        const customer = this.selectedCustomers[0];
        const [hours, minutes] = this.startTime.split(':').map(Number);
        const startTime = new Date();
        startTime.setHours(hours, minutes, 0, 0);
        let currentTime = new Date(startTime.getTime());

        // Fahrzeit zum Kunden
        const travelTime = steps[0]?.duration || 0;
        currentTime = new Date(currentTime.getTime() + travelTime * 1000);

        const arrivalTime = new Date(currentTime.getTime());
        const departureTime = new Date(arrivalTime.getTime() + 15 * 60 * 1000); // 15 Minuten Aufenthalt

        this.optimalOrder = [{
          position: 1,
          customer: customer,
          name: customer.last_name_company || customer.name,
          customerNumber: customer.customer_number,
          address: `${customer.street || customer.address}, ${customer.postal_code} ${customer.city}`,
          arrivalTime: arrivalTime,
          departureTime: departureTime,
          travelTime: travelTime,
          stayDuration: 15
        }];

        // Endzeit für einen Kunden berechnen: Aufenthalt + Rückfahrt
        const stayDuration = 15 * 60 * 1000; // 15 Minuten in Millisekunden
        currentTime = new Date(currentTime.getTime() + stayDuration);
        
        // Fahrzeit zurück zum Startpunkt (angenommen gleich der Hinreise)
        const returnTravelTime = travelTime;
        this.endTime = new Date(currentTime.getTime() + returnTravelTime * 1000);
        
        return;
      }

      // Startzeit aus der Eingabe verwenden
      const [hours, minutes] = this.startTime.split(':').map(Number);
      const startTime = new Date();
      startTime.setHours(hours, minutes, 0, 0);
      let currentTime = new Date(startTime.getTime());

      this.optimalOrder = customerSteps.map((step, index) => {
        const customer = this.getCustomerByLocation(step.location);
        
        // Fahrzeit zum aktuellen Stopp hinzufügen
        // Für den ersten Kunden: Fahrzeit vom Startpunkt
        // Für weitere Kunden: Fahrzeit vom vorherigen Kunden
        if (index === 0) {
          // Fahrzeit vom Startpunkt zum ersten Kunden
          const travelTime = step.duration || 0; // Sekunden
          currentTime = new Date(currentTime.getTime() + travelTime * 1000);
        } else {
          // Fahrzeit vom vorherigen Kunden zum aktuellen Kunden
          // Wir verwenden die Dauer des aktuellen Schritts, da diese die Fahrzeit
          // vom vorherigen Standort zum aktuellen Standort enthält
          const travelTime = step.duration || 0; // Sekunden
          currentTime = new Date(currentTime.getTime() + travelTime * 1000);
        }

        // Geschätzte Ankunftszeit
        const arrivalTime = new Date(currentTime.getTime());
        
        // 15 Minuten Aufenthalt pro Kunde (auch beim ersten)
        const stayDuration = 15 * 60 * 1000; // 15 Minuten in Millisekunden
        currentTime = new Date(currentTime.getTime() + stayDuration);

        // Abfahrtszeit berechnen (Ankunft + Aufenthaltsdauer)
        const departureTime = new Date(arrivalTime.getTime() + 15 * 60 * 1000);

        return {
          position: index + 1,
          customer: customer,
          name: customer ? (customer.last_name_company || customer.name) : 'Unbekannter Kunde',
          customerNumber: customer?.customer_number,
          address: customer ? `${customer.street || customer.address}, ${customer.postal_code} ${customer.city}` : 'Unbekannte Adresse',
          arrivalTime: arrivalTime,
          departureTime: departureTime,
          travelTime: step.duration || 0,
          stayDuration: 15
        };
      });

      // Endzeit berechnen: Fahrzeit vom letzten Kunden zurück zum Startpunkt
      if (customerSteps.length > 0) {
        const lastStep = customerSteps[customerSteps.length - 1];
        const returnTravelTime = lastStep.duration || 0; // Sekunden
        this.endTime = new Date(currentTime.getTime() + returnTravelTime * 1000);
      }
    }
  }

  private getCustomerByLocation(location: [number, number]): Customer | null {
    const waypoint = this.waypoints.find(wp => 
      wp.location[0] === location[0] && wp.location[1] === location[1]
    );
    if (waypoint) {
      return this.selectedCustomers.find(c => c.id === waypoint.customerId) || null;
    }
    return null;
  }

  private getCustomerNameByLocation(location: [number, number]): string {
    const customer = this.getCustomerByLocation(location);
    return customer ? (customer.last_name_company || customer.name) : 'Unbekannter Kunde';
  }

  private calculateOptimalOrder(wayPoints: number[]) {
    if (wayPoints && wayPoints.length > 0) {
      this.optimalOrder = wayPoints.map((wayPointIndex, index) => {
        const customer = this.selectedCustomers[wayPointIndex];
        return {
          position: index + 1,
          customer: customer,
          name: customer.last_name_company || customer.name,
          customerNumber: customer.customer_number,
          address: `${customer.street || customer.address}, ${customer.postal_code} ${customer.city}`
        };
      });
    }
  }

  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    } else {
      return `${minutes}min`;
    }
  }

  formatDistance(kilometers: number): string {
    return `${(kilometers / 1000).toFixed(1)} km`;
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('de-DE', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }

  private getCurrentTime(): string {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  exportRoute() {
    if (!this.routeData) return;

    const routeInfo = {
      customers: this.selectedCustomers.map(c => ({
        id: c.id,
        name: c.last_name_company || c.name,
        customer_number: c.customer_number,
        address: `${c.street || c.address}, ${c.postal_code} ${c.city}`,
        email: c.email,
        phone: c.phone
      })),
      route: {
        totalDistance: this.formatDistance(this.totalDistance),
        totalDuration: this.formatDuration(this.totalDuration),
        steps: this.routeSteps
      },
      metadata: {
        timestamp: new Date().toISOString(),
        waypoints: this.selectedCustomers.length,
        api: 'OpenRoute Service'
      }
    };

    const blob = new Blob([JSON.stringify(routeInfo, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `route_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  generateShareLink(): string {
    if (!this.routeData || !this.optimalOrder.length) {
      return '';
    }

    // Google Maps URL mit allen Stopps erstellen
    // Jeder Stopp wird als separater Wegpunkt hinzugefügt
    const waypoints = this.optimalOrder.map(stop => 
      encodeURIComponent(stop.address)
    ).join('/');

    const startLocation = encodeURIComponent('Im Winkel 6, 67547 Worms');
    const endLocation = encodeURIComponent('Im Winkel 6, 67547 Worms');

    // Google Maps Share-URL - jeder Stopp als separater Wegpunkt
    const googleMapsUrl = `https://www.google.com/maps/dir/${startLocation}/${waypoints}/${endLocation}`;
    
    return googleMapsUrl;
  }

  async copyShareLink(): Promise<void> {
    const shareUrl = this.generateShareLink();
    
    if (!shareUrl) {
      alert('Keine Route verfügbar zum Teilen.');
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      alert('Google Maps Link wurde in die Zwischenablage kopiert!');
    } catch (err) {
      // Fallback für ältere Browser
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('Google Maps Link wurde in die Zwischenablage kopiert!');
    }
  }

  openInGoogleMaps(): void {
    if (!this.optimalOrder.length) {
      alert('Keine Route verfügbar.');
      return;
    }

    // Google Maps URL mit allen Stopps erstellen
    // Jeder Stopp wird als separater Wegpunkt hinzugefügt
    const waypoints = this.optimalOrder.map(stop => 
      encodeURIComponent(stop.address)
    ).join('/');

    const startLocation = encodeURIComponent('Im Winkel 6, 67547 Worms');
    const endLocation = encodeURIComponent('Im Winkel 6, 67547 Worms');

    const googleMapsUrl = `https://www.google.com/maps/dir/${startLocation}/${waypoints}/${endLocation}`;
    
    window.open(googleMapsUrl, '_blank');
  }

  goBack() {
    this.router.navigate(['/admin']);
  }
} 