// حلّ أرخص فرع لكل عنصر قائمة + ملخص التحسين متجر واحد/تقسيم (القسم 5-B)

import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { resolveProductPrices } from './priceResolver.js';
import { resolveCheapest, type BranchPriceOption } from './consumption.js';

export interface ResolvedItem {
  productId: number;
  quantity: number;
  branchId: number | null;
  storeId: number | null;
  price: number | null;
}

export async function resolveCheapestForUser(
  cityId: number | null,
  items: Array<{ productId: number; quantity: number }>,
): Promise<ResolvedItem[]> {
  if (cityId == null) {
    return items.map((i) => ({ ...i, branchId: null, storeId: null, price: null }));
  }

  const branches = await db
    .select({ id: schema.storeBranches.id, storeId: schema.storeBranches.storeId })
    .from(schema.storeBranches)
    .where(eq(schema.storeBranches.cityId, cityId));
  const storeByBranch = new Map(branches.map((b) => [b.id, b.storeId]));

  // جولة 1: خيارات كل عنصر
  const optionsPerItem = new Map<number, BranchPriceOption[]>();
  for (const item of items) {
    const resolved = await resolveProductPrices(item.productId, cityId);
    const options: BranchPriceOption[] = [...resolved.values()].map((r) => ({
      branchId: r.branchId,
      storeId: storeByBranch.get(r.branchId) ?? 0,
      price: r.price,
      confidence: r.confidence,
      stale: r.stale,
    }));
    optionsPerItem.set(item.productId, options);
  }

  // عدّ العناصر المتاحة لكل متجر (لكسر التعادل لصالح تقليل عدد المتاجر)
  const itemCountPerStore = new Map<number, number>();
  for (const options of optionsPerItem.values()) {
    for (const storeId of new Set(options.map((o) => o.storeId))) {
      itemCountPerStore.set(storeId, (itemCountPerStore.get(storeId) ?? 0) + 1);
    }
  }

  return items.map((item) => {
    const best = resolveCheapest(optionsPerItem.get(item.productId) ?? [], itemCountPerStore);
    return {
      productId: item.productId,
      quantity: item.quantity,
      branchId: best?.branchId ?? null,
      storeId: best?.storeId ?? null,
      price: best?.price ?? null,
    };
  });
}

export interface OptimizationSummary {
  bestSingleStore: { storeId: number; nameAr: string; total: number; coveredItems: number } | null;
  optimalSplit: {
    total: number;
    stores: Array<{ storeId: number; nameAr: string; items: number; subtotal: number }>;
    savings: number;
  } | null;
}

/** "شراء كل شيء من متجر واحد: X" مقابل "التقسيم الأمثل بين متجرين: Y (توفير Z)" */
export async function optimizationSummary(
  cityId: number,
  items: Array<{ productId: number; quantity: number }>,
): Promise<OptimizationSummary> {
  const branches = await db
    .select({ id: schema.storeBranches.id, storeId: schema.storeBranches.storeId })
    .from(schema.storeBranches)
    .where(eq(schema.storeBranches.cityId, cityId));
  const storeByBranch = new Map(branches.map((b) => [b.id, b.storeId]));

  // أرخص سعر لكل (عنصر، متجر)
  const perStore = new Map<number, Map<number, number>>(); // storeId -> productId -> أرخص سعر
  for (const item of items) {
    const resolved = await resolveProductPrices(item.productId, cityId);
    for (const r of resolved.values()) {
      const storeId = storeByBranch.get(r.branchId);
      if (storeId == null || r.stale) continue;
      const m = perStore.get(storeId) ?? new Map<number, number>();
      const cur = m.get(item.productId);
      if (cur == null || r.price < cur) m.set(item.productId, r.price);
      perStore.set(storeId, m);
    }
  }

  const storeIds = [...perStore.keys()];
  if (storeIds.length === 0) return { bestSingleStore: null, optimalSplit: null };
  const storeRows = await db
    .select()
    .from(schema.stores)
    .where(inArray(schema.stores.id, storeIds));
  const storeName = new Map(storeRows.map((s) => [s.id, s.nameAr]));

  // أفضل متجر واحد: يغطي أكبر عدد عناصر ثم الأرخص
  let bestSingle: OptimizationSummary['bestSingleStore'] = null;
  for (const [storeId, m] of perStore) {
    let total = 0;
    let covered = 0;
    for (const item of items) {
      const p = m.get(item.productId);
      if (p != null) {
        total += p * item.quantity;
        covered++;
      }
    }
    if (
      !bestSingle ||
      covered > bestSingle.coveredItems ||
      (covered === bestSingle.coveredItems && total < bestSingle.total)
    ) {
      bestSingle = {
        storeId,
        nameAr: storeName.get(storeId) ?? '',
        total: round2(total),
        coveredItems: covered,
      };
    }
  }

  // التقسيم الأمثل بسقف 3 متاجر: أرخص سعر لكل عنصر، ثم احتفظ بأفضل 3 متاجر
  // وأعد إسناد عناصر المتاجر المحذوفة لأرخص متجر متبقٍ
  const cheapestStorePerItem = new Map<number, { storeId: number; price: number }>();
  for (const item of items) {
    for (const [storeId, m] of perStore) {
      const p = m.get(item.productId);
      if (p == null) continue;
      const cur = cheapestStorePerItem.get(item.productId);
      if (!cur || p < cur.price) cheapestStorePerItem.set(item.productId, { storeId, price: p });
    }
  }
  const usage = new Map<number, number>();
  for (const v of cheapestStorePerItem.values())
    usage.set(v.storeId, (usage.get(v.storeId) ?? 0) + 1);
  const keptStores = [...usage.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);

  const splitStores = new Map<number, { items: number; subtotal: number }>();
  let splitTotal = 0;
  for (const item of items) {
    let best: { storeId: number; price: number } | null = null;
    for (const storeId of keptStores) {
      const p = perStore.get(storeId)?.get(item.productId);
      if (p != null && (!best || p < best.price)) best = { storeId, price: p };
    }
    if (!best) continue;
    const cost = best.price * item.quantity;
    splitTotal += cost;
    const e = splitStores.get(best.storeId) ?? { items: 0, subtotal: 0 };
    e.items++;
    e.subtotal += cost;
    splitStores.set(best.storeId, e);
  }

  const optimalSplit =
    splitStores.size === 0
      ? null
      : {
          total: round2(splitTotal),
          stores: [...splitStores.entries()].map(([storeId, e]) => ({
            storeId,
            nameAr: storeName.get(storeId) ?? '',
            items: e.items,
            subtotal: round2(e.subtotal),
          })),
          savings: bestSingle ? round2(Math.max(0, bestSingle.total - splitTotal)) : 0,
        };

  return { bestSingleStore: bestSingle, optimalSplit };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
