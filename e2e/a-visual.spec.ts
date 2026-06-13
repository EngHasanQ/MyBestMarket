// E2E سبرنت v3 / B4: لقطات بصرية لهوية "المحيط العميق" على 360 و390،
// مع تأكيد ألا تمرير أفقي وأن أهداف اللمس ≥ 44px.
//
// تستخدم مستخدماً معزولاً جديداً لكل تشغيل (باسم ثابت) وتبني حالته عبر API،
// فلا تتأثر اللقطات بترتيب بقية الاختبارات أو حالتها المشتركة.

import { expect, test, type Page } from '@playwright/test';

interface Ctx {
  cityId: number;
  listId: number;
  productId: number;
}

async function setupFreshUser(page: Page): Promise<Ctx> {
  await page.goto('/login'); // تحميل أصل التطبيق لتثبيت الكوكي
  return page.evaluate(async () => {
    const email = `visual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@waffir.app`;
    const cities = await fetch('/api/cities').then((r) => r.json());
    const makkah = cities.find((c: { code: string }) => c.code === 'makkah') ?? cities[0];
    await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password: 'Password1!', name: 'زائر وفّر', cityId: makkah.id }),
    });
    // قائمة تسوق محكومة المحتوى (عنوان غير "شهري" حتى لا تظهر بطاقة المسودة في الرئيسية)
    const products = await fetch(`/api/products?cityId=${makkah.id}&q=${encodeURIComponent('حليب')}&limit=6`, {
      credentials: 'include',
    }).then((r) => r.json());
    const picks = products.filter((p: { cheapest: unknown }) => p.cheapest).slice(0, 3);
    const list = await fetch('/api/lists', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title: 'قائمة التسوق' }),
    }).then((r) => r.json());
    for (const p of picks) {
      const detail = await fetch(`/api/products/${p.id}?cityId=${makkah.id}`, {
        credentials: 'include',
      }).then((r) => r.json());
      const branchId = detail.comparisons?.[0]?.branchId;
      await fetch(`/api/lists/${list.id}/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ productId: p.id, quantity: 1, branchId }),
      });
    }
    return { cityId: makkah.id, listId: list.id, productId: picks[0]?.id };
  });
}

async function assertNoHScroll(page: Page, label: string, width: number) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label} @${width}`).toBeLessThanOrEqual(0);
}

// أهداف اللمس: كل زر/رابط مرئي يجب ألا يقل بُعده عن 44px (تسامح 1px)
async function assertTouchTargets(page: Page, label: string) {
  const tooSmall = await page.evaluate(() => {
    const bad: string[] = [];
    document.querySelectorAll('button, a[role="button"], nav a').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
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
    const ctx = await setupFreshUser(page);

    // 1) الرئيسية
    await page.goto('/');
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
    await page.goto(`/product/${ctx.productId}`);
    await expect(page.getByTestId('comparison-row').first()).toBeVisible();
    await assertNoHScroll(page, 'comparison', width);
    await assertTouchTargets(page, 'comparison');
    await expect(page).toHaveScreenshot(`comparison-${width}.png`, shot);

    // 4) لوحة إثبات السعر
    await page.getByTestId('evidence-button').first().click();
    await expect(page.getByTestId('evidence-sheet')).toBeVisible();
    await expect(page.getByTestId('evidence-sheet').getByText('الموثوقية')).toBeVisible();
    await expect(page).toHaveScreenshot(`evidence-${width}.png`, shot);

    // 5) القوائم — انتظر تحميل بطاقة القائمة (لا الهيكل) قبل اللقطة
    await page.goto('/lists');
    await expect(page.getByTestId('generate-monthly')).toBeVisible();
    await expect(page.getByText('قائمة التسوق')).toBeVisible();
    await assertNoHScroll(page, 'lists', width);
    await assertTouchTargets(page, 'lists');
    await expect(page).toHaveScreenshot(`lists-${width}.png`, {
      ...shot,
      mask: [page.locator('a.card .t-caption')], // تاريخ الإنشاء (متغيّر)
    });

    // 6) وضع التسوق (قائمة مبنية عبر API)
    await page.goto(`/shopping/${ctx.listId}`);
    await expect(page.getByTestId('shopping-item').first()).toBeVisible();
    await assertNoHScroll(page, 'shopping', width);
    await expect(page).toHaveScreenshot(`shopping-${width}.png`, shot);

    // 7) الحساب — يُقنَّع البريد (فريد لكل تشغيل)
    await page.goto('/account');
    await expect(page.getByRole('heading', { name: 'حسابي' })).toBeVisible();
    await assertNoHScroll(page, 'account', width);
    await assertTouchTargets(page, 'account');
    await expect(page).toHaveScreenshot(`account-${width}.png`, {
      ...shot,
      mask: [page.locator('p[dir="ltr"]').first()],
    });
  });
}
