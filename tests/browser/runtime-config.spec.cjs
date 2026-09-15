const { test, expect } = require('@playwright/test');

test('boots the release bundle with operator configuration and no optional accounts', async ({ page }) => {
  const network = require(`../../src/appConfig/${process.env.EXPECTED_CONFIG_ENV}.json`);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://**.example.invalid/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/constants')) {
      return route.fulfill({ json: {
        ADALIAN_PURCHASE_PRICE: '5000000', ADALIAN_PURCHASE_TOKEN: network.Starknet.Address.usdcToken,
        ASTEROID_PURCHASE_BASE_PRICE: '1', ASTEROID_PURCHASE_LOT_PRICE: '1', ASTEROID_PURCHASE_TOKEN: network.Starknet.Address.usdcToken,
        TIME_ACCELERATION: 1, CREW_SCHEDULE_BUFFER: 0
      } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/launcher/help');
  await expect(page.getByRole('heading', { name: 'Game Wiki' })).toBeVisible();
  await expect(page.getByText('Tutorials', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Community Content', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Non-English Content', { exact: true })).toHaveCount(0);
  const config = await page.evaluate(() => window.INFLUENCE_RUNTIME_CONFIG);
  expect(config.REACT_APP_CONFIG_ENV).toBe(process.env.EXPECTED_CONFIG_ENV);
  expect(config.REACT_APP_API_INFLUENCE).toBe(`https://${process.env.EXPECTED_CONFIG_ENV}.example.invalid`);
  expect(config.REACT_APP_PRIVY_APPID).toBeUndefined();
  expect(config.REACT_APP_API_CLIENTID_STRIPE).toBeUndefined();
  await page.goto('/launcher/store/packs');
  await expect(page.getByText('Recruit First Crewmate', { exact: true })).toBeVisible();
  await expect(page.getByText('Starter Packs', { exact: true })).toHaveCount(0);
  await page.goto('/launcher/play');
  await page.getByText(/^(Existing Account|Log-In)$/).locator('..').click();
  await expect(page.getByRole('button', { name: /Ready Wallet/ })).toBeVisible();
  await page.getByText('Other Login Options', { exact: true }).click();
  await expect(page.getByText('Influence Account', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
