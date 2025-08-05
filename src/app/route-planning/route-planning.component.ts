import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpClientModule } from '@angular/common/http';
import { Router } from '@angular/router';

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
export class RoutePlanningComponent implements OnInit, OnDestroy {
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
  }

  ngOnDestroy(): void {
    this.showFooter();
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
      this.totalDistance = route.distance * 1000; // Konvertiere km zu Meter
      this.totalDuration = route.duration; // Bereits in Sekunden
      
      // Optimale Reihenfolge aus den Steps extrahieren
      this.calculateOptimalOrderFromSteps(route.steps);
      
      // Schritte für die Anzeige erstellen
      this.routeSteps = route.steps.map((step: any, index: number) => ({
        instruction: `Fahrt zu ${step.location ? this.getCustomerNameByLocation(step.location) : 'Kunde'}`,
        distance: step.distance * 1000, // Konvertiere km zu Meter
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

      this.optimalOrder = customerSteps.map((step, index) => {
        const customer = this.getCustomerByLocation(step.location);
        return {
          position: index + 1,
          customer: customer,
          name: customer ? (customer.last_name_company || customer.name) : 'Unbekannter Kunde',
          customerNumber: customer?.customer_number,
          address: customer ? `${customer.street || customer.address}, ${customer.postal_code} ${customer.city}` : 'Unbekannte Adresse'
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

  formatDistance(meters: number): string {
    const km = meters / 1000;
    return `${km.toFixed(1)} km`;
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