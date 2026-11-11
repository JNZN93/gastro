import {
  GOOGLE_MAPS_DIR_URL,
  MAX_MAPS_URL_LENGTH,
  MapsPlace,
  buildNavigateUrl,
  buildRouteOverviewUrls,
  parseSharedRouteUrl
} from './google-maps-url';

const DEPOT: MapsPlace = { label: 'Im Winkel 6, 67547 Worms', latitude: 49.6326, longitude: 8.3594 };

function stop(n: number): MapsPlace {
  return { label: `Hauptstraße ${n}, 64720 Michelstadt`, latitude: 49.67 + n / 1000, longitude: 9.0 + n / 1000 };
}

function params(url: string): URLSearchParams {
  expect(url.startsWith(`${GOOGLE_MAPS_DIR_URL}?`)).toBeTrue();
  return new URL(url).searchParams;
}

describe('google-maps-url', () => {
  describe('buildNavigateUrl', () => {
    it('öffnet die Navigation zum Ziel ohne festen Start', () => {
      const p = params(buildNavigateUrl(stop(1)));
      expect(p.get('api')).toBe('1');
      expect(p.get('destination')).toBe('Hauptstraße 1, 64720 Michelstadt');
      expect(p.get('travelmode')).toBe('driving');
      expect(p.get('dir_action')).toBe('navigate');
      expect(p.has('origin')).toBeFalse();
      expect(p.has('waypoints')).toBeFalse();
    });
  });

  describe('buildRouteOverviewUrls', () => {
    it('Depot-Start: origin, destination und alle Stopps in Reihenfolge', () => {
      const urls = buildRouteOverviewUrls({ origin: DEPOT, destination: DEPOT, stops: [1, 2, 3, 4, 5, 6].map(stop) });
      expect(urls.length).toBe(1);
      const p = params(urls[0]);
      expect(p.get('api')).toBe('1');
      expect(p.get('origin')).toBe(DEPOT.label);
      expect(p.get('destination')).toBe(DEPOT.label);
      expect(p.get('travelmode')).toBe('driving');
      expect(p.get('waypoints')!.split('|')).toEqual([1, 2, 3, 4, 5, 6].map(n => stop(n).label));
      expect(p.has('dir_action')).toBeFalse();
    });

    it('ein Kundenstopp wird zum einzigen Zwischenstopp', () => {
      const p = params(buildRouteOverviewUrls({ origin: DEPOT, destination: DEPOT, stops: [stop(1)] })[0]);
      expect(p.get('waypoints')).toBe(stop(1).label);
    });

    it('GPS-Start lässt origin weg, damit Maps den Gerätestandort nimmt', () => {
      const p = params(buildRouteOverviewUrls({ origin: null, destination: DEPOT, stops: [stop(1), stop(2)] })[0]);
      expect(p.has('origin')).toBeFalse();
      expect(p.get('destination')).toBe(DEPOT.label);
    });

    it('teilt mehr als neun Zwischenstopps in verkettete Teilrouten', () => {
      const stops = Array.from({ length: 12 }, (_, i) => stop(i + 1));
      const urls = buildRouteOverviewUrls({ origin: DEPOT, destination: DEPOT, stops });
      expect(urls.length).toBe(2);
      const first = params(urls[0]);
      const second = params(urls[1]);
      expect(first.get('waypoints')!.split('|').length).toBe(9);
      expect(first.get('destination')).toBe(stop(10).label);
      expect(second.get('origin')).toBe(stop(10).label);
      expect(second.get('waypoints')!.split('|')).toEqual([stop(11).label, stop(12).label]);
      expect(second.get('destination')).toBe(DEPOT.label);
    });

    it('weicht bei zu langen Adresstexten auf Koordinaten aus', () => {
      const long = (n: number): MapsPlace => ({ ...stop(n), label: `${'Sehr lange Bezeichnung '.repeat(20)}${n}` });
      const urls = buildRouteOverviewUrls({ origin: DEPOT, destination: DEPOT, stops: [1, 2, 3, 4, 5, 6].map(long) });
      expect(urls[0].length).toBeLessThanOrEqual(MAX_MAPS_URL_LENGTH);
      expect(params(urls[0]).get('waypoints')!.split('|')[0]).toBe('49.671000,9.001000');
    });
  });

  describe('parseSharedRouteUrl', () => {
    it('erkennt die neue Routen-URL', () => {
      const url = buildRouteOverviewUrls({ origin: DEPOT, destination: DEPOT, stops: [stop(1)] })[0];
      expect(parseSharedRouteUrl(url)).toBe(url);
    });

    it('erkennt das alte Pfadformat weiterhin', () => {
      const legacy = 'https://www.google.com/maps/dir/Worms/Michelstadt/Worms';
      expect(parseSharedRouteUrl(legacy)).toBe(legacy);
    });

    it('behandelt Palettenschein-Links (nur destination) nicht als Route', () => {
      expect(parseSharedRouteUrl('https://www.google.com/maps/dir/?api=1&destination=Hauptstra%C3%9Fe%201%2C%2064720%20Michelstadt')).toBeNull();
    });

    it('ignoriert fremde Hosts', () => {
      expect(parseSharedRouteUrl('https://example.com/maps/dir/?api=1&origin=a&destination=b')).toBeNull();
    });
  });
});
