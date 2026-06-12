// المدن والتصنيفات والمنتجات والمقارنة — كل الاستعلامات مقيدة بالمدينة (القسم 5-A)

import { Router } from 'express';
import { and, asc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { normalizeArabic } from '../services/normalize.js';
import { resolveProductPrices } from '../services/priceResolver.js';
import { detectBestTimes } from '../services/bestTime.js';

export const catalogRouter = Router();

catalogRouter.get('/cities', async (_req, res, next) => {
  try {
    res.json(await db.select().from(schema.cities).orderBy(asc(schema.cities.id)));
  } catch (err) {
    next(err);
  }
});

catalogRouter.get('/categories', async (_req, res, next) => {
  try {
    const all = await db
      .select()
      .from(schema.categories)
      .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.id));
    const mains = all.filter((c) => c.parentId == null);
    res.json(
      mains.map((m) => ({ ...m, children: all.filter((c) => c.parentId === m.id) })),
    );
  } catch (err) {
    next(err);
  }
});

const productsQuery = z.object({
  cityId: z.coerce.number().int(),
  categoryId: z.coerce.number().int().optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  offset: z.coerce.number().int().min(0).default(0),
});

catalogRouter.get('/products', async (req, res, next) => {
  try {
    const query = productsQuery.parse(req.query);
    const filters = [];
    if (query.categoryId) {
      // تصنيف رئيس يشمل أبناءه
      const children = await db
        .select({ id: schema.categories.id })
        .from(schema.categories)
        .where(eq(schema.categories.parentId, query.categoryId));
      const ids = [query.categoryId, ...children.map((c) => c.id)];
      filters.push(inArray(schema.products.categoryId, ids));
    }
    if (query.q) {
      const normalized = normalizeArabic(query.q);
      filters.push(
        or(
          ilike(schema.products.normalizedName, `%${normalized}%`),
          sql`similarity(${schema.products.normalizedName}, ${normalized}) > 0.25`,
        ),
      );
    }

    const rows = await db
      .select({
        product: schema.products,
        categoryName: schema.categories.nameAr,
        categoryIcon: schema.categories.icon,
        categorySort: schema.categories.sortOrder,
      })
      .from(schema.products)
      .innerJoin(schema.categories, eq(schema.products.categoryId, schema.categories.id))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(schema.categories.sortOrder), asc(schema.products.nameAr))
      .limit(query.limit)
      .offset(query.offset);

    // أرخص سعر معروض لكل منتج في مدينة المستخدم (مع شارة الحداثة)
    const withPrices = await Promise.all(
      rows.map(async ({ product: p, categoryName, categoryIcon }) => {
        const resolved = await resolveProductPrices(p.id, query.cityId);
        const prices = [...resolved.values()].filter((r) => !r.stale);
        const cheapest =
          (prices.length ? prices : [...resolved.values()]).sort((a, b) => a.price - b.price)[0] ??
          null;
        return { ...p, categoryName, categoryIcon, cheapest };
      }),
    );
    res.json(withPrices);
  } catch (err) {
    next(err);
  }
});

catalogRouter.get('/products/:id', async (req, res, next) => {
  try {
    const id = z.coerce.number().int().parse(req.params.id);
    const cityId = z.coerce.number().int().parse(req.query.cityId);
    const product = await db.query.products.findFirst({ where: eq(schema.products.id, id) });
    if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });

    const resolved = await resolveProductPrices(id, cityId);
    const branchIds = [...resolved.keys()];
    const branches = branchIds.length
      ? await db
          .select({
            id: schema.storeBranches.id,
            nameAr: schema.storeBranches.nameAr,
            storeId: schema.storeBranches.storeId,
            storeName: schema.stores.nameAr,
            storeSlug: schema.stores.slug,
          })
          .from(schema.storeBranches)
          .innerJoin(schema.stores, eq(schema.storeBranches.storeId, schema.stores.id))
          .where(inArray(schema.storeBranches.id, branchIds))
      : [];
    const branchInfo = new Map(branches.map((b) => [b.id, b]));

    const comparisons = [...resolved.values()]
      .map((r) => ({ ...r, branch: branchInfo.get(r.branchId) ?? null }))
      .sort((a, b) => a.price - b.price);

    // توصية التوقيت من تاريخ العروض (القسم 6.4)
    const offerHistory = await db
      .select({
        createdAt: schema.prices.createdAt,
        branchId: schema.prices.branchId,
        storeId: schema.storeBranches.storeId,
      })
      .from(schema.prices)
      .innerJoin(schema.storeBranches, eq(schema.prices.branchId, schema.storeBranches.id))
      .where(and(eq(schema.prices.productId, id), eq(schema.prices.isOffer, true)));
    const insights = detectBestTimes(
      offerHistory.map((o) => ({ productId: id, storeId: o.storeId, date: o.createdAt })),
    );

    res.json({ product, comparisons, bestTime: insights[0] ?? null });
  } catch (err) {
    next(err);
  }
});
