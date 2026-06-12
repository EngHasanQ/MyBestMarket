/**
 * محوّل عام لمتاجر منصة زد (Zid) — كتالوج كامل مرقّم الصفحات (جزء 1.1).
 * نقاط زد للواجهات تختلف بين القوالب؛ يجرّب الأنماط الشائعة ويعتمد أول
 * نمط يستجيب. نفس قواعد الأدب والفشل الهادئ في محوّل سلة.
 */

import type { RawOffer, RawProduct, StoreAdapter } from './types.js';

const POLITE_DELAY_MS = 1000;
const MAX_PAGES = 200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// أنماط نقاط المنتجات الشائعة في قوالب زد (تُجرَّب بالترتيب)
const PRODUCT_ENDPOINTS = [
  (page: number) => `/api/catalog/products?page=${page}`,
  (page: number) => `/api/v1/products?page=${page}`,
  (page: number) => `/products.json?page=${page}`,
];

export function createZidAdapter(storeSlug: string, baseUrl: string): StoreAdapter {
  const base = baseUrl.replace(/\/$/, '');

  async function getJson(path: string): Promise<any | null> {
    try {
      const res = await fetch(`${base}${path}`, {
        signal: AbortSignal.timeout(10_000),
        headers: {
          'User-Agent': 'WaffirBot/1.0 (+https://waffir.app/bot)',
          Accept: 'application/json',
        },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  function extractItems(data: any): any[] {
    return data?.results ?? data?.data?.products ?? data?.products ?? data?.data ?? [];
  }

  function mapItem(it: any): RawProduct | null {
    const price = Number(it?.price ?? it?.sale_price ?? it?.formatted_price ?? NaN);
    const name = it?.name?.ar ?? it?.name ?? it?.title;
    if (!Number.isFinite(price) || !name) return null;
    return {
      rawName: String(name),
      brand: it.brand?.name ?? null,
      barcode: it.sku ?? it.barcode ?? null,
      price,
      imageUrl: it.main_image ?? it.images?.[0]?.image?.full_size ?? it.image ?? null,
      productUrl: it.html_url ?? it.url ?? null,
      storeCategoryPath: it.categories?.[0]?.name ?? it.category?.name ?? null,
      basis: 'online',
    };
  }

  async function fetchAll(): Promise<RawProduct[]> {
    // اعتمد أول نمط يستجيب بمنتجات
    for (const endpoint of PRODUCT_ENDPOINTS) {
      const first = await getJson(endpoint(1));
      const firstItems = extractItems(first);
      if (!first || firstItems.length === 0) continue;

      const out = new Map<string, RawProduct>();
      for (const it of firstItems) {
        const p = mapItem(it);
        if (p) out.set(p.rawName, p);
      }
      for (let page = 2; page <= MAX_PAGES; page++) {
        await sleep(POLITE_DELAY_MS);
        const data = await getJson(endpoint(page));
        const items = extractItems(data);
        if (items.length === 0) break;
        let added = 0;
        for (const it of items) {
          const p = mapItem(it);
          if (p && !out.has(p.rawName)) {
            out.set(p.rawName, p);
            added++;
          }
        }
        if (added === 0) break; // صفحات مكررة — توقف
      }
      return [...out.values()];
    }
    return [];
  }

  return {
    storeSlug,
    async supportsCity() {
      return true;
    },
    async fetchCategoryTree() {
      const data = await getJson('/api/catalog/categories');
      const items: any[] = data?.results ?? data?.data ?? data?.categories ?? [];
      return items
        .map((c) => (c?.name?.ar ?? c?.name ? String(c.name?.ar ?? c.name) : null))
        .filter((x): x is string => x != null);
    },
    fetchCatalog: fetchAll,
    async fetchOffers(): Promise<RawOffer[]> {
      return [];
    },
  };
}
