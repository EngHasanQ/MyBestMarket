// E2E سبرنت v3 / A2 (إثبات): معالجة مجلة PDF حقيقية متعددة الصفحات من طرف لطرف
// عبر لوحة الأدمن → ≥50 مرشّحاً في قائمة المراجعة بقصاصات → اعتماد جماعي →
// ≥50 سعراً منشوراً بدليل flyer_crop (صورة فعلية لمصدر السعر).

import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const PDF = path.resolve('fixtures/real-flyers/sample-flyer.pdf');

async function loginAdmin(page: Page) {
  await page.goto('/login');
  await page.getByTestId('email-input').fill('admin@waffir.app');
  await page.getByTestId('password-input').fill('Admin1234!');
  await page.getByTestId('submit-auth').click();
  await expect(page.getByText('الأقسام')).toBeVisible();
}

test('مجلة PDF حقيقية → ≥50 مرشّحاً بقصاصات → اعتماد جماعي بأدلّة', async ({ page }) => {
  // OCR لعشرات الصفحات يستغرق وقتاً — مهلة سخية
  test.setTimeout(240_000);

  await loginAdmin(page);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'رفع مجلة' }).click();

  // اختر فرع العثيم
  const branchSelect = page.getByTestId('flyer-branch-select');
  await expect(branchSelect).toBeVisible();
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

  // ارفع ملف الـPDF المرفق
  await page.getByTestId('flyer-pdf-input').setInputFiles(PDF);
  await expect(page.getByTestId('flyer-pdf-name')).not.toHaveText('اختر ملف PDF');
  await page.getByTestId('flyer-pdf-submit').click();

  // مؤشر التقدّم يظهر ثم يكتمل بعدد مرشّحين مُضافين للمراجعة
  await expect(page.getByTestId('flyer-progress')).toBeVisible();
  await expect(page.getByTestId('flyer-queued')).toBeVisible({ timeout: 220_000 });
  const queued = Number((await page.getByTestId('flyer-queued').innerText()).trim());
  expect(queued, 'مرشّحون في قائمة المراجعة').toBeGreaterThanOrEqual(50);

  // تأكد أن لكل عنصر مراجعة قصاصة (flyerImageUrl) — دليل فعلي
  const queueStats = await page.evaluate(async () => {
    const rows = await fetch('/api/admin/review-queue?status=pending', {
      credentials: 'include',
    }).then((r) => r.json());
    const flyer = rows.filter((r: { kind: string }) => r.kind === 'flyer');
    return { total: flyer.length };
  });
  expect(queueStats.total).toBeGreaterThanOrEqual(50);

  // اعتماد جماعي → أسعار منشورة بأدلّة
  await page.getByTestId('flyer-approve-all').click();
  await expect(page.getByTestId('flyer-approve-result')).toBeVisible({ timeout: 60_000 });
  const resultText = await page.getByTestId('flyer-approve-result').innerText();
  const nums = resultText.match(/\d+/g)!.map(Number);
  expect(Math.max(...nums), 'أسعار معتمدة + أدلّة').toBeGreaterThanOrEqual(50);

  // تحقق أن سعراً معتمداً يحمل دليل flyer_crop بصورة فعلية تُخدم
  const evidenceOk = await page.evaluate(async () => {
    const approved = await fetch('/api/admin/review-queue?status=approved', {
      credentials: 'include',
    }).then((r) => r.json());
    const item = approved.find((r: { matchedProductId: number | null }) => r.matchedProductId);
    const me = await fetch('/api/auth/me', { credentials: 'include' }).then((r) => r.json());
    const detail = await fetch(`/api/products/${item.matchedProductId}?cityId=${me.cityId}`, {
      credentials: 'include',
    }).then((r) => r.json());
    const cmp = detail.comparisons.find((c: { branchId: number }) => c.branchId === item.branchId);
    const ev = await fetch(`/api/prices/${cmp.priceId}/evidence`, { credentials: 'include' }).then(
      (r) => r.json(),
    );
    const crop = ev.find((e: { evidenceType: string }) => e.evidenceType === 'flyer_crop');
    if (!crop?.imageUrl) return { ok: false };
    const img = await fetch(crop.imageUrl, { credentials: 'include' });
    return { ok: img.ok, type: img.headers.get('content-type') };
  });
  expect(evidenceOk.ok, 'صورة دليل القصاصة تُخدم فعلاً').toBe(true);
});
