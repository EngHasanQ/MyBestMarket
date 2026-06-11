/**
 * محوّل عام لمتاجر منصة سلة (Salla) — تستخدمه السلاسل الصغيرة المكتشفة
 * التي تأهّلت بـ platform_hint = 'salla'.
 * ملاحظة امتثال: يستدعي نقطة JSON العامة لواجهة المتجر نفسها التي يستخدمها
 * المتصفح، بمعدل مهذّب (طلب واحد/ثانية) وهوية واضحة. يفشل بهدوء:
 * أي خطأ يعيد [] ويترك الأسعار السابقة لتُعلَّم stale عبر staleness-sweep.
 */

import type { RawOffer, RawProduct, StoreAdapter } from './types.js';

const POLITE_DELAY_MS = 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createSallaAdapter(storeSlug: string, baseUrl: string): StoreAdapter {
  async function fetchProducts(): Promise<RawProduct[]> {
    const out: RawProduct[] = [];
    try {
      let page = 1;
      // واجهة سلة العامة للواجهات: /store/api/v1/products (مقسّمة صفحات)
      while (page <= 10) {
        const res = await fetch(`${baseUrl.replace(/\/$/, '')}/store/api/v1/products?page=${page}`, {
          signal: AbortSignal.timeout(10_000),
          headers: { 'User-Agent': 'WaffirBot/1.0 (+https://waffir.app/bot)' },
        });
        if (!res.ok) break;
        const data = (await res.json()) as { data?: any[]; links?: { next?: string | null } };
        const items = data.data ?? [];
        if (items.length === 0) break;
        for (const it of items) {
          const price = Number(it?.price?.amount ?? it?.price ?? NaN);
          if (!Number.isFinite(price) || !it?.name) continue;
          out.push({
            rawName: String(it.name),
            brand: it.brand?.name ?? null,
            barcode: it.sku ?? null,
            price,
            imageUrl: it.image?.url ?? null,
            basis: 'online',
          });
        }
        if (!data.links?.next) break;
        page++;
        await sleep(POLITE_DELAY_MS);
      }
    } catch {
      return out; // فشل هادئ — لا يُسقط الخط أبداً
    }
    return out;
  }

  return {
    storeSlug,
    async supportsCity() {
      return true; // متجر إلكتروني — التغطية تتحدد بفروعه المسجلة لدينا
    },
    fetchCatalog: fetchProducts,
    async fetchOffers(): Promise<RawOffer[]> {
      return []; // عروض سلة تأتي من صفحة العروض عبر مسار المجلات
    },
  };
}
