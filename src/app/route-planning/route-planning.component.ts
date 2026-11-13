import { Component, ElementRef, HostListener, OnInit, OnDestroy, AfterViewInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpClientModule } from '@angular/common/http';
import { Router } from '@angular/router';
import * as QRCode from 'qrcode';
import { environment } from '../../environments/environment';
import {
  MapsPlace,
  MAX_WAYPOINTS_MOBILE_BROWSER,
  buildNavigateUrl,
  buildRouteOverviewUrls,
  parseSharedRouteUrl
} from './google-maps-url';

// Leaflet TypeScript Deklarationen
declare var L: any;
declare global {
  interface Window {
    L: any;
  }
}

interface DeliveryAddress {
  id: number;
  customer_id: number;
  label: string | null;
  street: string;
  postal_code: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  is_default: boolean;
}

interface AddressSuggestion {
  label: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  longitude: number;
  latitude: number;
  placeName?: string;
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
  house_number?: string;
  email?: string;
  phone?: string;
  customer_number?: string;
  selected?: boolean;
  deliveryAddresses?: DeliveryAddress[];
}

interface CustomerConstraint {
  customerId: number;
  customerName: string;
  timeWindowStart: string;
  timeWindowEnd: string;
  priority: string; // 'low', 'medium', 'high'
  duration: number; // Verweildauer in Minuten
}

interface RouteWaypoint {
  location: [number, number]; // [longitude, latitude]
  name: string;
  customerId: number;
}

interface ExtraRouteStop {
  id: number;
  label: string;
  street: string;
  postalCode: string;
  city: string;
  longitude: number;
  latitude: number;
}

interface RouteEndpoint {
  label: string;
  longitude: number;
  latitude: number;
}

type StartMode = 'depot' | 'gps' | 'manual';

interface NavTarget extends MapsPlace {
  name: string;
  /** Position in der optimalen Reihenfolge, null für das Routenziel. */
  position: number | null;
}

const DEFAULT_ROUTE_ENDPOINT: RouteEndpoint = {
  label: 'Im Winkel 6, 67547 Worms',
  longitude: 8.3594,
  latitude: 49.6326
};

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
  actualStartTime: Date | null = null;
  endTime: Date | null = null;
  
  // Neue Eigenschaften für das Modal
  showConstraintsModal: boolean = false;
  customerConstraints: CustomerConstraint[] = [];
  isSettingConstraints: boolean = false;
  
  // Neue Eigenschaften für das Bestätigungsmodal
  showDeselectConfirmModal: boolean = false;
  showNewRouteModal = false;
  routeQrDataUrl: string | null = null;
  private readonly selectionStorageKey = 'routePlanningSelection';
  addressChoiceCustomer: Customer | null = null;
  private addressChoiceQueue: Customer[] = [];
  /** Gewählte Adresse für diese Route. 0 steht für die Stammdatenadresse. */
  routeAddressIds: Record<number, number> = {};

  viewMode: 'route' | 'addresses' = 'route';
  addressSearchTerm: string = '';
  addressFilteredCustomers: Customer[] = [];
  deliveryAddresses: DeliveryAddress[] = [];
  addressLoadError: string = '';
  editingCustomerId: number | null = null;
  addressQuery: string = '';
  addressSuggestions: AddressSuggestion[] = [];
  selectedAddressSuggestion: AddressSuggestion | null = null;
  addressLabel: string = '';
  isSearchingAddresses: boolean = false;
  isSavingAddress: boolean = false;
  addressActionError: string = '';
  private addressSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private addressSearchSeq = 0;

  extraStops: ExtraRouteStop[] = [];
  extraStopsOpen = false;
  selectedCustomersOpen = false;
  extraStopQuery = '';
  extraStopLabel = '';
  extraStopSuggestions: AddressSuggestion[] = [];
  selectedExtraSuggestion: AddressSuggestion | null = null;
  isSearchingExtraStops = false;
  extraStopError = '';
  private extraStopSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private extraStopSearchSeq = 0;
  private nextExtraStopId = -1;

  @ViewChild('hardwareScanInput') hardwareScanInput?: ElementRef<HTMLInputElement>;
  qrScanMessage = '';
  qrScanStatus: 'success' | 'info' | 'error' = 'info';
  scannerHintVisible = true;
  private scannerHintTimer: ReturnType<typeof setTimeout> | null = null;
  private lastQrValue = '';
  private lastQrAt = 0;
  private qrSeq = 0;
  private scanBuffer = '';
  private scanStartedAt = 0;
  private lastScanKeyAt = 0;
  private scanIsHardware = false;
  private scanIdleTimer: ReturnType<typeof setTimeout> | null = null;
  
  // Neue Eigenschaften für schrittweise Navigation
  currentStep: number = 1;
  totalSteps: number = 3;
  stepTitles: string[] = ['Kunden auswählen', 'Route berechnen', 'Ergebnis anzeigen'];
  
  // Array für die Schritt-Navigation
  get stepsArray(): number[] {
    return Array.from({length: this.totalSteps}, (_, i) => i + 1);
  }
  
  // OpenRoute Service API Key
  private readonly OPENROUTE_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImQ4N2IyM2NjZTA1NTQyNTNiNDZmODhhZmQ1NDE1NDBhIiwiaCI6Im11cm11cjY0In0=';
  private readonly OPENROUTE_API_URL = 'https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson';
  private readonly OPENROUTE_OPTIMIZATION_URL = 'https://api.heigit.org/vroom/v0';
  
  // Standard: Im Winkel 6, 67547 Worms. Start und Ziel können davon abweichen.
  routeStart: RouteEndpoint = { ...DEFAULT_ROUTE_ENDPOINT };
  routeEnd: RouteEndpoint = { ...DEFAULT_ROUTE_ENDPOINT };
  calculatedStart: RouteEndpoint = { ...DEFAULT_ROUTE_ENDPOINT };
  calculatedEnd: RouteEndpoint = { ...DEFAULT_ROUTE_ENDPOINT };
  endpointEdit: 'start' | 'end' | null = null;
  endpointQuery = '';
  endpointSuggestions: AddressSuggestion[] = [];
  endpointSearchError = '';
  isSearchingEndpoint = false;
  private endpointSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private endpointSearchSeq = 0;

  /** Woher die Route startet. Bei 'gps' wird nie still auf das Depot zurückgefallen. */
  startMode: StartMode = 'depot';
  calculatedStartMode: StartMode = 'depot';
  gpsStatus: 'idle' | 'locating' | 'ready' | 'error' = 'idle';
  gpsError = '';
  private manualStart: RouteEndpoint | null = null;
  private gpsSeq = 0;

  /** Index des nächsten Navigationsziels in navTargets (Stopps in optimaler Reihenfolge, danach das Ziel). */
  navIndex = 0;
  navOpenedHint = '';

  constructor(
    private http: HttpClient,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadCustomers();
    this.hideFooter();
    this.startTime = this.getCurrentTime();
    this.scannerHintTimer = setTimeout(() => {
      this.scannerHintVisible = false;
    }, 5000);
  }

  ngOnDestroy(): void {
    if (this.scanIdleTimer) {
      clearTimeout(this.scanIdleTimer);
    }
    if (this.scannerHintTimer) {
      clearTimeout(this.scannerHintTimer);
    }
    this.showFooter();
    this.destroyMap();
    if (this.addressSearchTimer) {
      clearTimeout(this.addressSearchTimer);
    }
    if (this.extraStopSearchTimer) {
      clearTimeout(this.extraStopSearchTimer);
    }
    if (this.endpointSearchTimer) {
      clearTimeout(this.endpointSearchTimer);
    }
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
    this.focusScanCapture();
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
    const initialCoords: [number, number] = [this.calculatedStart.latitude, this.calculatedStart.longitude];
    this.map = L.map('route-map').setView(initialCoords, 10);

    // OpenStreetMap Tiles hinzufügen
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    // Custom Icons erstellen
    const startIcon = L.divIcon({
      className: 'custom-marker start-marker',
      html: '<div class="marker-content">S<br><span class="marker-label">Start</span></div>',
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
    const startCoords: [number, number] = [this.calculatedStart.latitude, this.calculatedStart.longitude];
    const startMarker = L.marker(startCoords, { icon: startIcon })
      .addTo(this.map)
      .bindPopup(`
        <div class="popup-content">
          <h4>Start</h4>
          <p>${this.escapeHtml(this.calculatedStart.label)}</p>
        </div>
      `);

    const markers = [startMarker];
    const sameEndpoint = Math.abs(this.calculatedStart.longitude - this.calculatedEnd.longitude) < 0.00001
      && Math.abs(this.calculatedStart.latitude - this.calculatedEnd.latitude) < 0.00001;
    if (!sameEndpoint) {
      const endIcon = L.divIcon({
        className: 'custom-marker start-marker',
        html: '<div class="marker-content">E<br><span class="marker-label">Ziel</span></div>',
        iconSize: [40, 60],
        iconAnchor: [20, 60]
      });
      const endMarker = L.marker([this.calculatedEnd.latitude, this.calculatedEnd.longitude], { icon: endIcon })
        .addTo(this.map)
        .bindPopup(`
          <div class="popup-content">
            <h4>Ziel</h4>
            <p>${this.escapeHtml(this.calculatedEnd.label)}</p>
          </div>
        `);
      markers.push(endMarker);
    }

    // Kundenstandorte markieren (Koordinaten umkehren: [lng, lat] -> [lat, lng])
    const customerMarkers: any[] = [];
    this.optimalOrder.forEach((stop, index) => {
        const waypoint = this.waypoints.find(wp => wp.customerId === (stop.stopId ?? stop.customer?.id));
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
              ${stop.duration > 0 ? `<p><strong>Aufenthalt:</strong> ${stop.duration} min</p>` : ''}
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
    const group = new L.featureGroup([...markers, ...customerMarkers]);
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
        const arrowMarker = L.marker(arrowCoords, { icon: arrowIcon }).addTo(this.map);
        // Only rotate if rotated marker plugin is present
        if (typeof arrowMarker.setRotationAngle === 'function') {
          arrowMarker.setRotationAngle(angle);
        }
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
          <span>Start / Ziel</span>
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
    
    fetch(`${environment.apiUrl}/api/customers`, {
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
        selected: false,
        deliveryAddresses: []
      }));
      this.restoreSelection();
      this.updateSelectedCustomers();
      this.filterCustomers();
      this.filterAddressCustomers();
      this.isLoadingCustomers = false;
      this.loadDeliveryAddresses();
    })
    .catch(error => {
      console.error('Fehler beim Laden der Kunden:', error);
      this.isLoadingCustomers = false;
    });
  }

  filterCustomers() {
    this.filteredCustomers = this.applyCustomerFilter(this.searchTerm);
  }

  filterAddressCustomers() {
    this.addressFilteredCustomers = this.applyCustomerFilter(this.addressSearchTerm);
  }

  private applyCustomerFilter(rawTerm: string): Customer[] {
    if (!rawTerm.trim()) {
      return [];
    }

    const normalizedSearchTerm = this.normalizeSearchTerm(rawTerm);
    return this.customers.filter(customer => {
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

      const wordMatches =
        this.hasWordMatch(normalizedName, normalizedSearchTerm) ||
        this.hasWordMatch(normalizedCompany, normalizedSearchTerm) ||
        this.hasWordMatch(normalizedAddress, normalizedSearchTerm) ||
        this.hasWordMatch(normalizedCity, normalizedSearchTerm);

      return directMatches || wordMatches;
    });
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
    if (customer.selected) {
      customer.selected = false;
      this.clearRouteAddress(customer.id);
      this.updateSelectedCustomers();
      return;
    }
    if (this.needsAddressChoice(customer)) {
      this.askForRouteAddress([customer]);
      return;
    }
    customer.selected = true;
    this.updateSelectedCustomers();
  }

  updateSelectedCustomers() {
    this.selectedCustomers = this.customers.filter(customer => customer.selected);
    this.persistSelection();
  }

  selectAllCustomers() {
    const needsChoice: Customer[] = [];
    for (const customer of this.filteredCustomers) {
      if (customer.selected) {
        continue;
      }
      if (this.needsAddressChoice(customer)) {
        needsChoice.push(customer);
        continue;
      }
      customer.selected = true;
    }
    this.updateSelectedCustomers();
    if (needsChoice.length > 0) {
      this.askForRouteAddress(needsChoice);
    }
  }

  deselectAllCustomers() {
    this.customers.forEach(customer => {
      customer.selected = false;
    });
    this.routeAddressIds = {};
    this.updateSelectedCustomers();
  }

  // Neue Methode: Alle Kunden abwählen mit Bestätigung
  confirmDeselectAllCustomers(): void {
    this.showDeselectConfirmModal = true;
  }

  // Neue Methode: Bestätigung bestätigen
  confirmDeselectAll(): void {
    this.deselectAllCustomers();
    this.showDeselectConfirmModal = false;
  }

  // Neue Methode: Bestätigung abbrechen
  cancelDeselectAll(): void {
    this.showDeselectConfirmModal = false;
  }

  // Neue Hilfsmethode: Prüft ob alle gefilterten Kunden ausgewählt sind
  areAllFilteredCustomersSelected(): boolean {
    if (this.filteredCustomers.length === 0) return false;
    return this.filteredCustomers.every(customer => customer.selected);
  }

  openConstraintsModal(): void {
    const customerEntries = this.selectedCustomers.map(customer => ({
      customerId: customer.id,
      customerName: customer.last_name_company || customer.name,
      timeWindowStart: '',
      timeWindowEnd: '',
      priority: 'medium',
      duration: 15
    }));
    const extraEntries = this.extraStops.map(stop => ({
      customerId: stop.id,
      customerName: stop.label || `${stop.street}, ${stop.city}`,
      timeWindowStart: '',
      timeWindowEnd: '',
      priority: 'medium',
      duration: 15
    }));
    this.customerConstraints = [...customerEntries, ...extraEntries];
    this.showConstraintsModal = true;
  }

  closeConstraintsModal(): void {
    this.showConstraintsModal = false;
  }

  async startRouteWithConstraints(): Promise<void> {
    this.closeConstraintsModal();
    await this.calculateRouteWithConstraints();
    
    // Nach erfolgreicher Berechnung zum nächsten Schritt wechseln
    if (this.routeData) {
      this.nextStep();
    }
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
    if (this.selectedCustomers.length + this.extraStops.length < 1) {
      alert('Bitte wählen Sie mindestens einen Kunden oder einen zusätzlichen Stopp.');
      return;
    }

    if (!this.ensureAddressChoices() || !this.ensureStartReady()) {
      return;
    }

    if (this.selectedCustomers.length + this.extraStops.length > 1) {
      this.openConstraintsModal();
      return;
    }

    // Bei einem Kunden: Direkt Route berechnen
    await this.calculateRouteWithConstraints();
    
    // Nach erfolgreicher Berechnung zum nächsten Schritt wechseln
    if (this.routeData) {
      this.nextStep();
    }
  }

  async calculateRouteWithConstraints(): Promise<void> {
    if (!this.ensureAddressChoices() || !this.ensureStartReady()) {
      return;
    }

    this.calculatedStart = { ...this.routeStart };
    this.calculatedEnd = { ...this.routeEnd };
    this.calculatedStartMode = this.startMode;
    this.navIndex = 0;
    this.navOpenedHint = '';
    this.isLoading = true;
    this.showRoute = false;

    try {
      // Geocoding für alle ausgewählten Kunden
      const waypoints: RouteWaypoint[] = [];
      
      const failedCustomers: string[] = [];
      
      for (const customer of this.selectedCustomers) {
        const customerName = customer.last_name_company || customer.name;
        const delivery = this.routeDeliveryAddress(customer);
        if (delivery) {
          waypoints.push({
            location: [Number(delivery.longitude), Number(delivery.latitude)],
            name: customerName,
            customerId: customer.id
          });
          continue;
        }

        const address = this.masterAddressLine(customer);
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

      for (const stop of this.extraStops) {
        waypoints.push({
          location: [stop.longitude, stop.latitude],
          name: stop.label || `${stop.street}, ${stop.postalCode} ${stop.city}`,
          customerId: stop.id
        });
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
    const street = [customer.street || customer.address, customer.house_number].filter(Boolean).join(' ').trim();
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
        const response = await fetch(`https://api.heigit.org/pelias/v1/search?api_key=${this.OPENROUTE_API_KEY}&text=${encodeURIComponent(address)}&size=1`);
        
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
    const start = this.endpointLngLat(this.calculatedStart);
    const end = this.endpointLngLat(this.calculatedEnd);

    try {
      const response = await fetch(this.OPENROUTE_API_URL, {
        method: 'POST',
        headers: {
          Authorization: this.OPENROUTE_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'application/geo+json'
        },
        body: JSON.stringify({
          coordinates: [start, waypoint.location, end],
          instructions: true,
          preference: 'fastest',
          units: 'm'
        })
      });
      
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
            location: index === 0 ? start : waypoint.location
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

      // Zeitfenster und Prioritäten hinzufügen falls definiert
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
        
        // Priorität hinzufügen (numerische Werte für die API)
        if (constraint.priority) {
          // Konvertiere String-Prioritäten zu numerischen Werten
          let priorityValue: number;
          switch (constraint.priority) {
            case 'high':
              priorityValue = 1; // Höchste Priorität
              break;
            case 'medium':
              priorityValue = 2; // Mittlere Priorität
              break;
            case 'low':
              priorityValue = 3; // Niedrigste Priorität
              break;
            default:
              priorityValue = 2; // Standard: mittlere Priorität
          }
          job.priority = priorityValue;
        }
        
        // Service-Zeit immer hinzufügen
        job.service = constraint.duration * 60; // Service-Zeit in Sekunden
      }

      return job;
    });

    const requestBody = {
      jobs: jobs,
      vehicles: [{
        id: 1,
        profile: 'driving-car', // Standard-Profil ohne Verkehrsdaten
        start: this.endpointLngLat(this.calculatedStart),
        end: this.endpointLngLat(this.calculatedEnd),
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
      console.log('Original steps from API:', steps);
      
      // Filtere nur die Schritte, die zu unseren Kunden gehören (nicht Start/End)
      const customerSteps = steps.filter(step => this.getWaypointByLocation(step.location) !== null);

      console.log('Filtered customer steps:', customerSteps);

              // Bei nur einem Stopp: Start -> Stopp -> Start
        if (this.waypoints.length === 1) {
          const onlyStop = this.waypoints[0];
          const described = this.describeWaypoint(onlyStop.customerId);
          const customer = described.customer;
          const [hours, minutes] = this.startTime.split(':').map(Number);
          const startTime = new Date();
          startTime.setHours(hours, minutes, 0, 0);
          this.actualStartTime = new Date(startTime.getTime()); // Speichere die tatsächliche Startzeit
          let currentTime = new Date(startTime.getTime());

        // Berechne Fahrzeit basierend auf der tatsächlichen Distanz
        const customerConstraint = this.customerConstraints.find(c => c.customerId === onlyStop.customerId);
              const customerStayDuration = customerConstraint?.duration || 15;
      const totalTravelTime = this.totalDuration - (customerStayDuration * 60); // Gesamt - Aufenthalt
        const travelTime = Math.max(600, totalTravelTime / 2); // mindestens 10 Minuten, geteilt durch Hin- und Rückfahrt
        
        currentTime = new Date(currentTime.getTime() + travelTime * 1000);
        const arrivalTime = new Date(currentTime.getTime());
        
        const departureTime = new Date(arrivalTime.getTime() + customerStayDuration * 60 * 1000);

        this.optimalOrder = [{
          position: 1,
          customer: customer,
          stopId: described.stopId,
          name: described.name,
          customerNumber: described.customerNumber,
          address: described.address,
          arrivalTime: arrivalTime,
          departureTime: departureTime,
          travelTime: travelTime,
          stayDuration: customerStayDuration
        }];

        // Endzeit berechnen: Aufenthalt + Rückfahrt
        const stayDurationMs = customerStayDuration * 60 * 1000;
        currentTime = new Date(currentTime.getTime() + stayDurationMs);
        
        // Rückfahrt
        this.endTime = new Date(currentTime.getTime() + travelTime * 1000);
        
        return;
      }

      // Für mehrere Kunden: Verwende die echten Fahrzeiten aus der API
      const [hours, minutes] = this.startTime.split(':').map(Number);
      const startTime = new Date();
      startTime.setHours(hours, minutes, 0, 0);
      this.actualStartTime = new Date(startTime.getTime()); // Speichere die tatsächliche Startzeit
      let currentTime = new Date(startTime.getTime());
      
      console.log(`Start time set to: ${startTime.toLocaleTimeString()}`);

      console.log('Using real API travel times from steps:', steps.map(s => ({ distance: s.distance, duration: s.duration })));

      // Finde alle Job-Schritte (Kundenbesuche) in der Route
      const jobSteps = steps.filter(s => s.type === 'job');
      console.log('Job steps:', jobSteps);
      
      this.optimalOrder = customerSteps.map((step, index) => {
        const matchedWaypoint = this.getWaypointByLocation(step.location);
        const described = matchedWaypoint ? this.describeWaypoint(matchedWaypoint.customerId) : null;
        const customer = described?.customer || null;
        
        // Berechne die echte Segment-Fahrzeit (nicht kumulativ)
        let travelTimeToThisStop = 0;
        
        if (index === 0) {
          // Erster Kunde: Fahrzeit vom Startpunkt zum ersten Kunden
          travelTimeToThisStop = jobSteps[0]?.duration || 0;
        } else {
          // Weitere Kunden: Differenz zwischen aktueller und vorheriger kumulativer Zeit
          const currentCumulativeTime = jobSteps[index]?.duration || 0;
          const previousCumulativeTime = jobSteps[index - 1]?.duration || 0;
          travelTimeToThisStop = currentCumulativeTime - previousCumulativeTime;
        }
        
        console.log(`Segment ${index + 1}: Distance=${jobSteps[index]?.distance}km, Segment Duration=${travelTimeToThisStop}s (${Math.round(travelTimeToThisStop/60)}min)`);
        
        // Ankunftszeit berechnen: aktuelle Zeit + Fahrzeit zu diesem Stopp
        currentTime = new Date(currentTime.getTime() + travelTimeToThisStop * 1000);
        const arrivalTime = new Date(currentTime.getTime());
        
        console.log(`Customer ${index + 1} arrival time: ${arrivalTime.toLocaleTimeString()}`);
        
        // Aufenthaltsdauer aus Constraints verwenden oder Standard
        const constraint = this.customerConstraints.find(c => c.customerId === matchedWaypoint?.customerId);
        const stayDurationMinutes = constraint?.duration || 15;
        const stayDurationMs = stayDurationMinutes * 60 * 1000;
        currentTime = new Date(currentTime.getTime() + stayDurationMs);

        // Abfahrtszeit berechnen (Ankunft + Aufenthaltsdauer)
        const departureTime = new Date(arrivalTime.getTime() + stayDurationMs);
        
        console.log(`Customer ${index + 1} departure time: ${departureTime.toLocaleTimeString()}`);

        return {
          position: index + 1,
          customer: customer,
          stopId: described?.stopId,
          name: described?.name || 'Unbekannter Stopp',
          customerNumber: described?.customerNumber,
          address: described?.address || 'Unbekannte Adresse',
          arrivalTime: arrivalTime,
          departureTime: departureTime,
          travelTime: travelTimeToThisStop,
          stayDuration: stayDurationMinutes
        };
      });

      // Endzeit berechnen: Rückfahrt zum Startpunkt (letzter Schritt in der Route)
      const endStep = steps.find(s => s.type === 'end');
      const lastJobStep = jobSteps[jobSteps.length - 1];
      
      // Berechne Rückfahrt-Zeit: Differenz zwischen End-Schritt und letztem Job-Schritt
      const endCumulativeTime = endStep?.duration || 0;
      const lastJobCumulativeTime = lastJobStep?.duration || 0;
      const returnTravelTime = endCumulativeTime - lastJobCumulativeTime;
      
      console.log(`Return trip: Distance=${endStep?.distance}km, Segment Duration=${returnTravelTime}s (${Math.round(returnTravelTime/60)}min)`);
      
      this.endTime = new Date(currentTime.getTime() + returnTravelTime * 1000);
    }
  }

  private getWaypointByLocation(location: [number, number]): RouteWaypoint | null {
    if (!location) {
      return null;
    }
    return this.waypoints.find(wp =>
      Math.abs(wp.location[0] - location[0]) < 0.00001 &&
      Math.abs(wp.location[1] - location[1]) < 0.00001
    ) || null;
  }

  private describeWaypoint(stopId: number): {
    stopId: number;
    customer: Customer | null;
    name: string;
    customerNumber?: string;
    address: string;
  } {
    const customer = this.selectedCustomers.find(item => item.id === stopId) || null;
    if (customer) {
      return {
        stopId,
        customer,
        name: customer.last_name_company || customer.name,
        customerNumber: customer.customer_number,
        address: this.routeStopAddress(customer)
      };
    }
    const extra = this.extraStops.find(item => item.id === stopId);
    if (extra) {
      return {
        stopId,
        customer: null,
        name: extra.label || extra.street,
        address: `${extra.street}, ${extra.postalCode} ${extra.city}`
      };
    }
    return {
      stopId,
      customer: null,
      name: 'Unbekannter Stopp',
      address: 'Unbekannte Adresse'
    };
  }

  private getCustomerNameByLocation(location: [number, number]): string {
    const waypoint = this.getWaypointByLocation(location);
    return waypoint ? this.describeWaypoint(waypoint.customerId).name : 'Unbekannter Stopp';
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
          address: this.routeStopAddress(customer)
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
    if (!this.routeData || !this.optimalOrder.length) return;
    const container = document.querySelector('.route-results') as HTMLElement | null;
    if (!container) return;

    // Dynamisch laden (kleinere Bundle-Größe): html2canvas für HTML -> Canvas, jsPDF für PDF-Erstellung
    Promise.all([
      import('html2canvas'),
      import('jspdf')
    ]).then(([html2canvasModule, jsPDFModule]) => {
      const html2canvas = html2canvasModule.default as any;
      const jsPDF = jsPDFModule.default as any;
      this.exportRouteAsStyledPDF(container, html2canvas, jsPDF);
    });
  }

  private generateRoutePDF(jsPDF: any, autoTable: any) {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(18);
    doc.text('Route-Ergebnis', 14, 18);

    doc.setFontSize(12);
    const dateStr = new Date().toLocaleDateString('de-DE');
    const startTimeStr = this.actualStartTime
      ? this.formatTime(this.actualStartTime)
      : this.startTime;
    const endTimeStr = this.endTime ? this.formatTime(this.endTime) : '-';

    doc.text(`Datum: ${dateStr}`, 14, 26);
    doc.text(`Startzeit: ${startTimeStr}`, 14, 32);
    doc.text(`Endzeit: ${endTimeStr}`, 14, 38);
    doc.text(`Gesamtdistanz: ${this.formatDistance(this.totalDistance)}`, 120, 26);
    doc.text(`Gesamtzeit: ${this.formatDuration(this.totalDuration)}`, 120, 32);

    // Tabelle der Stopps
    const tableBody = this.optimalOrder.map(stop => [
      String(stop.position),
      stop.name || '',
      stop.customerNumber || '',
      stop.address || '',
      this.formatTime(stop.arrivalTime),
      stop.departureTime ? this.formatTime(stop.departureTime) : '-',
      `${stop.stayDuration ?? 0} min`,
      `${Math.max(0, Math.round((stop.travelTime || 0) / 60))} min`
    ]);

    autoTable(doc, {
      head: [['Stopp', 'Kunde', 'Kundennr.', 'Adresse', 'Ankunft', 'Abfahrt', 'Aufenthalt', 'Fahrtzeit']],
      body: tableBody,
      startY: 46,
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 14 },
        1: { cellWidth: 42 },
        2: { cellWidth: 22 },
        3: { cellWidth: 60 },
        4: { cellWidth: 22 },
        5: { cellWidth: 22 },
        6: { cellWidth: 22 },
        7: { cellWidth: 22 }
      }
    });

    // Direktdruck anstoßen
    const filename = `route_${new Date().toISOString().split('T')[0]}.pdf`;
    try {
      doc.autoPrint();
      const pdfUrl = doc.output('bloburl');
      window.open(pdfUrl, '_blank');
    } catch (_) {
      // Fallback: Speichern
      try { doc.save(filename); } catch {}
    }
  }

  // Exportiert die Route-Ergebnisse als PDF, indem der gestylte HTML-Bereich gerendert wird
  private exportRouteAsStyledPDF(container: HTMLElement, html2canvas: any, jsPDF: any): void {
    // Optional: temporär eine Klasse setzen, um UI-Elemente für den Export zu optimieren
    container.classList.add('exporting');

    // Elemente ignorieren, die nicht im PDF erscheinen sollen (Buttons, Karte)
    const ignoreElement = (el: Element) => {
      const classList = (el as HTMLElement).classList || { contains: () => false } as any;
      return (
        classList.contains('export-section') ||
        classList.contains('driver-nav') ||
        classList.contains('step-navigation-footer') ||
        classList.contains('map-container') ||
        classList.contains('btn')
      );
    };

    // Mit höherem Scale rendern für schärfere Ausgabe
    html2canvas(container, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      ignoreElements: ignoreElement
    }).then((canvas: HTMLCanvasElement) => {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10; // mm

      const imgWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const imgData = canvas.toDataURL('image/png');

      let heightLeft = imgHeight;
      let position = margin;

      // Erste Seite
      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= (pageHeight - margin * 2);

      // Weitere Seiten (Bild mit negativem Offset platzieren, Seitenrand berücksichtigen)
      while (heightLeft > 0) {
        pdf.addPage();
        position = margin - (imgHeight - heightLeft);
        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight, undefined, 'FAST');
        heightLeft -= (pageHeight - margin * 2);
      }

      const filename = `route_${new Date().toISOString().split('T')[0]}.pdf`;
      try {
        pdf.autoPrint();
        const pdfUrl = pdf.output('bloburl');
        window.open(pdfUrl, '_blank');
      } catch (_) {
        // Fallback: Speichern, falls autoPrint/Tab-Öffnen blockiert ist
        try { pdf.save(filename); } catch {}
      } finally {
        container.classList.remove('exporting');
      }
    }).catch(() => {
      container.classList.remove('exporting');
      // Fallback auf tabellarischen Export falls HTML-Render fehlschlägt
      import('jspdf-autotable').then(({ default: autoTable }) => {
        this.generateRoutePDF(jsPDF, autoTable);
      });
    });
  }

  /** Startpunkt für Google Maps. null = Gerätestandort (GPS-Start), damit Maps nicht in die Vorschau fällt. */
  private mapsOrigin(): MapsPlace | null {
    if (this.calculatedStartMode === 'gps') {
      return null;
    }
    return { ...this.calculatedStart };
  }

  /** Google-Maps-Links der Gesamtroute in optimierter Reihenfolge (mehrere nur bei mehr als 9 Stopps). */
  get routeOverviewUrls(): string[] {
    if (!this.routeData || !this.optimalOrder.length) {
      return [];
    }
    return buildRouteOverviewUrls({
      origin: this.mapsOrigin(),
      destination: { ...this.calculatedEnd },
      stops: this.navTargets.filter(target => target.position !== null)
    });
  }

  get overviewMayBeTrimmedInBrowser(): boolean {
    return this.optimalOrder.length > MAX_WAYPOINTS_MOBILE_BROWSER;
  }

  /** Stopps in optimaler Reihenfolge, danach das Routenziel. */
  get navTargets(): NavTarget[] {
    const stops: NavTarget[] = this.optimalOrder.map(stop => {
      const waypoint = this.waypoints.find(wp => wp.customerId === stop.stopId);
      return {
        label: stop.address,
        name: stop.name,
        position: stop.position,
        longitude: waypoint?.location[0],
        latitude: waypoint?.location[1]
      };
    });
    if (stops.length === 0) {
      return [];
    }
    return [...stops, { ...this.calculatedEnd, name: 'Ziel', position: null }];
  }

  get nextNavTarget(): NavTarget | null {
    return this.navTargets[this.navIndex] ?? null;
  }

  get nextNavUrl(): string {
    const target = this.nextNavTarget;
    return target ? buildNavigateUrl(target) : '';
  }

  navUrlFor(index: number): string {
    const target = this.navTargets[index];
    return target ? buildNavigateUrl(target) : '';
  }

  /** Läuft beim Antippen der Navigations-Links; der Link selbst öffnet Google Maps (App, sonst Browser). */
  onNavigationOpened(index = this.navIndex): void {
    this.navIndex = index;
    this.navOpenedHint = 'Google Maps wurde geöffnet. Zeigt Maps nur die Vorschau, dort auf „Starten“ tippen.';
  }

  markStopDone(): void {
    if (this.navIndex < this.navTargets.length) {
      this.navIndex++;
    }
    this.navOpenedHint = '';
  }

  isStopDone(position: number): boolean {
    return position - 1 < this.navIndex;
  }

  generateShareLink(): string {
    return this.routeOverviewUrls[0] ?? '';
  }

  async showRouteQr(): Promise<void> {
    const shareUrl = this.generateShareLink();
    if (!shareUrl) {
      alert('Keine Route verfügbar zum Teilen.');
      return;
    }
    try {
      this.routeQrDataUrl = await QRCode.toDataURL(shareUrl, {
        errorCorrectionLevel: 'L',
        margin: 2,
        width: 320
      });
    } catch {
      this.routeQrDataUrl = null;
      alert('Die Route ist zu lang für einen QR-Code. Nutze das PDF.');
    }
  }

  closeRouteQr(): void {
    this.routeQrDataUrl = null;
  }

  async copyShareLink(): Promise<void> {
    const urls = this.routeOverviewUrls;
    if (!urls.length) {
      alert('Keine Route verfügbar zum Teilen.');
      return;
    }
    const shareText = urls.join('\n');

    try {
      await navigator.clipboard.writeText(shareText);
      alert('Google Maps Link wurde in die Zwischenablage kopiert!');
    } catch (err) {
      // Fallback für ältere Browser
      const textArea = document.createElement('textarea');
      textArea.value = shareText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('Google Maps Link wurde in die Zwischenablage kopiert!');
    }
  }

  openInGoogleMaps(): void {
    const url = this.generateShareLink();
    if (!url) {
      alert('Keine Route verfügbar.');
      return;
    }
    window.open(url, '_blank', 'noopener');
  }

  setStartMode(mode: StartMode): void {
    this.gpsError = '';
    if (mode === 'depot') {
      this.startMode = 'depot';
      this.routeStart = { ...DEFAULT_ROUTE_ENDPOINT };
      if (this.endpointEdit === 'start') {
        this.endpointEdit = null;
      }
      return;
    }
    if (mode === 'manual') {
      this.startMode = 'manual';
      if (this.manualStart) {
        this.routeStart = { ...this.manualStart };
      }
      if (this.endpointEdit !== 'start') {
        this.beginEndpointEdit('start');
      }
      return;
    }
    this.startMode = 'gps';
    if (this.endpointEdit === 'start') {
      this.endpointEdit = null;
    }
    this.locateDriver();
  }

  locateDriver(): void {
    const seq = ++this.gpsSeq;
    this.gpsError = '';
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.gpsStatus = 'error';
      this.gpsError = 'Dieses Gerät kann den Standort nicht abfragen. Bitte Depot oder Manuell wählen.';
      return;
    }
    this.gpsStatus = 'locating';
    navigator.geolocation.getCurrentPosition(
      position => {
        if (seq !== this.gpsSeq || this.startMode !== 'gps') {
          return;
        }
        this.routeStart = {
          label: 'Aktueller Standort',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        this.gpsStatus = 'ready';
      },
      error => {
        if (seq !== this.gpsSeq || this.startMode !== 'gps') {
          return;
        }
        this.gpsStatus = 'error';
        this.gpsError = this.geolocationErrorMessage(error);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }

  private geolocationErrorMessage(error: GeolocationPositionError): string {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return 'Standortzugriff verweigert. Bitte den Standort in den Browser- bzw. App-Einstellungen erlauben oder Depot oder Manuell wählen.';
      case error.POSITION_UNAVAILABLE:
        return 'Standort nicht verfügbar. Ist GPS eingeschaltet? Erneut versuchen oder Depot oder Manuell wählen.';
      case error.TIMEOUT:
        return 'Die Standortsuche hat zu lange gedauert. Bitte erneut versuchen.';
      default:
        return 'Standort konnte nicht ermittelt werden.';
    }
  }

  get startLabel(): string {
    if (this.startMode === 'gps') {
      if (this.gpsStatus === 'ready') {
        return `Aktueller Standort (${this.routeStart.latitude.toFixed(4)}, ${this.routeStart.longitude.toFixed(4)})`;
      }
      return this.gpsStatus === 'locating' ? 'Standort wird ermittelt…' : 'Kein Standort';
    }
    if (this.startMode === 'manual' && !this.manualStart) {
      return 'Bitte Startadresse suchen';
    }
    return this.routeStart.label;
  }

  /** Verhindert, dass bei fehlendem GPS oder fehlender Startadresse still das Depot genommen wird. */
  private ensureStartReady(): boolean {
    if (this.startMode === 'gps' && this.gpsStatus !== 'ready') {
      if (this.gpsStatus !== 'locating') {
        this.gpsStatus = 'error';
        this.gpsError = this.gpsError || 'Kein Standort. Bitte erneut versuchen oder Depot oder Manuell wählen.';
      }
      alert(this.gpsStatus === 'locating'
        ? 'Der Standort wird noch ermittelt. Bitte kurz warten.'
        : this.gpsError);
      return false;
    }
    if (this.startMode === 'manual' && !this.manualStart) {
      alert('Bitte zuerst eine Startadresse auswählen.');
      return false;
    }
    return true;
  }

  goBack() {
    this.router.navigate(['/admin']);
  }

  // Neue Methoden für schrittweise Navigation
  nextStep(): void {
    if (this.currentStep < this.totalSteps) {
      this.currentStep++;
    }
  }

  previousStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  goToStep(step: number): void {
    if (step >= 1 && step <= this.totalSteps) {
      this.currentStep = step;
    }
  }

  canProceedToNextStep(): boolean {
    switch (this.currentStep) {
      case 1: // Kunden auswählen
        return this.selectedCustomers.length + this.extraStops.length > 0;
      case 2: // Route berechnen
        return this.routeData !== null;
      default:
        return true;
    }
  }

  resetToFirstStep(): void {
    this.currentStep = 1;
    this.navIndex = 0;
    this.navOpenedHint = '';
    this.showRoute = false;
    this.routeData = null;
    this.optimalOrder = [];
    this.waypoints = [];
    this.totalDistance = 0;
    this.totalDuration = 0;
    this.routeSteps = [];
    this.actualStartTime = null;
    this.endTime = null;
    this.showMap = false;
    if (this.map) {
      this.destroyMap();
    }
  }

  startNewRoute(): void {
    if (this.selectedCustomers.length === 0) {
      this.resetToFirstStep();
      return;
    }
    this.showNewRouteModal = true;
  }

  confirmNewRoute(clearCustomers: boolean): void {
    this.showNewRouteModal = false;
    if (clearCustomers) {
      this.deselectAllCustomers();
    }
    this.resetToFirstStep();
  }

  cancelNewRoute(): void {
    this.showNewRouteModal = false;
  }

  private persistSelection(): void {
    const addressIds: Record<string, number> = {};
    for (const customer of this.selectedCustomers) {
      const choice = this.routeAddressIds[customer.id];
      if (choice != null) {
        addressIds[String(customer.id)] = choice;
      }
    }
    localStorage.setItem(this.selectionStorageKey, JSON.stringify({
      customerIds: this.selectedCustomers.map(customer => customer.id),
      addressIds
    }));
  }

  private restoreSelection(): void {
    const raw = localStorage.getItem(this.selectionStorageKey);
    if (!raw) {
      return;
    }
    try {
      const saved = JSON.parse(raw) as { customerIds?: number[]; addressIds?: Record<string, number> };
      const ids = new Set(saved.customerIds || []);
      const addressIds: Record<number, number> = {};
      for (const [key, value] of Object.entries(saved.addressIds || {})) {
        const customerId = Number(key);
        if (ids.has(customerId) && Number.isFinite(Number(value))) {
          addressIds[customerId] = Number(value);
        }
      }
      this.routeAddressIds = addressIds;
      for (const customer of this.customers) {
        customer.selected = ids.has(customer.id);
      }
    } catch {
      localStorage.removeItem(this.selectionStorageKey);
    }
  }

  setViewMode(mode: 'route' | 'addresses'): void {
    this.viewMode = mode;
    if (mode === 'addresses') {
      this.resetScanBuffer();
      this.filterAddressCustomers();
      return;
    }
    setTimeout(() => this.focusScanCapture());
  }

  /** Eingabe des integrierten Scanners. Die Geräte senden den Code als Tastaturfolge und schließen mit Enter ab. */
  @HostListener('document:keydown', ['$event'])
  onHardwareScanKey(event: KeyboardEvent): void {
    if (!this.hardwareScanActive() || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) {
      return;
    }

    if (event.key === 'Enter' || event.key === 'Tab' || event.key === 'NumpadEnter') {
      this.commitHardwareScan(event);
      return;
    }

    if (event.key === 'Escape') {
      this.resetScanBuffer();
      return;
    }

    if (event.key.length !== 1) {
      return;
    }

    const now = performance.now();
    if (now - this.lastScanKeyAt > 100) {
      this.scanBuffer = '';
      this.scanStartedAt = now;
      this.scanIsHardware = false;
    }
    this.lastScanKeyAt = now;
    this.scanBuffer += event.key;

    const elapsed = now - this.scanStartedAt;
    if (this.scanBuffer.length >= 6 && elapsed / this.scanBuffer.length < 80) {
      this.scanIsHardware = true;
      event.preventDefault();
      event.stopPropagation();
    }

    if (this.scanIdleTimer) {
      clearTimeout(this.scanIdleTimer);
    }
    this.scanIdleTimer = setTimeout(() => this.commitHardwareScan(), 120);
  }

  onHardwareScanInput(): void {
    const value = this.hardwareScanInput?.nativeElement.value || '';
    if (value.trim().length < 12 || !this.hardwareScanActive()) {
      return;
    }
    this.scanIsHardware = true;
    this.scanBuffer = value.trim();
    if (this.scanIdleTimer) {
      clearTimeout(this.scanIdleTimer);
    }
    this.scanIdleTimer = setTimeout(() => this.commitHardwareScan(), 120);
  }

  private hardwareScanActive(): boolean {
    return this.viewMode === 'route' && this.currentStep < 3;
  }

  private commitHardwareScan(event?: KeyboardEvent): void {
    if (this.scanIdleTimer) {
      clearTimeout(this.scanIdleTimer);
      this.scanIdleTimer = null;
    }

    const fieldValue = this.hardwareScanInput?.nativeElement.value.trim() || '';
    const bufferValue = this.scanBuffer.trim();
    const candidate = fieldValue.length >= bufferValue.length ? fieldValue : bufferValue;
    const fastEnough = this.scanIsHardware && candidate.length >= 12;
    this.resetScanBuffer();

    if (!fastEnough || !this.looksLikeAddressQr(candidate)) {
      return;
    }

    event?.preventDefault();
    event?.stopPropagation();
    this.removeScanFromFocusedField(candidate);
    if (this.hardwareScanInput) {
      this.hardwareScanInput.nativeElement.value = '';
    }
    void this.handleScannedQr(candidate);
    setTimeout(() => this.focusScanCapture(true));
  }

  private looksLikeAddressQr(value: string): boolean {
    return /google\.com\/maps|destination=|maps\/dir/i.test(value)
      || (/^https?:\/\//i.test(value) && /\b\d{5}\b/.test(value))
      || (/\b\d{5}\b/.test(value) && value.includes(',') && value.length >= 16);
  }

  private resetScanBuffer(): void {
    this.scanBuffer = '';
    this.scanStartedAt = 0;
    this.scanIsHardware = false;
  }

  private removeScanFromFocusedField(value: string): void {
    const el = document.activeElement;
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) {
      return;
    }
    if (el === this.hardwareScanInput?.nativeElement) {
      el.value = '';
      return;
    }
    const current = el.value;
    for (let length = Math.min(current.length, value.length); length > 0; length--) {
      if (value.startsWith(current.slice(-length))) {
        el.value = current.slice(0, -length);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
    }
  }

  private focusScanCapture(force = false): void {
    if (!this.hardwareScanActive()) {
      return;
    }
    const input = this.hardwareScanInput?.nativeElement;
    const active = document.activeElement;
    if (!input || active === input) {
      return;
    }
    if (!force && (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement)) {
      return;
    }
    input.focus();
  }

  private cleanScanPayload(value: string): string {
    return value
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/^\][A-Za-z]\d/, '')
      .trim();
  }

  private async handleScannedQr(raw: string): Promise<void> {
    const value = this.cleanScanPayload(String(raw || ''));
    if (!value) {
      return;
    }
    const now = Date.now();
    if (value === this.lastQrValue && now - this.lastQrAt < 2500) {
      return;
    }
    this.lastQrValue = value;
    this.lastQrAt = now;
    const seq = ++this.qrSeq;

    const sharedRoute = parseSharedRouteUrl(value);
    if (sharedRoute) {
      window.open(sharedRoute, '_blank');
      this.qrScanStatus = 'success';
      this.qrScanMessage = 'Geteilte Route wird in Google Maps geöffnet.';
      return;
    }

    const address = this.extractAddressFromQr(value);
    if (!address) {
      this.qrScanStatus = 'error';
      this.qrScanMessage = 'Dieser QR-Code enthält keine Adresse.';
      return;
    }

    const customer = this.findCustomerByAddress(address);
    if (customer) {
      const name = customer.last_name_company || customer.name || 'Kunde';
      if (!customer.selected) {
        if (this.needsAddressChoice(customer)) {
          this.askForRouteAddress([customer]);
          this.qrScanStatus = 'info';
          this.qrScanMessage = `${name}: Bitte eine Adresse für die Route wählen.`;
          return;
        }
        customer.selected = true;
        this.updateSelectedCustomers();
        this.qrScanStatus = 'success';
        this.qrScanMessage = `${name} wurde zur Route hinzugefügt.`;
      } else {
        this.qrScanStatus = 'info';
        this.qrScanMessage = `${name} ist bereits in der Route.`;
      }
      return;
    }

    this.qrScanStatus = 'info';
    this.qrScanMessage = 'Kein Kunde mit dieser Adresse. Stopp wird gesucht…';
    const stop = await this.geocodeScannedAddress(address);
    if (seq !== this.qrSeq) {
      return;
    }
    if (!stop) {
      this.qrScanStatus = 'error';
      this.qrScanMessage = `Kein Kunde für „${address}“ gefunden.`;
      return;
    }

    const stopKey = this.addressKey(`${stop.street} ${stop.postalCode} ${stop.city}`);
    const alreadyAdded = this.extraStops.some(existing =>
      this.addressKey(`${existing.street} ${existing.postalCode} ${existing.city}`) === stopKey
    );
    if (alreadyAdded) {
      this.qrScanStatus = 'info';
      this.qrScanMessage = `${stop.street}, ${stop.postalCode} ${stop.city} ist bereits ein Stopp.`;
      return;
    }

    this.extraStops = [...this.extraStops, stop];
    this.extraStopsOpen = true;
    this.qrScanStatus = 'success';
    this.qrScanMessage = `Stopp hinzugefügt: ${stop.street}, ${stop.postalCode} ${stop.city}`;
  }

  private extractAddressFromQr(raw: string): string {
    const text = raw.trim();
    try {
      const url = new URL(text);
      const destination = url.searchParams.get('destination')
        || url.searchParams.get('query')
        || url.searchParams.get('q');
      if (destination) {
        return destination.trim();
      }
    } catch {
      // Kein URL, weiter als Klartext prüfen.
    }

    const geoMatch = text.match(/^geo:[^?]*\?q=([^&]+)/i);
    if (geoMatch) {
      return decodeURIComponent(geoMatch[1]).trim();
    }

    if (/\d{5}/.test(text) && !/^https?:/i.test(text)) {
      return text;
    }
    return '';
  }

  private findCustomerByAddress(address: string): Customer | null {
    const matches = this.customers.filter(customer => this.customerMatchesAddress(customer, address));
    if (matches.length === 0) {
      return null;
    }
    return matches.find(customer => !customer.selected) || matches[0];
  }

  private customerMatchesAddress(customer: Customer, address: string): boolean {
    const scannedKey = this.addressKey(address);
    const candidates = this.customerAddressLines(customer);
    if (candidates.some(line => this.addressKey(line) === scannedKey)) {
      return true;
    }

    const postal = (address.match(/\b(\d{5})\b/) || [])[1] || '';
    const scannedStreet = this.addressKey(address.replace(/\b\d{5}\b/, ''));
    if (!postal || scannedStreet.length < 4) {
      return false;
    }
    return candidates.some(line => {
      const candidateKey = this.addressKey(line);
      if (!candidateKey.includes(postal)) {
        return false;
      }
      const candidateStreet = this.addressKey(line.replace(/\b\d{5}\b/, ''));
      return candidateStreet === scannedStreet
        || candidateStreet.includes(scannedStreet)
        || scannedStreet.includes(candidateStreet);
    });
  }

  private customerAddressLines(customer: Customer): string[] {
    const lines = [this.masterAddressLine(customer)];
    for (const delivery of customer.deliveryAddresses || []) {
      lines.push(`${delivery.street}, ${delivery.postal_code} ${delivery.city}`);
    }
    return lines.map(line => line.trim()).filter(Boolean);
  }

  private addressKey(value: string): string {
    return this.normalizeSearchTerm(value).replace(/[\s-]+/g, '');
  }

  private async geocodeScannedAddress(address: string): Promise<ExtraRouteStop | null> {
    try {
      const response = await fetch(
        `https://api.heigit.org/pelias/v1/search?api_key=${this.OPENROUTE_API_KEY}&text=${encodeURIComponent(address)}&boundary.country=DE&size=1`
      );
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      const feature = data.features?.[0];
      const coordinates = feature?.geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) {
        return null;
      }
      const longitude = Number(coordinates[0]);
      const latitude = Number(coordinates[1]);
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        return null;
      }
      const props = feature.properties || {};
      const street = [props.street, props.housenumber].filter(Boolean).join(' ').trim()
        || String(props.name || address).trim();
      const postalCode = String(props.postalcode || (address.match(/\b(\d{5})\b/) || [])[1] || '').trim();
      const city = String(props.locality || props.localadmin || props.county || '').trim();
      return {
        id: this.nextExtraStopId--,
        label: '',
        street,
        postalCode,
        city,
        longitude,
        latitude
      };
    } catch {
      return null;
    }
  }

  getDefaultDeliveryAddress(customer: Customer): DeliveryAddress | null {
    const addresses = customer.deliveryAddresses || [];
    return addresses.find(address => address.is_default) || addresses[0] || null;
  }

  routeDeliveryAddress(customer: Customer): DeliveryAddress | null {
    const addresses = customer.deliveryAddresses || [];
    const chosenId = this.routeAddressIds[customer.id];
    if (chosenId === 0) {
      return null;
    }
    if (chosenId != null) {
      return addresses.find(address => address.id === chosenId) || null;
    }
    if (addresses.length === 1 && !this.hasMasterAddress(customer)) {
      return addresses[0];
    }
    return null;
  }

  hasMasterAddress(customer: Customer): boolean {
    return this.masterAddressLine(customer).length > 0;
  }

  awaitsAddressChoice(customer: Customer): boolean {
    return this.needsAddressChoice(customer);
  }

  askForRouteAddress(customers: Customer[]): void {
    const pending = customers.filter(customer => this.needsAddressChoice(customer) && this.routeAddressIds[customer.id] == null);
    if (pending.length === 0) {
      return;
    }
    if (this.addressChoiceCustomer) {
      const queued = new Set<number>([
        this.addressChoiceCustomer.id,
        ...this.addressChoiceQueue.map(customer => customer.id)
      ]);
      for (const customer of pending) {
        if (!queued.has(customer.id)) {
          this.addressChoiceQueue.push(customer);
        }
      }
      return;
    }
    this.addressChoiceCustomer = pending[0];
    this.addressChoiceQueue = pending.slice(1);
  }

  confirmAddressChoice(address: DeliveryAddress | null): void {
    const customer = this.addressChoiceCustomer;
    if (!customer) {
      return;
    }
    if (address && address.customer_id !== customer.id) {
      return;
    }
    this.routeAddressIds = { ...this.routeAddressIds, [customer.id]: address ? address.id : 0 };
    customer.selected = true;
    this.updateSelectedCustomers();
    this.showNextAddressChoice();
  }

  cancelAddressChoice(): void {
    this.addressChoiceCustomer = null;
    this.addressChoiceQueue = [];
  }

  private needsAddressChoice(customer: Customer): boolean {
    if (this.routeAddressIds[customer.id] != null) {
      return false;
    }
    const deliveryCount = customer.deliveryAddresses?.length || 0;
    const optionCount = deliveryCount + (this.hasMasterAddress(customer) ? 1 : 0);
    return optionCount > 1;
  }

  private ensureAddressChoices(): boolean {
    const pending = this.selectedCustomers.filter(customer => this.needsAddressChoice(customer));
    if (pending.length === 0) {
      return true;
    }
    this.askForRouteAddress(pending);
    return false;
  }

  private showNextAddressChoice(): void {
    while (this.addressChoiceQueue.length > 0) {
      const next = this.addressChoiceQueue.shift()!;
      if (this.needsAddressChoice(next)) {
        this.addressChoiceCustomer = next;
        return;
      }
    }
    this.addressChoiceCustomer = null;
  }

  private clearRouteAddress(customerId: number): void {
    if (this.routeAddressIds[customerId] == null) {
      return;
    }
    const next = { ...this.routeAddressIds };
    delete next[customerId];
    this.routeAddressIds = next;
  }

  masterAddressLine(customer: Customer): string {
    const street = [customer.street || customer.address, customer.house_number].filter(Boolean).join(' ').trim();
    const cityLine = `${customer.postal_code || ''} ${customer.city || ''}`.trim();
    return [street, cityLine].filter(Boolean).join(', ');
  }

  routeStopAddress(customer: Customer): string {
    if (this.routeAddressIds[customer.id] === 0) {
      return `Stammdaten: ${this.masterAddressLine(customer)}`;
    }
    const delivery = this.routeDeliveryAddress(customer);
    if (!delivery) {
      return this.masterAddressLine(customer);
    }
    const label = delivery.label ? `${delivery.label}: ` : '';
    return `${label}${delivery.street}, ${delivery.postal_code} ${delivery.city}`;
  }

  startAddressEdit(customer: Customer): void {
    this.editingCustomerId = customer.id;
    this.addressQuery = '';
    this.addressSuggestions = [];
    this.selectedAddressSuggestion = null;
    this.addressLabel = '';
    this.addressActionError = '';
  }

  cancelAddressEdit(): void {
    this.editingCustomerId = null;
    this.addressQuery = '';
    this.addressSuggestions = [];
    this.selectedAddressSuggestion = null;
    this.addressLabel = '';
    this.addressActionError = '';
  }

  useMasterAddressQuery(customer: Customer): void {
    this.addressQuery = this.masterAddressLine(customer);
    this.selectedAddressSuggestion = null;
    this.searchAddressSuggestions();
  }

  onAddressQueryInput(): void {
    this.selectedAddressSuggestion = null;
    this.addressActionError = '';
    if (this.addressSearchTimer) {
      clearTimeout(this.addressSearchTimer);
    }
    this.addressSearchTimer = setTimeout(() => {
      this.searchAddressSuggestions();
    }, 300);
  }

  selectAddressSuggestion(suggestion: AddressSuggestion): void {
    this.selectedAddressSuggestion = suggestion;
    this.addressQuery = suggestion.label;
    this.addressSuggestions = [];
    this.addressActionError = '';
  }

  async saveDeliveryAddress(customer: Customer): Promise<void> {
    const suggestion = this.selectedAddressSuggestion;
    if (!suggestion) {
      this.addressActionError = 'Bitte einen Adressvorschlag auswählen. Freitext wird nicht gespeichert.';
      return;
    }
    if (!suggestion.postalCode) {
      this.addressActionError = 'Dieser Vorschlag hat keine Postleitzahl und kann nicht als Lieferadresse gespeichert werden.';
      return;
    }

    this.isSavingAddress = true;
    this.addressActionError = '';
    try {
      const response = await fetch(`${environment.apiUrl}/api/customers/${customer.id}/delivery-addresses`, {
        method: 'POST',
        headers: this.authHeaders(),
        body: JSON.stringify({
          label: this.addressLabel.trim() || suggestion.placeName || null,
          street: suggestion.street,
          postal_code: suggestion.postalCode,
          city: suggestion.city,
          country: suggestion.country,
          latitude: suggestion.latitude,
          longitude: suggestion.longitude
        })
      });
      if (!response.ok) {
        throw new Error(await this.readApiError(response));
      }
      const created = this.normalizeDeliveryAddress(await response.json());
      this.upsertCustomerAddress(customer.id, created, false);
      this.cancelAddressEdit();
    } catch (error) {
      this.addressActionError = error instanceof Error ? error.message : 'Lieferadresse konnte nicht gespeichert werden.';
    } finally {
      this.isSavingAddress = false;
    }
  }

  async makeDefaultDeliveryAddress(address: DeliveryAddress): Promise<void> {
    this.addressActionError = '';
    try {
      const response = await fetch(`${environment.apiUrl}/api/customers/delivery-addresses/${address.id}/default`, {
        method: 'PATCH',
        headers: this.authHeaders()
      });
      if (!response.ok) {
        throw new Error(await this.readApiError(response));
      }
      this.markDefaultAddress(address.customer_id, address.id);
    } catch (error) {
      this.addressActionError = error instanceof Error ? error.message : 'Standardadresse konnte nicht gesetzt werden.';
    }
  }

  async removeDeliveryAddress(address: DeliveryAddress): Promise<void> {
    if (!confirm('Diese Lieferadresse wirklich entfernen?')) {
      return;
    }
    this.addressActionError = '';
    try {
      const response = await fetch(`${environment.apiUrl}/api/customers/delivery-addresses/${address.id}`, {
        method: 'DELETE',
        headers: this.authHeaders()
      });
      if (!response.ok) {
        throw new Error(await this.readApiError(response));
      }
      this.removeCustomerAddress(address);
    } catch (error) {
      this.addressActionError = error instanceof Error ? error.message : 'Lieferadresse konnte nicht entfernt werden.';
    }
  }

  private loadDeliveryAddresses(): void {
    this.addressLoadError = '';
    fetch(`${environment.apiUrl}/api/customers/delivery-addresses`, {
      headers: this.authHeaders()
    })
      .then(async response => {
        if (!response.ok) {
          throw new Error(await this.readApiError(response));
        }
        return response.json();
      })
      .then((rows: any[]) => {
        this.deliveryAddresses = (rows || []).map(row => this.normalizeDeliveryAddress(row));
        this.attachDeliveryAddresses();
      })
      .catch(error => {
        console.error('Fehler beim Laden der Lieferadressen:', error);
        this.addressLoadError = 'Lieferadressen konnten nicht geladen werden.';
      });
  }

  private attachDeliveryAddresses(): void {
    const grouped = new Map<number, DeliveryAddress[]>();
    for (const address of this.deliveryAddresses) {
      const list = grouped.get(address.customer_id) || [];
      list.push(address);
      grouped.set(address.customer_id, list);
    }
    for (const customer of this.customers) {
      customer.deliveryAddresses = (grouped.get(customer.id) || [])
        .sort((a, b) => Number(b.is_default) - Number(a.is_default));
    }
  }

  private upsertCustomerAddress(customerId: number, address: DeliveryAddress, replaceExisting: boolean): void {
    const others = this.deliveryAddresses.filter(item => item.customer_id !== customerId || (!replaceExisting && item.id !== address.id));
    const sameCustomer = others.filter(item => item.customer_id === customerId);
    if (address.is_default) {
      sameCustomer.forEach(item => item.is_default = false);
    }
    this.deliveryAddresses = [...others.filter(item => item.customer_id !== customerId), ...sameCustomer, address];
    this.attachDeliveryAddresses();
  }

  private markDefaultAddress(customerId: number, addressId: number): void {
    this.deliveryAddresses = this.deliveryAddresses.map(address => {
      if (address.customer_id !== customerId) {
        return address;
      }
      return { ...address, is_default: address.id === addressId };
    });
    this.attachDeliveryAddresses();
  }

  private removeCustomerAddress(address: DeliveryAddress): void {
    const remaining = this.deliveryAddresses.filter(item => item.id !== address.id);
    const stillDefault = remaining.some(item => item.customer_id === address.customer_id && item.is_default);
    if (!stillDefault) {
      const next = [...remaining].reverse().find(item => item.customer_id === address.customer_id);
      if (next) {
        next.is_default = true;
      }
    }
    this.deliveryAddresses = remaining;
    this.attachDeliveryAddresses();
  }

  private normalizeDeliveryAddress(row: any): DeliveryAddress {
    return {
      id: Number(row.id),
      customer_id: Number(row.customer_id),
      label: row.label || null,
      street: row.street,
      postal_code: row.postal_code,
      city: row.city,
      country: row.country || 'Deutschland',
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      is_default: Boolean(row.is_default)
    };
  }

  private async searchAddressSuggestions(): Promise<void> {
    const query = this.addressQuery.trim();
    const requestId = ++this.addressSearchSeq;
    this.addressSuggestions = [];
    if (query.length < 3) {
      this.isSearchingAddresses = false;
      return;
    }

    this.isSearchingAddresses = true;
    try {
      const url = this.suggestionSearchUrl(query);
      const response = await fetch(url);
      if (requestId !== this.addressSearchSeq) {
        return;
      }
      if (!response.ok) {
        throw new Error('Adressvorschläge sind gerade nicht erreichbar.');
      }
      const data = await response.json();
      const suggestions = (data.features || [])
        .map((feature: any) => this.toAddressSuggestion(feature))
        .filter((suggestion: AddressSuggestion | null): suggestion is AddressSuggestion => suggestion !== null);
      if (requestId !== this.addressSearchSeq) {
        return;
      }
      this.addressSuggestions = suggestions;
      this.addressActionError = suggestions.length === 0
        ? 'Keine Adresse und kein Geschäft gefunden.'
        : '';
    } catch (error) {
      if (requestId !== this.addressSearchSeq) {
        return;
      }
      this.addressActionError = error instanceof Error ? error.message : 'Adressvorschläge sind gerade nicht erreichbar.';
    } finally {
      if (requestId === this.addressSearchSeq) {
        this.isSearchingAddresses = false;
      }
    }
  }

  onExtraStopQueryInput(): void {
    this.selectedExtraSuggestion = null;
    this.extraStopError = '';
    if (this.extraStopSearchTimer) {
      clearTimeout(this.extraStopSearchTimer);
    }
    this.extraStopSearchTimer = setTimeout(() => {
      this.searchExtraStopSuggestions();
    }, 300);
  }

  selectExtraSuggestion(suggestion: AddressSuggestion): void {
    this.selectedExtraSuggestion = suggestion;
    this.extraStopQuery = suggestion.label;
    this.extraStopSuggestions = [];
    this.extraStopError = '';
  }

  addExtraStop(): void {
    const suggestion = this.selectedExtraSuggestion;
    if (!suggestion) {
      this.extraStopError = 'Bitte einen Adressvorschlag auswählen.';
      return;
    }
    this.extraStops = [...this.extraStops, {
      id: this.nextExtraStopId--,
      label: this.extraStopLabel.trim() || suggestion.placeName || '',
      street: suggestion.street,
      postalCode: suggestion.postalCode,
      city: suggestion.city,
      longitude: suggestion.longitude,
      latitude: suggestion.latitude
    }];
    this.extraStopQuery = '';
    this.extraStopLabel = '';
    this.selectedExtraSuggestion = null;
    this.extraStopSuggestions = [];
    this.extraStopError = '';
  }

  removeExtraStop(stopId: number): void {
    this.extraStops = this.extraStops.filter(stop => stop.id !== stopId);
  }

  isDefaultEndpoint(endpoint: RouteEndpoint): boolean {
    return endpoint.label === DEFAULT_ROUTE_ENDPOINT.label
      && endpoint.longitude === DEFAULT_ROUTE_ENDPOINT.longitude
      && endpoint.latitude === DEFAULT_ROUTE_ENDPOINT.latitude;
  }

  beginEndpointEdit(which: 'start' | 'end'): void {
    this.endpointEdit = this.endpointEdit === which ? null : which;
    this.endpointQuery = '';
    this.endpointSuggestions = [];
    this.endpointSearchError = '';
  }

  resetEndpoint(which: 'start' | 'end'): void {
    if (which === 'start') {
      this.setStartMode('depot');
      return;
    } else {
      this.routeEnd = { ...DEFAULT_ROUTE_ENDPOINT };
    }
    if (this.endpointEdit === which) {
      this.endpointEdit = null;
    }
  }

  onEndpointQueryInput(): void {
    this.endpointSearchError = '';
    if (this.endpointSearchTimer) {
      clearTimeout(this.endpointSearchTimer);
    }
    this.endpointSearchTimer = setTimeout(() => {
      void this.searchEndpointSuggestions();
    }, 300);
  }

  selectEndpointSuggestion(suggestion: AddressSuggestion): void {
    const next: RouteEndpoint = {
      label: suggestion.label,
      longitude: suggestion.longitude,
      latitude: suggestion.latitude
    };
    if (this.endpointEdit === 'start') {
      this.routeStart = next;
      this.manualStart = { ...next };
      this.startMode = 'manual';
      this.gpsSeq++;
      this.gpsError = '';
    } else if (this.endpointEdit === 'end') {
      this.routeEnd = next;
    }
    this.endpointEdit = null;
    this.endpointQuery = '';
    this.endpointSuggestions = [];
    this.endpointSearchError = '';
  }

  private endpointLngLat(endpoint: RouteEndpoint): [number, number] {
    return [endpoint.longitude, endpoint.latitude];
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private async searchEndpointSuggestions(): Promise<void> {
    const query = this.endpointQuery.trim();
    const requestId = ++this.endpointSearchSeq;
    this.endpointSuggestions = [];
    if (query.length < 3) {
      this.isSearchingEndpoint = false;
      return;
    }

    this.isSearchingEndpoint = true;
    try {
      const response = await fetch(this.suggestionSearchUrl(query));
      if (requestId !== this.endpointSearchSeq) {
        return;
      }
      if (!response.ok) {
        throw new Error('Adressvorschläge sind gerade nicht erreichbar.');
      }
      const data = await response.json();
      const suggestions = (data.features || [])
        .map((feature: any) => this.toAddressSuggestion(feature))
        .filter((suggestion: AddressSuggestion | null): suggestion is AddressSuggestion => suggestion !== null);
      if (requestId !== this.endpointSearchSeq) {
        return;
      }
      this.endpointSuggestions = suggestions;
      this.endpointSearchError = suggestions.length === 0
        ? 'Keine Adresse und kein Geschäft gefunden.'
        : '';
    } catch (error) {
      if (requestId !== this.endpointSearchSeq) {
        return;
      }
      this.endpointSearchError = error instanceof Error ? error.message : 'Adressvorschläge sind gerade nicht erreichbar.';
    } finally {
      if (requestId === this.endpointSearchSeq) {
        this.isSearchingEndpoint = false;
      }
    }
  }

  private async searchExtraStopSuggestions(): Promise<void> {
    const query = this.extraStopQuery.trim();
    const requestId = ++this.extraStopSearchSeq;
    this.extraStopSuggestions = [];
    if (query.length < 3) {
      this.isSearchingExtraStops = false;
      return;
    }

    this.isSearchingExtraStops = true;
    try {
      const url = this.suggestionSearchUrl(query);
      const response = await fetch(url);
      if (requestId !== this.extraStopSearchSeq) {
        return;
      }
      if (!response.ok) {
        throw new Error('Adressvorschläge sind gerade nicht erreichbar.');
      }
      const data = await response.json();
      const suggestions = (data.features || [])
        .map((feature: any) => this.toAddressSuggestion(feature))
        .filter((suggestion: AddressSuggestion | null): suggestion is AddressSuggestion => suggestion !== null);
      if (requestId !== this.extraStopSearchSeq) {
        return;
      }
      this.extraStopSuggestions = suggestions;
      this.extraStopError = suggestions.length === 0
        ? 'Keine Adresse und kein Geschäft gefunden.'
        : '';
    } catch (error) {
      if (requestId !== this.extraStopSearchSeq) {
        return;
      }
      this.extraStopError = error instanceof Error ? error.message : 'Adressvorschläge sind gerade nicht erreichbar.';
    } finally {
      if (requestId === this.extraStopSearchSeq) {
        this.isSearchingExtraStops = false;
      }
    }
  }

  private suggestionSearchUrl(query: string): string {
    return `https://api.heigit.org/pelias/v1/autocomplete?api_key=${this.OPENROUTE_API_KEY}&text=${encodeURIComponent(query)}&boundary.country=DE&layers=venue,address&size=8`;
  }

  private toAddressSuggestion(feature: any): AddressSuggestion | null {
    const props = feature?.properties || {};
    const coordinates = feature?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return null;
    }
    const layer = String(props.layer || '');
    if (layer !== 'address' && layer !== 'venue') {
      return null;
    }
    const longitude = Number(coordinates[0]);
    const latitude = Number(coordinates[1]);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      return null;
    }

    const streetName = String(props.street || '').trim();
    const houseNumber = String(props.housenumber || '').trim();
    const postalCode = String(props.postalcode || '').trim();
    const city = String(props.locality || props.localadmin || props.county || '').trim();
    const placeName = layer === 'venue' ? String(props.name || '').trim() : '';
    const streetLine = [streetName, houseNumber].filter(Boolean).join(' ').trim();
    if (!city) {
      return null;
    }
    if (layer === 'address' && (!streetName || !houseNumber || !postalCode)) {
      return null;
    }
    if (layer === 'venue' && !placeName) {
      return null;
    }

    const street = streetLine || placeName;
    const location = [streetLine, `${postalCode} ${city}`.trim()].filter(Boolean).join(', ');
    const label = placeName && streetLine
      ? `${placeName}, ${location}`
      : String(props.label || location);
    return {
      label,
      street,
      postalCode,
      city,
      country: String(props.country || 'Deutschland'),
      longitude,
      latitude,
      placeName: placeName || undefined
    };
  }

  private authHeaders(): HeadersInit {
    const token = localStorage.getItem('token');
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  private async readApiError(response: Response): Promise<string> {
    try {
      const data = await response.json();
      return data?.error || 'Anfrage fehlgeschlagen.';
    } catch {
      return 'Anfrage fehlgeschlagen.';
    }
  }
} 