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

test.use({
  permissions: ['notifications'],
});

test('Push anmelden und Kommissionierung offline aus dem Cache', async ({ page }) => {
  // Chromium unter Automation lässt pushManager.subscribe mit
  // "Registration failed - permission denied" scheitern, obwohl die
  // Berechtigung granted ist. Der Fallback erzeugt ein lokales Abo,
  // das die App ganz normal ans Backend schickt.
  await page.addInitScript(() => {
    let current: {
      endpoint: string;
      unsubscribe: () => Promise<boolean>;
      toJSON: () => { endpoint: string; keys: { p256dh: string; auth: string } };
    } | null = null;
    const originalSubscribe = PushManager.prototype.subscribe;
    const originalGet = PushManager.prototype.getSubscription;
    PushManager.prototype.getSubscription = async function () {
      if (current) return current as unknown as PushSubscription;
      return originalGet.call(this);
    };
    PushManager.prototype.subscribe = async function (options) {
      try {
        const real = await originalSubscribe.call(this, options);
        return real;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (!message.includes('permission denied')) {
          throw error;
        }
        const endpoint = 'https://example.push.local/playwright-gastro';
        current = {
          endpoint,
          unsubscribe: async () => {
            current = null;
            return true;
          },
          toJSON: () => ({
            endpoint,
            keys: {
              p256dh: 'BPlaywrightLocalPushKey',
              auth: 'playwright-auth',
            },
          }),
        };
        return current as unknown as PushSubscription;
      }
    };
  });

  page.on('dialog', async (dialog) => {
    const message = dialog.message();
    await dialog.dismiss();
    throw new Error(message);
  });

  await page.goto('/login');
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const registration = await navigator.serviceWorker.ready;
    return Boolean(registration?.active && navigator.serviceWorker.controller);
  });

  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.waitForURL('**/admin');

  await page.goto('/picking');
  await expect(page.getByText('Kommissionierung')).toBeVisible();
  await expect(page.getByText('Bestellungen werden geladen…')).toBeHidden({ timeout: 20_000 });
  const countBefore = (await page.locator('.toolbar-count').textContent())?.trim();
  expect(countBefore).toBeTruthy();

  const bell = page.getByRole('button', { name: /Mitteilungen/ });
  await bell.click();
  await expect(bell).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
  await page.waitForTimeout(1200);

  const stored = execFileSync(
    process.execPath,
    [
      '-e',
      `
        require('dotenv').config();
        const db = require('./src/config/db');
        (async () => {
          const row = await db('push_subscriptions')
            .join('users', 'users.id', 'push_subscriptions.user_id')
            .where('users.email', ${JSON.stringify(EMAIL)})
            .orderBy('push_subscriptions.id', 'desc')
            .first('push_subscriptions.endpoint');
          console.log(row?.endpoint || '');
          await db.destroy();
        })().catch((error) => {
          console.error(error);
          process.exit(1);
        });
      `,
    ],
    { cwd: backendDir, encoding: 'utf8' }
  );
  expect(stored).toContain('https://');

  await page.context().setOffline(true);
  await expect(page.locator('.offline-banner')).toBeVisible();
  await expect(page.locator('.offline-note')).toBeVisible();
  await page.waitForTimeout(1200);

  await page.getByRole('button', { name: 'Aktualisieren' }).click();
  await expect(page.getByText('Bestellungen werden geladen…')).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText('noch keine Aufträge auf diesem Gerät')).toBeHidden();
  await expect(page.locator('.toolbar-count')).toHaveText(countBefore || '');

  await page.waitForTimeout(2000);
});
