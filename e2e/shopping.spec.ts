// E2E وضع التسوق (القسم 9.3 — اختبارا 2 و4):
// توليد القائمة الشهرية → تأكيد → وضع التسوق → سعر فعلي → إنهاء → ملخص التوفير
// + دون اتصال: شطب أثناء offline ثم مزامنة عند العودة

import { expect, test, type Page } from '@playwright/test';

async function loginDemo(page: Page) {
  await page.goto('/login');
  await page.getByTestId('email-input').fill('demo@waffir.app');
  await page.getByTestId('password-input').fill('Demo1234!');
  await page.getByTestId('submit-auth').click();
  await expect(page.getByText('الأقسام')).toBeVisible();
}

test('القائمة الشهرية → تسوق → سعر فعلي → ملخص التوفير وتقرير سعر في القاعدة', async ({ page }) => {
  await loginDemo(page);

  // توليد القائمة الشهرية من تاريخ الشراء المبذور
  await page.goto('/lists');
  await page.getByTestId('generate-monthly').click();
  await expect(page.getByTestId('list-item').first()).toBeVisible();

  // ملخص التحسين ظاهر
  await expect(page.getByTestId('optimization-summary')).toBeVisible();

  // ابدأ التسوق
  await page.getByTestId('start-shopping').click();
  const items = page.getByTestId('shopping-item');
  await expect(items.first()).toBeVisible();

  // اشطب أول عنصرين
  await items.nth(0).locator('button').first().click();
  await items.nth(1).locator('button').first().click();

  // أدخل سعراً فعلياً للعنصر الأول
  const firstInput = items.nth(0).getByTestId('actual-price-input');
  await firstInput.fill('9.85');
  await items.nth(0).getByText('سجّل').click();

  // المجموع الجاري يظهر
  await expect(page.getByTestId('running-total')).toContainText('فعلي');

  // إنهاء → ملخص التوفير
  await page.getByTestId('finish-shopping').click();
  await expect(page.getByTestId('savings-summary')).toBeVisible();
  await expect(page.getByTestId('savings-summary')).toContainText('اكتمل التسوق');

  // تقرير السعر وصل للقاعدة: 9.85 بثقة 90 (يظهر كأحدث سعر للفرع عبر API)
  const report = await page.evaluate(async () => {
    const me = await fetch('/api/auth/me', { credentials: 'include' }).then((r) => r.json());
    const lists = await fetch('/api/lists', { credentials: 'include' }).then((r) => r.json());
    const active = lists.find((l: { status: string }) => l.status === 'completed');
    const detail = await fetch(`/api/lists/${active.id}`, { credentials: 'include' }).then((r) =>
      r.json(),
    );
    const item = detail.items.find((i: { actualPrice: string | null }) => i.actualPrice != null);
    const product = await fetch(`/api/products/${item.productId}?cityId=${me.cityId}`, {
      credentials: 'include',
    }).then((r) => r.json());
    return product.comparisons.find(
      (c: { branchId: number }) => c.branchId === item.chosenBranchId,
    );
  });
  // التقرير الجديد إما أنه السعر المعروض الآن، أو تفوّق عليه عرض مجلة
  // ساري بثقة أعلى (95 > 90) — كلاهما سلوك صحيح وفق طبقة الحل
  if (report.source === 'user_report') {
    expect(Number(report.price)).toBe(9.85);
  } else {
    expect(report.isOffer).toBe(true);
    expect(report.confidence).toBeGreaterThan(90);
  }
});

test('دون اتصال: الشطب يصمد ويُزامن عند عودة الاتصال', async ({ page, context }) => {
  await loginDemo(page);

  // قائمة جديدة بعنصر واحد
  await page.goto('/search?q=أرز');
  await page.getByTestId('add-to-list').first().click();
  // انتظر اكتمال الإضافة قبل المغادرة (الزر يتحول إلى "أُضيف")
  await expect(page.getByText('✓ أُضيف').first()).toBeVisible();
  await page.goto('/lists');
  await page.getByRole('link').filter({ hasText: 'قائمتي' }).first().click();
  await page.getByTestId('start-shopping').click();
  await expect(page.getByTestId('shopping-item').first()).toBeVisible();

  // اقطع الاتصال
  await context.setOffline(true);
  await page.getByTestId('shopping-item').first().locator('button').first().click();
  await expect(page.getByTestId('offline-pill')).toBeVisible();

  // الشطب التفاؤلي ظاهر
  await expect(
    page.getByTestId('shopping-item').first().locator('.line-through'),
  ).toBeVisible();

  // عودة الاتصال → الطابور يُفرَّغ
  await context.setOffline(false);
  await page.waitForTimeout(1500);

  // تحقق من الخادم أن العنصر مشطوب فعلاً
  const synced = await page.evaluate(async () => {
    const lists = await fetch('/api/lists', { credentials: 'include' }).then((r) => r.json());
    const active = lists.find((l: { status: string }) => l.status === 'active');
    const detail = await fetch(`/api/lists/${active.id}`, { credentials: 'include' }).then((r) =>
      r.json(),
    );
    return detail.items.some((i: { isPurchased: boolean }) => i.isPurchased);
  });
  expect(synced).toBe(true);
});
