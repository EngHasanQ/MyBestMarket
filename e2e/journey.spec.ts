// E2E رحلة المستخدم (القسم 9.3 — اختبار 1):
// تسجيل → اختيار مدينة → تصفح قسم → مقارنة أسعار → إضافة من الأرخص

import { expect, test } from '@playwright/test';

test('تسجيل جديد حتى الإضافة من أرخص متجر', async ({ page }) => {
  const email = `e2e-${Date.now()}@test.sa`;

  await page.goto('/register');
  await page.getByTestId('name-input').fill('مستخدم E2E');
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill('Password1!');
  await page.getByTestId('submit-auth').click();

  // اختيار المدينة
  await expect(page.getByTestId('city-card').first()).toBeVisible();
  await page.getByTestId('city-card').first().click();
  await page.getByRole('button', { name: 'متابعة' }).click();

  // الرئيسية: لا تمرير أفقي على 390px
  await expect(page.getByText('الأقسام')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // تصفح قسم
  await page.getByText('مواد غذائية أساسية').first().click();
  await expect(page.getByTestId('product-card').first()).toBeVisible();

  // كل سعر معروض بجانبه شارة حداثة (القسم 2.4)
  const cards = page.getByTestId('product-card');
  const first = cards.first();
  await expect(first.getByTestId('freshness-badge')).toBeVisible();

  // صفحة المقارنة
  await first.locator('a').first().click();
  await expect(page.getByTestId('comparison-row').first()).toBeVisible();

  // الصفوف مرتبة من الأرخص
  const rows = page.getByTestId('comparison-row');
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(2);
  const prices: number[] = [];
  for (let i = 0; i < count; i++) {
    const txt = await rows.nth(i).locator('.price-mono').first().innerText();
    prices.push(parseFloat(txt.replace(/[^\d.]/g, '')));
  }
  for (let i = 1; i < prices.length; i++) expect(prices[i]!).toBeGreaterThanOrEqual(prices[i - 1]!);

  // أضف من الأرخص (الصف الأول)
  await rows.first().getByTestId('add-from-branch').click();
  await expect(rows.first().getByText('✓ أُضيف')).toBeVisible();
});
