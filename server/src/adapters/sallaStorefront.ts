/**
 * محوّل عام لمتاجر منصة سلة (Salla) — كتالوج كامل مرقّم الصفحات (جزء 1.1).
 * ملاحظة امتثال: يستدعي نقاط JSON العامة لواجهة المتجر نفسها التي يستخدمها
 * المتصفح، بمعدل مهذّب (طلب/ثانية) وهوية واضحة. يفشل بهدوء: أي خطأ يعيد
 * ما جُمع حتى الآن ويترك الأسعار السابقة لتُعلَّم stale عبر staleness-sweep.
 */

import type { RawOffer, RawProduct, StoreAdapter } from './types.js';

const POLITE_DELAY_MS = 1000;
const MAX_PAGES_PER_CATEGORY = 200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface SallaCategory {
  id: number;
  name: string;
  parentName?: string | null;
}

export function createSallaAdapter(storeSlug: string, baseUrl: string): StoreAdapter {
  const base = baseUrl.replace(/\/$/, '');

  async function getJson(path: string): Promise<any | null> {
    try {
      const res = await fetch(`${base}${path}`, {
        signal: AbortSignal.timeout(10_000),
        headers: { 'User-Agent': 'WaffirBot/1.0 (+https://waffir.app/bot)' },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async function fetchCategories(): Promise<SallaCategory[]> {
    const data = await getJson('/store/api/v1/categories');
    const out: SallaCategory[] = [];
    const walk = (items: any[], parentName: string | null) => {
      for (const it of items ?? []) {
        if (!it?.id || !it?.name) continue;
        out.push({ id: it.id, name: String(it.name), parentName });
        if (Array.isArray(it.sub_categories)) walk(it.sub_categories, String(it.name));
        if (Array.isArray(it.children)) walk(it.children, String(it.name));
      }
    };
    walk(data?.data ?? data?.categories ?? [], null);
    return out;
  }

  function mapItem(it: any, categoryPath: string | null): RawProduct | null {
    const price = Number(it?.price?.amount ?? it?.price ?? NaN);
    if (!Number.isFinite(price) || !it?.name) return null;
    return {
      rawName: String(it.name),
      brand: it.brand?.name ?? null,
      barcode: it.sku ?? it.barcode ?? null,
      price,
      imageUrl: it.image?.url ?? it.main_image ?? null,
      productUrl: it.urls?.customer ?? it.url ?? null,
      storeCategoryPath: categoryPath,
      basis: 'online',
    };
  }

  async function fetchAllPages(query: string, categoryPath: string | null): Promise<RawProduct[]> {
    const out: RawProduct[] = [];
    for (let page = 1; page <= MAX_PAGES_PER_CATEGORY; page++) {
      const data = await getJson(`/store/api/v1/products?${query}page=${page}`);
      const items: any[] = data?.data ?? [];
      if (items.length === 0) break;
      for (const it of items) {
        const p = mapItem(it, categoryPath ?? (it.category?.name ? String(it.category.name) : null));
        if (p) out.push(p);
      }
      if (!data?.links?.next && !data?.pagination?.next_page) break;
      await sleep(POLITE_DELAY_MS);
    }
    return out;
  }

  return {
    storeSlug,
    async supportsCity() {
      return true; // متجر إلكتروني — التغطية تتحدد بفروعه المسجلة لدينا
    },
    async fetchCategoryTree() {
      const cats = await fetchCategories();
      return cats.map((c) => (c.parentName ? `${c.parentName} > ${c.name}` : c.name));
    },
    async fetchCatalog(): Promise<RawProduct[]> {
      // الكتالوج الكامل: تصنيفاً تصنيفاً لتغطية كل شيء؛ وإلا فكل الصفحات معاً
      const cats = await fetchCategories();
      if (cats.length === 0) return fetchAllPages('', null);
      const seen = new Map<string, RawProduct>();
      for (const cat of cats) {
        const path = cat.parentName ? `${cat.parentName} > ${cat.name}` : cat.name;
        for (const p of await fetchAllPages(`category=${cat.id}&`, path)) {
          seen.set(p.rawName, p);
        }
        await sleep(POLITE_DELAY_MS);
      }
      return [...seen.values()];
    },
    async fetchOffers(): Promise<RawOffer[]> {
      return []; // عروض سلة تأتي من صفحة العروض عبر مسار المجلات
    },
  };
}
