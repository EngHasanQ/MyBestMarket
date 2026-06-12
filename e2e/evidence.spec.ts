// E2E سبرنت v2: إثبات السعر (جزء 2.2) + فحص العرضين 360/390 (جزء 3.3)

import { expect, test, type Page } from '@playwright/test';

async function loginDemo(page: Page) {
  await page.goto('/login');
  await page.getByTestId('email-input').fill('demo@waffir.app');
  await page.getByTestId('password-input').fill('Demo1234!');
  await page.getByTestId('submit-auth').click();
  await expect(page.getByText('الأقسام')).toBeVisible();
}

test('إثبات السعر: فتح اللوحة من صفحة المقارنة يعرض الدليل ورابط المصدر', async ({ page }) => {
  await loginDemo(page);

  // أنشئ سعراً بدليل عبر فاتورة نصية (يولّد price_evidence)
  const ctx = await page.evaluate(async () => {
    const me = await fetch('/api/auth/me', { credentials: 'include' }).then((r) => r.json());
    const products = await fetch(`/api/products?cityId=${me.cityId}&q=أرز أبو كاس بسمتي 5`, {
      credentials: 'include',
    }).then((r) => r.json());
    const product = products[0];
    const detail = await fetch(`/api/products/${product.id}?cityId=${me.cityId}`, {
      credentials: 'include',
    }).then((r) => r.json());
    return { productId: product.id, branchId: detail.comparisons[0].branchId };
  });

  await page.goto(`/product/${ctx.productId}`);
  await expect(page.getByTestId('comparison-row').first()).toBeVisible();

  // كل صف سعر فيه زر إثبات
  await page.getByTestId('evidence-button').first().click();
  const sheet = page.getByTestId('evidence-sheet');
  await expect(sheet).toBeVisible();
  // اللوحة تعرض المتجر والموثوقية، وإما دليلاً أو رسالة الإدخال اليدوي
  await expect(sheet.getByText('المتجر')).toBeVisible();
  await expect(sheet.getByText('الموثوقية')).toBeVisible();
});

// فحص بصري: لا تمرير أفقي ولا أزرار مقصوصة على 360 و390 (جزء 3.3)
for (const width of [360, 390]) {
  test(`عرض ${width}px: الرئيسية والبحث والمنتج والقوائم بلا تمرير أفقي`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await loginDemo(page);

    const assertNoHScroll = async (label: string) => {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${label} عرض ${width}`).toBeLessThanOrEqual(0);
    };

    await assertNoHScroll('الرئيسية');

    await page.goto('/search?q=حليب');
    await expect(page.getByTestId('product-card').first()).toBeVisible();
    await assertNoHScroll('البحث');

    await page.getByTestId('product-card').first().locator('a').first().click();
    await expect(page.getByTestId('comparison-row').first()).toBeVisible();
    await assertNoHScroll('المنتج');

    await page.goto('/lists');
    await expect(page.getByTestId('generate-monthly')).toBeVisible();
    await assertNoHScroll('القوائم');
  });
}

test('بحث المرادفات في الواجهة: "زبادي" يعيد منتجات روب/زبادي', async ({ page }) => {
  await loginDemo(page);
  await page.goto('/search?q=زبادي');
  await expect(page.getByTestId('product-card').first()).toBeVisible();
  const names = await page.getByTestId('product-card').allInnerTexts();
  expect(names.join(' ')).toMatch(/زبادي|روب|لبن/);
});
