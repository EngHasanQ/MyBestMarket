// E2E الأدمن (القسم 9.3 — اختبار 3):
// رفع مجلة (نص fixture) → OCR/استخراج → اعتماد عنصر → السعر يظهر في الكتالوج

import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// تُشغَّل الاختبارات من جذر المستودع
const flyerText = fs.readFileSync(path.resolve('server/fixtures/flyer-othaim.txt'), 'utf8');

test('مجلة → قائمة المراجعة → اعتماد → السعر منشور بمصدر موثق', async ({ page }) => {
  // دخول الأدمن
  await page.goto('/login');
  await page.getByTestId('email-input').fill('admin@waffir.app');
  await page.getByTestId('password-input').fill('Admin1234!');
  await page.getByTestId('submit-auth').click();
  await expect(page.getByText('الأقسام')).toBeVisible();

  await page.goto('/admin');

  // لوحة الجودة تعرض مؤشر الدقة
  await expect(page.getByTestId('kpi-ratio')).toBeVisible();

  // رفع مجلة بنص OCR
  await page.getByRole('button', { name: 'رفع مجلة' }).click();
  const branchSelect = page.getByTestId('flyer-branch-select');
  await expect(branchSelect).toBeVisible();
  // انتظر تحميل الفروع ثم اختر فرع عثيم
  await expect(async () => {
    const options = await branchSelect.locator('option').allInnerTexts();
    expect(options.join(' ')).toContain('العثيم');
  }).toPass({ timeout: 20_000 });
  const value = await branchSelect
    .locator('option')
    .filter({ hasText: 'العثيم' })
    .first()
    .getAttribute('value');
  await branchSelect.selectOption(value!);
  await page.getByTestId('flyer-text-input').fill(flyerText);
  await page.getByTestId('flyer-submit').click();
  await expect(page.getByText(/استُخرج \d+ عنصراً/)).toBeVisible({ timeout: 30_000 });

  // قائمة المراجعة: اعتماد أول عنصر مُطابَق
  await page.getByRole('button', { name: 'المراجعة', exact: true }).click();
  await expect(page.getByTestId('review-row').first()).toBeVisible();
  const approvable = page
    .getByTestId('review-row')
    .filter({ has: page.getByTestId('approve-review') })
    .filter({ hasText: '←' })
    .first();
  await expect(approvable).toBeVisible();
  const rowText = await approvable.innerText();
  await approvable.getByTestId('approve-review').click();

  // العنصر اختفى من القائمة (اعتُمد)
  await expect(page.getByTestId('review-row').filter({ hasText: rowText.slice(0, 20) })).toHaveCount(0);

  // السعر المعتمد منشور في الكتالوج بمصدر flyer_ocr_verified
  const published = await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // استطلاع: انتظر ظهور عنصر معتمد له منتج مطابق (تفادي سباق الزمن)
    let approved: { matchedProductId: number; branchId: number } | undefined;
    for (let i = 0; i < 10 && !approved; i++) {
      const queue = await fetch('/api/admin/review-queue?status=approved', {
        credentials: 'include',
      }).then((r) => r.json());
      approved = (queue as Array<{ matchedProductId: number; branchId: number }>).find(
        (q) => q.matchedProductId,
      );
      if (!approved) await sleep(300);
    }
    if (!approved) throw new Error('لا عنصر معتمد بمنتج مطابق');
    const me = await fetch('/api/auth/me', { credentials: 'include' }).then((r) => r.json());
    const product = await fetch(
      `/api/products/${approved.matchedProductId}?cityId=${me.cityId}`,
      { credentials: 'include' },
    ).then((r) => r.json());
    return product.comparisons.find(
      (c: { branchId: number }) => c.branchId === approved!.branchId,
    );
  });
  expect(published.source).toBe('flyer_ocr_verified');
  expect(published.confidence).toBe(95);
});
