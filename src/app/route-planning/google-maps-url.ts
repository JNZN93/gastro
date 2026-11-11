/**
 * Google-Maps-Links nach dem dokumentierten URL-Schema (`/maps/dir/?api=1`).
 * https://developers.google.com/maps/documentation/urls/get-started#directions-action
 *
 * Wichtig aus der Doku:
 * - Ohne `origin` nimmt Google Maps den Gerätestandort.
 * - `dir_action=navigate` startet nur dann die Navigation, wenn kein `origin` gesetzt ist
 *   oder der `origin` nahe am Gerätestandort liegt. Sonst zeigt Maps eine Routenvorschau.
 * - Zwischenstopps: bis zu 9 in der App und am Desktop, nur 3 im mobilen Browser.
 * - Eine URL darf höchstens 2.048 Zeichen lang sein.
 */

export interface MapsPlace {
  /** Adresse oder Name, so wie Google Maps sie suchen soll. */
  label: string;
  latitude?: number;
  longitude?: number;
}

export const GOOGLE_MAPS_DIR_URL = 'https://www.google.com/maps/dir/';
export const MAX_MAPS_URL_LENGTH = 2048;
export const MAX_WAYPOINTS_APP = 9;
export const MAX_WAYPOINTS_MOBILE_BROWSER = 3;

function hasCoordinates(place: MapsPlace): boolean {
  return Number.isFinite(place.latitude) && Number.isFinite(place.longitude);
}

function placeParam(place: MapsPlace, useCoordinates: boolean): string {
  if (useCoordinates && hasCoordinates(place)) {
    return `${Number(place.latitude).toFixed(6)},${Number(place.longitude).toFixed(6)}`;
  }
  return place.label.trim();
}

function directionsUrl(
  origin: MapsPlace | null,
  destination: MapsPlace,
  waypoints: MapsPlace[],
  extra: Record<string, string> = {}
): string {
  const build = (useCoordinates: boolean) => {
    const params = new URLSearchParams({ api: '1' });
    if (origin) {
      params.set('origin', placeParam(origin, useCoordinates));
    }
    params.set('destination', placeParam(destination, useCoordinates));
    params.set('travelmode', 'driving');
    if (waypoints.length > 0) {
      params.set('waypoints', waypoints.map(place => placeParam(place, useCoordinates)).join('|'));
    }
    for (const [key, value] of Object.entries(extra)) {
      params.set(key, value);
    }
    return `${GOOGLE_MAPS_DIR_URL}?${params.toString()}`;
  };

  const readable = build(false);
  if (readable.length <= MAX_MAPS_URL_LENGTH) {
    return readable;
  }
  // Zu lang mit Adresstexten: Koordinaten sind deutlich kürzer.
  return build(true);
}

/**
 * Gesamtroute als Übersicht. `origin = null` heißt: Google Maps nimmt den Gerätestandort.
 * Mehr als neun Zwischenstopps werden in Teilrouten aufgeteilt; das Ziel einer Teilroute
 * ist der Start der nächsten.
 */
export function buildRouteOverviewUrls(options: {
  origin: MapsPlace | null;
  destination: MapsPlace;
  stops: MapsPlace[];
  maxWaypoints?: number;
}): string[] {
  const maxWaypoints = Math.max(1, options.maxWaypoints ?? MAX_WAYPOINTS_APP);
  const urls: string[] = [];
  let legOrigin = options.origin;
  let remaining = [...options.stops];

  while (remaining.length > maxWaypoints) {
    const legStops = remaining.slice(0, maxWaypoints);
    const legDestination = remaining[maxWaypoints];
    urls.push(directionsUrl(legOrigin, legDestination, legStops));
    legOrigin = legDestination;
    remaining = remaining.slice(maxWaypoints + 1);
  }
  urls.push(directionsUrl(legOrigin, options.destination, remaining));
  return urls;
}

/**
 * Navigation vom aktuellen Gerätestandort zu genau einem Ziel.
 * Bewusst ohne `origin`, damit Google Maps direkt die Navigation anbieten kann.
 */
export function buildNavigateUrl(destination: MapsPlace): string {
  return directionsUrl(null, destination, [], { dir_action: 'navigate' });
}

/**
 * Erkennt einen geteilten Routen-Link (QR-Code der Route).
 * Ein Palettenschein-Link hat nur `destination` und ist keine Route, sondern eine Adresse.
 */
export function parseSharedRouteUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.replace(/^www\./, '');
    if (!host.endsWith('google.com') && !host.endsWith('google.de')) {
      return null;
    }
    if (!url.pathname.includes('/maps/dir')) {
      return null;
    }
    if (url.searchParams.get('api') === '1') {
      const isRoute = Boolean(url.searchParams.get('waypoints') || url.searchParams.get('origin'));
      return isRoute && url.searchParams.get('destination') ? url.toString() : null;
    }
    // Älteres Pfadformat: /maps/dir/Start/Stopp/Ziel
    if (url.searchParams.get('destination') || url.searchParams.get('query') || url.searchParams.get('q')) {
      return null;
    }
    const parts = url.pathname.split('/').filter(Boolean);
    return parts.length >= 4 ? url.toString() : null;
  } catch {
    return null;
  }
}
