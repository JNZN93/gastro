import { BrowserContext, Page, devices, expect, test } from '@playwright/test';

/**
 * Routenplanung → Google Maps auf einem Android-Handy (Pixel 7, Chromium).
 * Backend, OpenRouteService und Google Maps sind gemockt; geprüft wird,
 * welche Google-Maps-URLs die App erzeugt und öffnet.
 *
 * Start: `npx ng serve` (Port 4200), dann `npx playwright test e2e/route-navigation.spec.ts`.
 */
test.use({
  ...devices['Pixel 7'],
  locale: 'de-DE',
  timezoneId: 'Europe/Berlin',
});

const WORMS = 'Im Winkel 6, 67547 Worms';
const MICHELSTADT = { latitude: 49.6772, longitude: 9.0037 };

const CUSTOMERS = [
  { id: 1, street: 'Braunstraße 4', postal_code: '64720', city: 'Michelstadt', name: 'Gasthaus Krone', lng: 9.0041, lat: 49.6781 },
  { id: 2, street: 'Erbacher Straße 12', postal_code: '64711', city: 'Erbach', name: 'Pizzeria Roma', lng: 8.9945, lat: 49.6573 },
  { id: 3, street: 'Marktplatz 3', postal_code: '64732', city: 'Bad König', name: 'Café am Markt', lng: 9.0067, lat: 49.7414 },
  { id: 4, street: 'Hauptstraße 21', postal_code: '64753', city: 'Brombachtal', name: 'Landgasthof Linde', lng: 8.9561, lat: 49.7381 },
  { id: 5, street: 'Bahnhofstraße 7', postal_code: '64720', city: 'Michelstadt', name: 'Bistro Bahnhof', lng: 9.0002, lat: 49.6751 },
  { id: 6, street: 'Lindenweg 2', postal_code: '64711', city: 'Erbach', name: 'Hotel Odenwald', lng: 8.9902, lat: 49.6611 },
].map(c => ({
  ...c,
  last_name_company: c.name,
  customer_number: `K-10${c.id}`,
  country: 'Deutschland',
  address: c.street,
}));

const MANUAL_START = 'Industriestraße 5, 64720 Michelstadt';
const MANUAL_START_FEATURE = {
  geometry: { coordinates: [9.0123, 49.6702] },
  properties: { layer: 'address', street: 'Industriestraße', housenumber: '5', postalcode: '64720', locality: 'Michelstadt' },
};

/** So „optimiert“ der gemockte OpenRouteService: bewusst nicht die Auswahlreihenfolge. */
const OPTIMIZED_JOB_ORDER = [2, 0, 4, 5, 1, 3];

type Captured = { optimizationBodies: any[] };

async function mockBackend(context: BrowserContext, customerIds: number[]): Promise<Captured> {
  const captured: Captured = { optimizationBodies: [] };
  const customers = CUSTOMERS.filter(c => customerIds.includes(c.id));

  await context.addInitScript(ids => {
    localStorage.setItem('token', 'e2e-token');
    localStorage.setItem('gastro.role', 'admin');
    localStorage.setItem('routePlanningSelection', JSON.stringify({ customerIds: ids, addressIds: {} }));
  }, customerIds);

  await context.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/validate') {
      return route.fulfill({ json: { user: { role: 'admin', email: 'e2e@example.com' } } });
    }
    if (path === '/api/customers') {
      return route.fulfill({ json: customers });
    }
    return route.fulfill({ json: [] });
  });

  await context.route('https://api.openrouteservice.org/geocode/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('autocomplete')) {
      return route.fulfill({ json: { features: [MANUAL_START_FEATURE] } });
    }
    const text = url.searchParams.get('text') || '';
    const hit = CUSTOMERS.find(c => text.includes(c.street));
    const features = hit
      ? [{ geometry: { coordinates: [hit.lng, hit.lat] }, properties: { layer: 'address', accuracy: 'point' } }]
      : [];
    return route.fulfill({ json: { features } });
  });

  await context.route('https://api.openrouteservice.org/optimization/**', route => {
    const body = route.request().postDataJSON();
    captured.optimizationBodies.push(body);
    const vehicle = body.vehicles[0];
    const order = OPTIMIZED_JOB_ORDER.filter(id => id < body.jobs.length);
    let t = 0;
    const steps = [
      { type: 'start', location: vehicle.start, duration: 0, distance: 0 },
      ...order.map(id => {
        t += 900;
        return { type: 'job', id, location: body.jobs[id].location, duration: t, distance: t * 12 };
      }),
      { type: 'end', location: vehicle.end, duration: t + 3600, distance: (t + 3600) * 12 },
    ];
    return route.fulfill({ json: { routes: [{ distance: 142.3, duration: t + 3600, steps, geometry: '' }] } });
  });

  await context.route('https://api.openrouteservice.org/v2/directions/**', route => {
    const coords = (new URL(route.request().url()).searchParams.get('coordinates') || '').split(';');
    return route.fulfill({
      json: {
        features: [{
          geometry: { type: 'LineString', coordinates: coords.map(c => c.split(',').map(Number)) },
          properties: {
            summary: { distance: 98000, duration: 5400 },
            segments: [{ distance: 49000, duration: 2700 }, { distance: 49000, duration: 2700 }],
          },
        }],
      },
    });
  });

  // Google Maps ist nicht erreichbar/gewollt im Test: Stub-Seite zeigt die übergebenen Parameter.
  await context.route('https://www.google.com/maps/**', route => {
    const url = new URL(route.request().url());
    const rows = [...url.searchParams.entries()]
      .map(([k, v]) => `<tr><th>${k}</th><td>${v.replace(/\|/g, '<br>')}</td></tr>`)
      .join('');
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><meta name="viewport" content="width=device-width"><body style="font:16px sans-serif;padding:16px">
        <h2>Google Maps (Test-Stub)</h2><table border="1" cellpadding="6" style="border-collapse:collapse">${rows}</table></body>`,
    });
  });

  return captured;
}

async function goToStep2(page: Page): Promise<void> {
  await page.goto('/route-planning');
  await page.getByRole('button', { name: /^Weiter/ }).click();
  await expect(page.getByRole('heading', { name: 'Route berechnen' })).toBeVisible();
}

async function calculate(page: Page, stopCount: number): Promise<void> {
  await page.locator('.route-controls').getByRole('button', { name: 'Route berechnen' }).click();
  if (stopCount > 1) {
    await page.getByRole('button', { name: 'Route mit Einschränkungen starten' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Route-Ergebnis' })).toBeVisible();
}

function params(href: string | null): URLSearchParams {
  expect(href).toContain('https://www.google.com/maps/dir/?');
  return new URL(href!).searchParams;
}

async function openLink(page: Page, testId: string): Promise<Page> {
  const [popup] = await Promise.all([page.context().waitForEvent('page'), page.getByTestId(testId).first().click()]);
  await popup.waitForLoadState();
  return popup;
}

const nameOf = (jobIndex: number, ids: number[]) => CUSTOMERS.find(c => c.id === ids[jobIndex])!.name;
const addressOf = (jobIndex: number, ids: number[]) => {
  const c = CUSTOMERS.find(x => x.id === ids[jobIndex])!;
  return `${c.street}, ${c.postal_code} ${c.city}`;
};

test('Depot-Start, 6 Stopps: Übersicht in optimierter Reihenfolge, Navi Stopp für Stopp', async ({ page, context }) => {
  const ids = [1, 2, 3, 4, 5, 6];
  await mockBackend(context, ids);
  await goToStep2(page);

  await expect(page.getByRole('radio', { name: 'Depot' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('start-label')).toHaveText(WORMS);
  await calculate(page, ids.length);
  await page.screenshot({ path: 'e2e-results/route-nav-1-ergebnis.png', fullPage: true });

  // A: Gesamtroute
  const overview = params(await page.getByTestId('nav-overview').getAttribute('href'));
  expect(overview.get('api')).toBe('1');
  expect(overview.get('origin')).toBe(WORMS);
  expect(overview.get('destination')).toBe(WORMS);
  expect(overview.get('travelmode')).toBe('driving');
  expect(overview.get('waypoints')!.split('|')).toEqual(OPTIMIZED_JOB_ORDER.map(i => addressOf(i, ids)));
  await expect(page.getByText('höchstens 3 Zwischenstopps')).toBeVisible();

  // B: Navigation zum nächsten Stopp – ohne origin, mit dir_action=navigate
  await expect(page.getByTestId('next-target')).toContainText(`Nächster Stopp 1 von 6`);
  await expect(page.getByTestId('next-target')).toContainText(nameOf(OPTIMIZED_JOB_ORDER[0], ids));
  const nav = params(await page.getByTestId('nav-next').getAttribute('href'));
  expect(nav.has('origin')).toBe(false);
  expect(nav.get('destination')).toBe(addressOf(OPTIMIZED_JOB_ORDER[0], ids));
  expect(nav.get('dir_action')).toBe('navigate');
  expect(nav.get('travelmode')).toBe('driving');

  const maps = await openLink(page, 'nav-next');
  expect(new URL(maps.url()).searchParams.get('dir_action')).toBe('navigate');
  await maps.screenshot({ path: 'e2e-results/route-nav-2-maps-stub.png' });
  await maps.waitForTimeout(1500);
  await maps.close();
  await expect(page.getByText('dort auf „Starten“ tippen')).toBeVisible();

  // Stopp erledigt → nächster Stopp in optimierter Reihenfolge
  await page.getByTestId('stop-done').click();
  await expect(page.getByTestId('next-target')).toContainText(`Nächster Stopp 2 von 6`);
  expect(params(await page.getByTestId('nav-next').getAttribute('href')).get('destination'))
    .toBe(addressOf(OPTIMIZED_JOB_ORDER[1], ids));
  await expect(page.getByTestId('order-stop').first()).toHaveClass(/is-done/);

  for (let done = 2; done <= 6; done++) {
    await page.getByTestId('stop-done').click();
  }
  await expect(page.getByTestId('next-target')).toContainText('zurück zum Ziel');
  expect(params(await page.getByTestId('nav-next').getAttribute('href')).get('destination')).toBe(WORMS);

  // QR-Code und Teilen nutzen dieselbe URL
  await page.getByRole('button', { name: 'QR' }).click();
  await expect(page.getByAltText('QR-Code der Route')).toBeVisible();
  await page.screenshot({ path: 'e2e-results/route-nav-3-qr.png' });
});

test('GPS-Start (Fahrer in Michelstadt): Optimierung ab Standort, Maps ohne festen Start', async ({ page, context }) => {
  const ids = [1, 2, 3];
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(MICHELSTADT);
  const captured = await mockBackend(context, ids);
  await goToStep2(page);

  await page.getByRole('radio', { name: 'Aktueller Standort' }).click();
  await expect(page.getByTestId('start-label')).toContainText('Aktueller Standort (49.6772, 9.0037)');
  await calculate(page, ids.length);

  expect(captured.optimizationBodies.at(-1).vehicles[0].start).toEqual([MICHELSTADT.longitude, MICHELSTADT.latitude]);
  const overview = params(await page.getByTestId('nav-overview').getAttribute('href'));
  expect(overview.has('origin')).toBe(false);
  expect(overview.get('destination')).toBe(WORMS);
  expect(overview.get('waypoints')!.split('|').length).toBe(3);
  await expect(page.getByText('höchstens 3 Zwischenstopps')).toHaveCount(0);
  await page.screenshot({ path: 'e2e-results/route-nav-4-gps.png', fullPage: true });
});

test('GPS verweigert: Fehlermeldung, keine stille Berechnung ab Worms', async ({ page, context }) => {
  const ids = [1, 2];
  await context.addInitScript(() => {
    const denied = { code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: 'denied' };
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: (_ok: unknown, fail: (e: unknown) => void) => setTimeout(() => fail(denied), 50) },
    });
  });
  const captured = await mockBackend(context, ids);
  const dialogs: string[] = [];
  page.on('dialog', dialog => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await goToStep2(page);

  await page.getByRole('radio', { name: 'Aktueller Standort' }).click();
  await expect(page.getByRole('alert')).toContainText('Standortzugriff verweigert');
  await expect(page.getByTestId('start-label')).toHaveText('Kein Standort');
  await page.screenshot({ path: 'e2e-results/route-nav-5-gps-verweigert.png' });

  await page.locator('.route-controls').getByRole('button', { name: 'Route berechnen' }).click();
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toContain('Standortzugriff verweigert');
  await expect(page.getByText('Route mit Einschränkungen starten')).toHaveCount(0);
  expect(captured.optimizationBodies).toHaveLength(0);

  // Zurück auf Depot geht weiterhin
  await page.getByRole('radio', { name: 'Depot' }).click();
  await expect(page.getByTestId('start-label')).toHaveText(WORMS);
});

test('Ein Kundenstopp: ein Zwischenstopp, Navi direkt zum Kunden', async ({ page, context }) => {
  const ids = [2];
  await mockBackend(context, ids);
  await goToStep2(page);
  await calculate(page, 1);

  const overview = params(await page.getByTestId('nav-overview').getAttribute('href'));
  expect(overview.get('origin')).toBe(WORMS);
  expect(overview.get('waypoints')).toBe(addressOf(0, ids));
  const nav = params(await page.getByTestId('nav-next').getAttribute('href'));
  expect(nav.get('destination')).toBe(addressOf(0, ids));
  expect(nav.has('origin')).toBe(false);
});

test('Manueller Startpunkt: gewählte Adresse ist Start in Optimierung und Google Maps', async ({ page, context }) => {
  const ids = [1, 2];
  const captured = await mockBackend(context, ids);
  await goToStep2(page);

  await page.getByRole('radio', { name: 'Manuell' }).click();
  await expect(page.getByTestId('start-label')).toHaveText('Bitte Startadresse suchen');
  await page.locator('#endpoint-query').fill('Industriestr');
  await page.getByRole('button', { name: MANUAL_START }).click();
  await expect(page.getByTestId('start-label')).toHaveText(MANUAL_START);
  await calculate(page, ids.length);

  expect(captured.optimizationBodies.at(-1).vehicles[0].start).toEqual([9.0123, 49.6702]);
  const overview = params(await page.getByTestId('nav-overview').getAttribute('href'));
  expect(overview.get('origin')).toBe(MANUAL_START);
  expect(params(await page.getByTestId('nav-next').getAttribute('href')).has('origin')).toBe(false);
});
