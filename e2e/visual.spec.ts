// E2E سبرنت v3 / B4: لقطات بصرية لهوية "المحيط العميق" على 360 و390،
// مع تأكيد ألا تمرير أفقي وأن أهداف اللمس ≥ 44px.

import { expect, test, type Page } from '@playwright/test';

async function loginDemo(page: Page) {
  await page.goto('/login');
  await page.getByTestId('email-input').fill('demo@waffir.app');
  await page.getByTestId('password-input').fill('Demo1234!');
  await page.getByTestId('submit-auth').click();
  await expect(page.getByText('الأقسام')).toBeVisible();
}

async function assertNoHScroll(page: Page, label: string, width: number) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label} @${width}`).toBeLessThanOrEqual(0);
}

// أهداف اللمس: كل زر/رابط مرئي ذو نص يجب ألا يقل بُعده عن 44px (مع تسامح 1px للحدود)
async function assertTouchTargets(page: Page, label: string) {
  const tooSmall = await page.evaluate(() => {
    const bad: string[] = [];
    const els = document.querySelectorAll('button, a[role="button"], nav a');
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return; // مخفي
      if (r.height < 43.5 || r.width < 43.5) {
        bad.push(`${el.tagName}:${(el.textContent ?? '').trim().slice(0, 16)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    });
    return bad;
  });
  expect(tooSmall, `${label}: أهداف لمس صغيرة`).toEqual([]);
}

const shot = { fullPage: true, animations: 'disabled' as const, maxDiffPixelRatio: 0.02 };

for (const width of [360, 390]) {
  test(`لقطات المحيط العميق @${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await loginDemo(page);

    // 1) الرئيسية
    await expect(page.getByText('الأقسام')).toBeVisible();
    await assertNoHScroll(page, 'home', width);
    await assertTouchTargets(page, 'home');
    await expect(page).toHaveScreenshot(`home-${width}.png`, shot);

    // 2) نتائج البحث
    await page.goto('/search?q=حليب');
    await expect(page.getByTestId('product-card').first()).toBeVisible();
    await assertNoHScroll(page, 'search', width);
    await assertTouchTargets(page, 'search');
    await expect(page).toHaveScreenshot(`search-${width}.png`, shot);

    // 3) المقارنة
    await page.getByTestId('product-card').first().locator('a').first().click();
    await expect(page.getByTestId('comparison-row').first()).toBeVisible();
    await assertNoHScroll(page, 'comparison', width);
    await assertTouchTargets(page, 'comparison');
    await expect(page).toHaveScreenshot(`comparison-${width}.png`, shot);

    // 4) لوحة إثبات السعر (بطاقة داكنة + مقبض سحب)
    await page.getByTestId('evidence-button').first().click();
    await expect(page.getByTestId('evidence-sheet')).toBeVisible();
    await expect(page.getByTestId('evidence-sheet').getByText('الموثوقية')).toBeVisible();
    await expect(page).toHaveScreenshot(`evidence-${width}.png`, shot);
    await page.keyboard.press('Escape').catch(() => undefined);

    // 5) القوائم
    await page.goto('/lists');
    await expect(page.getByTestId('generate-monthly')).toBeVisible();
    await assertNoHScroll(page, 'lists', width);
    await assertTouchTargets(page, 'lists');
    await expect(page).toHaveScreenshot(`lists-${width}.png`, shot);

    // 6) وضع التسوق — ولّد قائمة شهرية ثم ادخلها وابدأ التسوق
    await page.getByTestId('generate-monthly').click();
    await page.waitForURL(/\/list\/\d+/);
    await expect(page.getByTestId('start-shopping')).toBeVisible();
    await page.getByTestId('start-shopping').click();
    await page.waitForURL(/\/shopping\/\d+/);
    await expect(page.getByTestId('shopping-item').first()).toBeVisible();
    await assertNoHScroll(page, 'shopping', width);
    await expect(page).toHaveScreenshot(`shopping-${width}.png`, shot);

    // 7) الحساب
    await page.goto('/account');
    await expect(page.getByRole('heading', { name: 'حسابي' })).toBeVisible();
    await assertNoHScroll(page, 'account', width);
    await assertTouchTargets(page, 'account');
    await expect(page).toHaveScreenshot(`account-${width}.png`, shot);
  });
}
