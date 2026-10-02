import { execFileSync } from 'child_process';
import path from 'path';
import { expect, test } from '@playwright/test';

const EMAIL = 'lokal-push-test@example.com';
const PASSWORD = 'LokalPush1';
const backendDir = path.resolve(__dirname, '../../backend');

test.beforeAll(() => {
  execFileSync(process.execPath, [path.join(backendDir, 'scripts/ensureLocalPushUser.js')], {
    cwd: backendDir,
    stdio: 'inherit',
    env: { ...process.env, LOCAL_PUSH_EMAIL: EMAIL, LOCAL_PUSH_PASSWORD: PASSWORD },
  });
});

test('Neue Freigabe erscheint in der offenen Kommissionierung', async ({ page }) => {
  test.setTimeout(90_000);
  let releasedId: number | null = null;

  await page.addInitScript(() => {
    localStorage.setItem('gastro.feedPollMs', '2000');
  });

  page.on('dialog', async (dialog) => {
    const message = dialog.message();
    await dialog.dismiss();
    throw new Error(message);
  });

  try {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: 'Anmelden' }).click();
    await page.waitForURL('**/admin');

    const candidate = await page.evaluate(async () => {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/orders/all-orders?includeItems=false', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as {
        orders?: Array<{
          order_id: number;
          status: string;
          name?: string;
          company?: string;
          customer_number?: string;
          order_date?: string;
          delivery_date?: string;
        }>;
      };
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const order = (data.orders ?? []).find((entry) => {
        if (entry.status !== 'open' && entry.status !== 'parked') {
          return false;
        }
        const delivery = String(entry.delivery_date || '').slice(0, 10);
        const ordered = String(entry.order_date || '').slice(0, 10);
        return delivery === today || (!delivery && ordered === today);
      });
      if (!order) {
        return null;
      }
      return {
        id: Number(order.order_id),
        label: order.company || order.name || order.customer_number || `Bestellung #${order.order_id}`,
      };
    });

    expect(candidate, 'Keine geparkte oder offene Bestellung für heute').toBeTruthy();
    const orderId = candidate!.id;
    const bannerText = `Neu: #${orderId} · ${candidate!.label}`;

    const firstFeed = page.waitForResponse(
      (response) => response.url().includes('/api/orders/picking-feed') && response.ok()
    );
    await page.goto('/picking');
    await expect(page.getByText('Kommissionierung')).toBeVisible();
    await expect(page.getByText('Bestellungen werden geladen…')).toBeHidden({ timeout: 20_000 });
    await firstFeed;
    await expect(page.locator(`#order-card-${orderId}`)).toHaveCount(0);
    await expect(page.locator('.incoming-bar, .incoming-note')).toHaveCount(0);
    await page.waitForTimeout(1200);

    await setStatus(page, orderId, 'released');
    releasedId = orderId;

    const banner = page.getByRole('button', { name: bannerText });
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Bestellungen werden geladen…')).toBeHidden();
    await page.waitForTimeout(1200);
    await banner.click();

    const card = page.locator(`#order-card-${orderId}`);
    await expect(card).toBeVisible();
    await expect(card.getByText('Freigegeben')).toBeVisible();
    await page.waitForTimeout(1500);
  } finally {
    if (releasedId) {
      await setStatus(page, releasedId, 'parked').catch(() => undefined);
    }
  }
});

async function setStatus(page: import('@playwright/test').Page, orderId: number, status: string): Promise<void> {
  await page.evaluate(
    async ({ orderId, status }) => {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
    },
    { orderId, status }
  );
}
