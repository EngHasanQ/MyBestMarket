// تحديث الكتالوجات اليومي بالفروقات فقط (القسم 15: catalog-refresh)
// سعر لم يتغير → تحديث last_verified_at فقط، صفر صفوف جديدة (idempotent)

import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { getAdapters } from '../adapters/registry.js';
import { matchProduct, saveAlias } from '../services/productMatcher.js';
import { submitPrice } from '../services/priceResolver.js';
import { baseConfidence } from '../services/confidence.js';
import type { JobResult } from './framework.js';

export async function catalogRefresh(): Promise<JobResult> {
  const adapters = await getAdapters();
  let itemsIn = 0;
  let itemsOut = 0;
  let errors = 0;
  const detail: Record<string, unknown> = {};

  for (const [storeId, adapter] of adapters) {
    // عزل الفشل: سلسلة تفشل لا تُسقط بقية الخط
    try {
      const branches = await db
        .select()
        .from(schema.storeBranches)
        .where(and(eq(schema.storeBranches.storeId, storeId), eq(schema.storeBranches.isActive, true)));
      if (branches.length === 0) continue;

      const cityCodes = await db
        .select({ code: schema.cities.code, id: schema.cities.id })
        .from(schema.cities)
        .where(inArray(schema.cities.id, [...new Set(branches.map((b) => b.cityId))]));

      const supported = new Set<number>();
      for (const c of cityCodes) {
        if (await adapter.supportsCity(c.code)) supported.add(c.id);
      }
      const targetBranches = branches.filter((b) => supported.has(b.cityId));
      if (targetBranches.length === 0) continue;

      const catalog = await adapter.fetchCatalog(cityCodes[0]?.code ?? '');
      const offers = await adapter.fetchOffers(cityCodes[0]?.code ?? '');
      itemsIn += catalog.length + offers.length;
      let written = 0;
      let skippedUnchanged = 0;
      let unmatched = 0;

      const all = [
        ...catalog.map((c) => ({ ...c, isOffer: false, offerEndsAt: null as Date | null })),
        ...offers.map((o) => ({ ...o, isOffer: true, offerEndsAt: o.offerEndsAt })),
      ];

      for (const item of all) {
        const match = await matchProduct(item.rawName, storeId);
        if (!match) {
          unmatched++;
          continue;
        }
        if (match.via === 'fuzzy' && match.score >= 0.8) {
          await saveAlias(match.productId, storeId, item.rawName);
        }

        for (const branch of targetBranches) {
          // الفرق: آخر سعر بنفس المصدر لنفس (منتج، فرع)
          const [latest] = await db
            .select()
            .from(schema.prices)
            .where(
              and(
                eq(schema.prices.productId, match.productId),
                eq(schema.prices.branchId, branch.id),
                inArray(schema.prices.source, ['api', 'scrape']),
              ),
            )
            .orderBy(desc(schema.prices.createdAt))
            .limit(1);

          if (
            latest &&
            Number(latest.price) === item.price &&
            latest.isOffer === item.isOffer &&
            latest.confidence > 0
          ) {
            await db
              .update(schema.prices)
              .set({ lastVerifiedAt: new Date(), confidence: baseConfidence(latest.source) })
              .where(eq(schema.prices.id, latest.id));
            skippedUnchanged++;
            continue;
          }

          const result = await submitPrice({
            productId: match.productId,
            branchId: branch.id,
            price: item.price,
            source: 'scrape',
            basis: item.basis,
            isOffer: item.isOffer,
            offerEndsAt: item.offerEndsAt,
          });
          if (result.status === 'published') written++;
        }
      }

      itemsOut += written;
      detail[adapter.storeSlug] = { written, skippedUnchanged, unmatched };

      await db
        .update(schema.storeSourceProfiles)
        .set({ lastSuccessAt: new Date(), failureCount: 0 })
        .where(eq(schema.storeSourceProfiles.storeId, storeId));
    } catch (err) {
      errors++;
      detail[adapter.storeSlug] = { error: String(err) };
    }
  }
  return { itemsIn, itemsOut, errors, detail };
}
