/**
 * محوّل حيّ لمتجر أسواق التميمي (Tamimi Markets) — كتالوج عام مرقّم الصفحات.
 *
 * يستدعي نفس نقاط JSON العامة لواجهة المتجر التي يستخدمها المتصفح
 * (shop.tamimimarkets.com/api/product) بمعدل مهذّب وهوية واضحة. السعر من
 * variants[].storeSpecificData[].mrp، والصورة من variants[].images، والباركود
 * من variants[].barcodes. يفشل بهدوء: أي خطأ يعيد ما جُمع حتى الآن.
 */

import type { RawOffer, RawProduct, StoreAdapter } from './types.js';

const BASE = 'https://shop.tamimimarkets.com';
const POLITE_DELAY_MS = 700;
const PAGE_LIMIT = 20;
const MAX_PAGES_PER_CATEGORY = 200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// تصنيفات المستوى الأعلى التي تحمل الكتالوج الكامل (مكتشفة من الواجهة)
export const TAMIMI_TOP_CATEGORIES = [
  'fresh',
  'household',
  'healthy-living',
  'grocery',
  'breakfast',
  'canned-food',
  'bakery',
];

interface TamimiOptions {
  categories?: string[];
  maxPagesPerCategory?: number;
  onPage?: (info: { category: string; page: number; found: number }) => void;
}

function categoryPath(primary: any): string | null {
  const names: string[] = [];
  let node = primary;
  let guard = 0;
  while (node && guard++ < 8) {
    if (node.name) names.unshift(String(node.name));
    node = node.parentCategory;
  }
  return names.length ? names.join(' > ') : null;
}

export function mapTamimiProduct(p: any): RawProduct | null {
  if (!p?.name) return null;
  // أول متغيّر له سعر متجر (storeSpecificData) — هو السعر المعروض
  const variant = (p.variants ?? []).find(
    (v: any) => Array.isArray(v.storeSpecificData) && v.storeSpecificData.length,
  );
  const ssd = variant?.storeSpecificData?.[0];
  const mrp = Number(ssd?.mrp ?? NaN);
  if (!Number.isFinite(mrp) || mrp <= 0) return null;
  const discount = Number(ssd?.discount ?? 0);
  const price = discount > 0 ? Math.round(mrp * (1 - discount / 100) * 100) / 100 : mrp;

  const image =
    variant?.images?.[0] ?? variant?.imagesExtra?.s320?.[0] ?? p.images?.[0] ?? null;
  const barcode = variant?.barcodes?.[0] ?? p.barcodes?.[0] ?? null;
  const slug = p.slug ?? variant?.slug ?? null;

  return {
    rawName: String(p.name),
    brand: p.brand?.name ?? null,
    barcode: barcode ? String(barcode) : null,
    price,
    imageUrl: image ? String(image) : null,
    productUrl: slug ? `${BASE}/en/product/${slug}` : null,
    storeCategoryPath: categoryPath(p.primaryCategory),
    basis: 'online',
  };
}

export function createTamimiAdapter(opts: TamimiOptions = {}): StoreAdapter {
  const categories = opts.categories ?? TAMIMI_TOP_CATEGORIES;
  const maxPages = opts.maxPagesPerCategory ?? MAX_PAGES_PER_CATEGORY;

  async function getJson(path: string): Promise<any | null> {
    try {
      const res = await fetch(`${BASE}${path}`, {
        signal: AbortSignal.timeout(15_000),
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

  async function fetchCategoryPages(slug: string): Promise<RawProduct[]> {
    const out: RawProduct[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const data = await getJson(
        `/api/product?fields=FULL&category=${encodeURIComponent(slug)}&page=${page}`,
      );
      const list: any[] = data?.data?.product ?? data?.product ?? [];
      if (list.length === 0) break;
      let found = 0;
      for (const it of list) {
        const mapped = mapTamimiProduct(it);
        if (mapped) {
          out.push(mapped);
          found++;
        }
      }
      opts.onPage?.({ category: slug, page, found });
      if (list.length < PAGE_LIMIT) break; // آخر صفحة
      await sleep(POLITE_DELAY_MS);
    }
    return out;
  }

  return {
    storeSlug: 'tamimi',
    async supportsCity() {
      return true; // متجر إلكتروني — التغطية تتحدد بفروع التميمي المسجلة لدينا
    },
    async fetchCategoryTree() {
      // مسارات التصنيف تُستخلص من المنتجات نفسها أثناء الزحف
      return categories.map((c) => c.toUpperCase());
    },
    async fetchCatalog(): Promise<RawProduct[]> {
      const seen = new Map<string, RawProduct>();
      for (const slug of categories) {
        for (const p of await fetchCategoryPages(slug)) {
          // إزالة التكرار عبر التصنيفات المتداخلة بالباركود ثم بالاسم
          const key = p.barcode ?? p.rawName;
          if (!seen.has(key)) seen.set(key, p);
        }
        await sleep(POLITE_DELAY_MS);
      }
      return [...seen.values()];
    },
    async fetchOffers(): Promise<RawOffer[]> {
      return [];
    },
  };
}
