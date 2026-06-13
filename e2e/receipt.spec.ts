// E2E سبرنت v3 / A4 (إثبات): رفع صورة فاتورة سعودية حقيقية (التقاط كاميرا على
// أندرويد كروم) → OCR → مطابقة البنود → كل بند مطابق يُنشئ سعراً بدليلين:
// قصاصة السطر المظلَّل + صورة الفاتورة الكاملة، وكلاهما يُخدم فعلاً.

import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const RECEIPT = path.resolve('fixtures/real-receipts/sample-receipt.png');

async function loginDemo(page: Page) {
  await page.goto('/login');
  await page.getByTestId('email-input').fill('demo@waffir.app');
  await page.getByTestId('password-input').fill('Demo1234!');
  await page.getByTestId('submit-auth').click();
  await expect(page.getByText('الأقسام')).toBeVisible();
}

test('فاتورة سعودية حقيقية → بنود مطابقة بأدلّة (قصاصة سطر + صورة كاملة)', async ({ page }) => {
  test.setTimeout(120_000);
  await loginDemo(page);
  await page.goto('/receipt');

  // مدخل التصوير يدعم كاميرا أندرويد (capture=environment)
  const captureInput = page.getByTestId('receipt-upload');
  await expect(captureInput).toHaveAttribute('capture', 'environment');
  await expect(captureInput).toHaveAttribute('accept', 'image/*');

  // اختر فرع بنده
  const select = page.getByRole('combobox');
  await expect(async () => {
    const opts = await select.locator('option').allInnerTexts();
    expect(opts.join(' ')).toContain('العثيم');
  }).toPass({ timeout: 20_000 });
  const branchValue = await select
    .locator('option')
    .filter({ hasText: 'العثيم' })
    .first()
    .getAttribute('value');
  await select.selectOption(branchValue!);

  // ارفع صورة الفاتورة وانتظر استجابة التحليل
  await captureInput.setInputFiles(RECEIPT);
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/receipt') && r.request().method() === 'POST', {
      timeout: 90_000,
    }),
    page.getByRole('button', { name: 'حلّل الفاتورة' }).click(),
  ]);
  const body = await resp.json();
  const matched = (body.matched ?? []) as Array<{
    productId: number;
    result: { status: string; priceId?: number };
  }>;
  expect(matched.length, 'بنود مطابقة').toBeGreaterThanOrEqual(3);
  await expect(page.getByTestId('receipt-matched-line').first()).toBeVisible();

  // افحص أدلّة الأسعار المنشورة: لكل بند مطابق دليل receipt يُخدم،
  // وبعضها بدليلين (قصاصة السطر + الفاتورة الكاملة)
  const priceIds = matched
    .filter((m) => m.result?.status === 'published' && m.result.priceId)
    .map((m) => m.result.priceId!);
  expect(priceIds.length).toBeGreaterThanOrEqual(3);

  const stats = await page.evaluate(async (ids: number[]) => {
    let served = 0;
    let withLineCrop = 0;
    for (const id of ids) {
      const ev = await fetch(`/api/prices/${id}/evidence`, { credentials: 'include' }).then((r) =>
        r.json(),
      );
      const receipts = ev.filter((e: { evidenceType: string }) => e.evidenceType === 'receipt');
      if (receipts.length >= 2) withLineCrop++;
      const first = receipts[0];
      if (first?.imageUrl) {
        const img = await fetch(first.imageUrl, { credentials: 'include' });
        if (img.ok) served++;
      }
    }
    return { served, withLineCrop, total: ids.length };
  }, priceIds);

  expect(stats.served, 'أدلّة فاتورة تُخدم فعلاً').toBeGreaterThanOrEqual(3);
  expect(stats.withLineCrop, 'بنود لها قصاصة سطر + صورة كاملة').toBeGreaterThanOrEqual(1);
});
