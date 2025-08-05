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

    // Map initialisieren
    this.map = L.map('route-map').setView(this.START_LOCATION, 10);

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

    // Startpunkt markieren
    const startMarker = L.marker(this.START_LOCATION, { icon: startIcon })
      .addTo(this.map)
      .bindPopup(`
        <div class="popup-content">
          <h4>🏢 Gastro Depot</h4>
          <p><strong>Adresse:</strong><br>Im Winkel 6<br>67547 Worms</p>
          <p><strong>Status:</strong> Ausgangspunkt für alle Touren</p>
        </div>
      `);

    // Kundenstandorte markieren
    const customerMarkers: any[] = [];
    this.optimalOrder.forEach((stop, index) => {
      const waypoint = this.waypoints.find(wp => wp.customerId === stop.customer.id);
      if (waypoint) {
        const marker = L.marker(waypoint.location, { icon: customerIcon(index + 1, stop.name) })
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

    // Route-Linie zeichnen (falls verfügbar)
    if (this.routeData && this.routeData.routes && this.routeData.routes[0].geometry) {
      const routeGeometry = this.routeData.routes[0].geometry;
      if (routeGeometry.coordinates) {
        const routeLine = L.polyline(routeGeometry.coordinates, {
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
        const midPoint = Math.floor(routeGeometry.coordinates.length / 2);
        if (routeGeometry.coordinates[midPoint]) {
          routeLine.bindTooltip(routeLabel).openTooltip();
        }
      }
    }

    // Verbindungslinien zwischen Standorten in Reihenfolge zeichnen
    this.drawConnectionLines();

    // Route-Pfeile für Richtung hinzufügen
    this.addRouteArrows();

    // Map auf alle Marker zoomen
    const group = new L.featureGroup([startMarker, ...customerMarkers]);
    this.map.fitBounds(group.getBounds().pad(0.1));

    // Legende hinzufügen
    this.addLegend();
  }

  private addRouteArrows(): void {
    if (!this.routeData || !this.routeData.routes || !this.routeData.routes[0].geometry) return;

    const coordinates = this.routeData.routes[0].geometry.coordinates;
    if (coordinates.length < 2) return;

    // Pfeile alle 5 Koordinaten hinzufügen
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

        L.marker(current, { icon: arrowIcon })
          .addTo(this.map)
          .setRotationAngle(angle);
      }
    }
  }

  private drawConnectionLines(): void {
    if (this.optimalOrder.length === 0) return;

    const connectionPoints: [number, number][] = [];
    
    // Startpunkt hinzufügen
    connectionPoints.push(this.START_LOCATION);
    
    // Kundenstandorte in Reihenfolge hinzufügen
    this.optimalOrder.forEach(stop => {
      const waypoint = this.waypoints.find(wp => wp.customerId === stop.customer.id);
      if (waypoint) {
        connectionPoints.push(waypoint.location);
      }
    });
    
    // Zurück zum Startpunkt
    connectionPoints.push(this.START_LOCATION);

    // Verbindungslinien zeichnen
    for (let i = 0; i < connectionPoints.length - 1; i++) {
      const from = connectionPoints[i];
      const to = connectionPoints[i + 1];
      
      const connectionLine = L.polyline([from, to], {
        color: '#ff6b6b',
        weight: 3,
        opacity: 0.8,
        dashArray: '5, 5'
      }).addTo(this.map);

      // Pfeil in der Mitte der Verbindung
      const midPoint = [
        (from[0] + to[0]) / 2,
        (from[1] + to[1]) / 2
      ];
      
      const angle = Math.atan2(to[1] - from[1], to[0] - from[0]) * 180 / Math.PI;
      
      const arrowIcon = L.divIcon({
        className: 'connection-arrow',
        html: '➡️',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });

      L.marker(midPoint, { icon: arrowIcon })
        .addTo(this.map)
        .setRotationAngle(angle);
    }
  }

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
          <span class="legend-icon connection-icon">➡️</span>
          <span>Verbindungen</span>
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
      const searchTermLower = this.searchTerm.toLowerCase();
      this.filteredCustomers = this.customers.filter(customer =>
        customer.name.toLowerCase().includes(searchTermLower) ||
        customer.address.toLowerCase().includes(searchTermLower) ||
        customer.city.toLowerCase().includes(searchTermLower) ||
        customer.postal_code.toLowerCase().includes(searchTermLower) ||
        (customer.country && customer.country.toLowerCase().includes(searchTermLower)) ||
        // Zusätzliche Suchfelder
        (customer.last_name_company && customer.last_name_company.toLowerCase().includes(searchTermLower)) ||
        (customer.name_addition && customer.name_addition.toLowerCase().includes(searchTermLower)) ||
        (customer.street && customer.street.toLowerCase().includes(searchTermLower)) ||
        (customer.email && customer.email.toLowerCase().includes(searchTermLower)) ||
        (customer.phone && customer.phone.toLowerCase().includes(searchTermLower)) ||
        (customer.customer_number && customer.customer_number.toLowerCase().includes(searchTermLower)) ||
        // Suche auch nach Teilen des Namens (z.B. "Müller" findet "Müller GmbH")
        customer.name.toLowerCase().split(' ').some(part => part.includes(searchTermLower)) ||
        (customer.last_name_company && customer.last_name_company.toLowerCase().split(' ').some(part => part.includes(searchTermLower)))
      );
    }
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

  async calculateRoute() {
    if (this.selectedCustomers.length < 2) {
      alert('Bitte wählen Sie mindestens 2 Kunden aus.');
      return;
    }

    this.isLoading = true;
    this.showRoute = false;

    try {
      // Geocoding für alle ausgewählten Kunden
      const waypoints: RouteWaypoint[] = [];
      
      for (const customer of this.selectedCustomers) {
        console.log(`Geocoding für: ${customer.last_name_company || customer.name}`);
        const coordinates = await this.geocodeAddress(customer);
        if (coordinates) {
          console.log(`Koordinaten gefunden: ${coordinates[0]}, ${coordinates[1]}`);
          waypoints.push({
            location: coordinates,
            name: customer.last_name_company || customer.name,
            customerId: customer.id
          });
        } else {
          console.warn(`Keine Koordinaten gefunden für: ${customer.last_name_company || customer.name}`);
        }
      }

      this.waypoints = waypoints;

      if (waypoints.length < 2) {
        alert('Konnte nicht genügend Adressen geocodieren. Bitte überprüfen Sie die Adressen der ausgewählten Kunden.');
        this.isLoading = false;
        return;
      }

      console.log(`Route berechnen für ${waypoints.length} Wegpunkte:`, waypoints);

      // Route berechnen
      const route = await this.calculateOptimalRoute(waypoints);
      
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
    const address = `${customer.street || customer.address}, ${customer.postal_code} ${customer.city}, ${customer.country || 'Deutschland'}`;
    
    try {
      const response = await fetch(`https://api.openrouteservice.org/geocode/search?api_key=${this.OPENROUTE_API_KEY}&text=${encodeURIComponent(address)}`);
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        const coordinates = data.features[0].geometry.coordinates;
        return [coordinates[0], coordinates[1]]; // [longitude, latitude]
      }
    } catch (error) {
      console.error(`Geocoding-Fehler für ${customer.last_name_company || customer.name}:`, error);
    }
    
    return null;
  }

  private async calculateOptimalRoute(waypoints: RouteWaypoint[]): Promise<any> {
    // Optimization API verwenden mit festem Startpunkt
    const requestBody = {
      jobs: waypoints.map((wp, index) => ({
        id: index,
        location: wp.location
      })),
      vehicles: [{
        id: 1,
        profile: 'driving-car',
        start: this.START_LOCATION,
        end: this.START_LOCATION
      }],
      options: {
        g: true, // Geometrie einschließen
        optimize: true // Optimierung aktivieren
      }
    };

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

      // Startzeit aus der Eingabe verwenden
      const [hours, minutes] = this.startTime.split(':').map(Number);
      const startTime = new Date();
      startTime.setHours(hours, minutes, 0, 0);
      let currentTime = new Date(startTime.getTime());

      this.optimalOrder = customerSteps.map((step, index) => {
        const customer = this.getCustomerByLocation(step.location);
        
        // Fahrzeit zum aktuellen Stopp hinzufügen
        if (index > 0) {
          const previousStep = customerSteps[index - 1];
          const travelTime = previousStep.duration || 0; // Sekunden
          currentTime = new Date(currentTime.getTime() + travelTime * 1000);
        }

        // Geschätzte Ankunftszeit
        const arrivalTime = new Date(currentTime.getTime());
        
        // 15 Minuten Aufenthalt pro Kunde (außer beim ersten)
        const stayDuration = index === 0 ? 0 : 15 * 60 * 1000; // 15 Minuten in Millisekunden
        currentTime = new Date(currentTime.getTime() + stayDuration);

        return {
          position: index + 1,
          customer: customer,
          name: customer ? (customer.last_name_company || customer.name) : 'Unbekannter Kunde',
          customerNumber: customer?.customer_number,
          address: customer ? `${customer.street || customer.address}, ${customer.postal_code} ${customer.city}` : 'Unbekannte Adresse',
          arrivalTime: arrivalTime,
          travelTime: step.duration || 0,
          stayDuration: index === 0 ? 0 : 15
        };
      });
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
    return `${kilometers.toFixed(1)} km`;
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

  goBack() {
    this.router.navigate(['/admin']);
  }
} 