import { Injectable } from '@angular/core';

export interface DeliveryFeeResult {
  price: number;
  distanceKm: number | null;
  note: string;
}

@Injectable({ providedIn: 'root' })
export class DeliveryFeeService {
  static readonly ARTICLE_NUMBER = 'liepau';
  private static readonly OPENROUTE_API_KEY =
    'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImQ4N2IyM2NjZTA1NTQyNTNiNDZmODhhZmQ1NDE1NDBhIiwiaCI6Im11cm11cjY0In0=';
  private static readonly WAREHOUSE_LAT = 49.6326;
  private static readonly WAREHOUSE_LNG = 8.3594;
  private static readonly RATE_PER_KM = 0.3;
  private static readonly MIN_DISTANCE_KM = 10;

  private readonly geocodeCache = new Map<string, { lat: number; lng: number }>();

  isLieferpauschaleArticle(article: { article_number?: string } | null | undefined): boolean {
    return String(article?.article_number ?? '').toLowerCase() === DeliveryFeeService.ARTICLE_NUMBER;
  }

  buildDeliveryAddressQuery(customer: Record<string, unknown> | null | undefined): string | null {
    if (!customer) {
      return null;
    }

    const deliveryStreet = String(customer['delivery_address'] ?? '').trim();
    const deliveryPostalCode = String(customer['delivery_postal_code'] ?? '').trim();
    const deliveryCity = String(customer['delivery_city'] ?? '').trim();
    const hasDeliveryAddress = Boolean(deliveryStreet || deliveryPostalCode || deliveryCity);

    const street = hasDeliveryAddress
      ? deliveryStreet
      : String(customer['street'] ?? '').trim();
    const postalCode = hasDeliveryAddress
      ? deliveryPostalCode
      : String(customer['postal_code'] ?? '').trim();
    const city = hasDeliveryAddress
      ? deliveryCity
      : String(customer['city'] ?? '').trim();

    if (!street && !postalCode && !city) {
      return null;
    }

    const parts = [street, `${postalCode} ${city}`.trim(), 'Deutschland'].filter(Boolean);
    return parts.join(', ');
  }

  haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  }

  calculatePrice(distanceKm: number): number {
    if (distanceKm < DeliveryFeeService.MIN_DISTANCE_KM) {
      return 0;
    }

    return Math.round(distanceKm * DeliveryFeeService.RATE_PER_KM * 100) / 100;
  }

  async calculateForCustomer(customer: Record<string, unknown>): Promise<DeliveryFeeResult> {
    const query = this.buildDeliveryAddressQuery(customer);
    if (!query) {
      return {
        price: 0,
        distanceKm: null,
        note: 'Keine Lieferadresse hinterlegt',
      };
    }

    const coords = await this.geocodeAddress(query);
    if (!coords) {
      return {
        price: 0,
        distanceKm: null,
        note: 'Lieferadresse konnte nicht geocodiert werden',
      };
    }

    const distanceKm = this.haversineDistanceKm(
      DeliveryFeeService.WAREHOUSE_LAT,
      DeliveryFeeService.WAREHOUSE_LNG,
      coords.lat,
      coords.lng
    );
    const roundedDistance = Math.round(distanceKm * 10) / 10;
    const price = this.calculatePrice(distanceKm);

    if (roundedDistance < DeliveryFeeService.MIN_DISTANCE_KM) {
      return {
        price,
        distanceKm: roundedDistance,
        note: `Luftlinie ${roundedDistance} km (< ${DeliveryFeeService.MIN_DISTANCE_KM} km, keine Pauschale)`,
      };
    }

    return {
      price,
      distanceKm: roundedDistance,
      note: `Luftlinie ${roundedDistance} km × 0,30 €/km`,
    };
  }

  private async geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
    const cached = this.geocodeCache.get(query);
    if (cached) {
      return cached;
    }

    const openRouteCoords = await this.geocodeWithOpenRoute(query);
    if (openRouteCoords) {
      this.geocodeCache.set(query, openRouteCoords);
      return openRouteCoords;
    }

    const nominatimCoords = await this.geocodeWithNominatim(query);
    if (nominatimCoords) {
      this.geocodeCache.set(query, nominatimCoords);
      return nominatimCoords;
    }

    return null;
  }

  private async geocodeWithOpenRoute(query: string): Promise<{ lat: number; lng: number } | null> {
    try {
      const response = await fetch(
        `https://api.openrouteservice.org/geocode/search?api_key=${DeliveryFeeService.OPENROUTE_API_KEY}&text=${encodeURIComponent(query)}&size=1&boundary.country=DE`
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const coordinates = data?.features?.[0]?.geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) {
        return null;
      }

      return { lat: coordinates[1], lng: coordinates[0] };
    } catch {
      return null;
    }
  }

  private async geocodeWithNominatim(query: string): Promise<{ lat: number; lng: number } | null> {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
        { headers: { 'Accept-Language': 'de' } }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const hit = data?.[0];
      if (!hit?.lat || !hit?.lon) {
        return null;
      }

      return { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) };
    } catch {
      return null;
    }
  }
}
