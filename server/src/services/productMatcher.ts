// مطابقة الأسماء الخام (مجلات/فواتير/كتالوجات) مع المنتجات القياسية
// عبر product_aliases ثم المطابقة الضبابية المطبّعة (القسمان 2 و14.3)

import { and, eq, ne, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { extractSize, normalizeArabic, similarity } from './normalize.js';

export interface MatchResult {
  productId: number;
  nameAr: string;
  score: number; // 1 = مطابقة قطعية عبر alias
  via: 'alias' | 'fuzzy';
}

const FUZZY_THRESHOLD = 0.55;

/** اتبع سلسلة الدمج: منتج مدموج يُحوَّل لهدفه (جزء 1.2 — أداة الدمج) */
async function resolveMerged(productId: number): Promise<number> {
  let current = productId;
  for (let i = 0; i < 5; i++) {
    const p = await db.query.products.findFirst({ where: eq(schema.products.id, current) });
    if (!p || p.status !== 'merged' || p.mergedInto == null) return current;
    current = p.mergedInto;
  }
  return current;
}

export async function matchProduct(
  rawName: string,
  storeId?: number | null,
): Promise<MatchResult | null> {
  // 1) مطابقة قطعية عبر alias المتجر
  if (storeId != null) {
    const alias = await db
      .select({ productId: schema.productAliases.productId })
      .from(schema.productAliases)
      .where(
        and(
          eq(schema.productAliases.storeId, storeId),
          eq(schema.productAliases.rawName, rawName),
        ),
      )
      .limit(1);
    if (alias[0]) {
      const resolvedId = await resolveMerged(alias[0].productId);
      const product = await db.query.products.findFirst({
        where: eq(schema.products.id, resolvedId),
      });
      if (product) return { productId: product.id, nameAr: product.nameAr, score: 1, via: 'alias' };
    }
  }

  // 2) مطابقة ضبابية: مرشّحون عبر pg_trgm ثم ترتيب بمعامل Dice
  const normalized = normalizeArabic(rawName);
  if (!normalized) return null;
  const candidates = await db
    .select({
      id: schema.products.id,
      nameAr: schema.products.nameAr,
      normalizedName: schema.products.normalizedName,
    })
    .from(schema.products)
    .where(
      and(
        ne(schema.products.status, 'merged'),
        sql`similarity(${schema.products.normalizedName}, ${normalized}) > 0.2`,
      ),
    )
    .orderBy(sql`similarity(${schema.products.normalizedName}, ${normalized}) DESC`)
    .limit(10);

  let best: MatchResult | null = null;
  for (const c of candidates) {
    const score = similarity(c.normalizedName, normalized);
    if (score >= FUZZY_THRESHOLD && (best == null || score > best.score)) {
      best = { productId: c.id, nameAr: c.nameAr, score, via: 'fuzzy' };
    }
  }
  return best;
}

/** تثبيت مطابقة مؤكدة كـ alias حتى تصبح قطعية مستقبلاً */
export async function saveAlias(productId: number, storeId: number, rawName: string) {
  await db
    .insert(schema.productAliases)
    .values({ productId, storeId, rawName })
    .onConflictDoNothing();
}

/**
 * إنشاء منتج قياسي تلقائياً لمنتج خام لم يُطابَق (جزء 1.2):
 * بدل إسقاطه، يُنشأ بحالة auto_created ويُصنَّف عبر category_mappings
 * أو يقع في "غير مصنف" ليدمجه/يصنفه الأدمن لاحقاً.
 */
export async function autoCreateProduct(input: {
  rawName: string;
  storeId: number;
  brand?: string | null;
  barcode?: string | null;
  imageUrl?: string | null;
  storeCategoryPath?: string | null;
}): Promise<MatchResult> {
  let categoryId: number | null = null;
  if (input.storeCategoryPath) {
    const mapping = await db.query.categoryMappings.findFirst({
      where: and(
        eq(schema.categoryMappings.storeId, input.storeId),
        eq(schema.categoryMappings.storeCategoryPath, input.storeCategoryPath),
      ),
    });
    categoryId = mapping?.categoryId ?? null;
    // سجّل مسار تصنيف المتجر للأدمن حتى لو لم يُربط بعد
    if (!mapping) {
      await db
        .insert(schema.categoryMappings)
        .values({ storeId: input.storeId, storeCategoryPath: input.storeCategoryPath })
        .onConflictDoNothing();
    }
  }
  if (categoryId == null) {
    categoryId = await ensureUncategorized();
  }

  const size = extractSize(input.rawName);
  const [product] = await db
    .insert(schema.products)
    .values({
      nameAr: input.rawName,
      normalizedName: normalizeArabic(input.rawName),
      brand: input.brand ?? null,
      barcode: input.barcode ?? null,
      sizeValue: size ? String(size.value) : null,
      sizeUnit: size?.unit ?? null,
      categoryId,
      imageUrl: input.imageUrl ?? null,
      status: 'auto_created',
    })
    .returning();
  await saveAlias(product!.id, input.storeId, input.rawName);
  return { productId: product!.id, nameAr: product!.nameAr, score: 1, via: 'alias' };
}

async function ensureUncategorized(): Promise<number> {
  const existing = await db.query.categories.findFirst({
    where: eq(schema.categories.slug, 'uncategorized'),
  });
  if (existing) return existing.id;
  const [created] = await db
    .insert(schema.categories)
    .values({ nameAr: 'غير مصنف', slug: 'uncategorized', sortOrder: 999 })
    .onConflictDoNothing()
    .returning();
  if (created) return created.id;
  const again = await db.query.categories.findFirst({
    where: eq(schema.categories.slug, 'uncategorized'),
  });
  return again!.id;
}

/** دمج منتج مكرر في منتج قياسي: نقل الأسعار والأسماء والقوائم مع أثر تدقيقي */
export async function mergeProducts(sourceId: number, targetId: number) {
  if (sourceId === targetId) {
    throw Object.assign(new Error('لا يمكن دمج المنتج في نفسه'), { status: 422 });
  }
  const source = await db.query.products.findFirst({ where: eq(schema.products.id, sourceId) });
  const target = await db.query.products.findFirst({ where: eq(schema.products.id, targetId) });
  if (!source || !target) throw Object.assign(new Error('منتج غير موجود'), { status: 404 });
  if (target.status === 'merged') {
    throw Object.assign(new Error('الهدف نفسه مدموج'), { status: 422 });
  }

  const moved = { prices: 0, aliases: 0, listItems: 0, purchases: 0 };
  moved.prices = (
    await db
      .update(schema.prices)
      .set({ productId: targetId })
      .where(eq(schema.prices.productId, sourceId))
      .returning({ id: schema.prices.id })
  ).length;
  // أسماء مكررة لنفس المتجر تُحذف بدل نقلها (قيد الفرادة)
  const aliases = await db
    .select()
    .from(schema.productAliases)
    .where(eq(schema.productAliases.productId, sourceId));
  for (const a of aliases) {
    const dup = await db.query.productAliases.findFirst({
      where: and(
        eq(schema.productAliases.storeId, a.storeId),
        eq(schema.productAliases.rawName, a.rawName),
        eq(schema.productAliases.productId, targetId),
      ),
    });
    if (dup) {
      await db.delete(schema.productAliases).where(eq(schema.productAliases.id, a.id));
    } else {
      await db
        .update(schema.productAliases)
        .set({ productId: targetId })
        .where(eq(schema.productAliases.id, a.id));
      moved.aliases++;
    }
  }
  moved.listItems = (
    await db
      .update(schema.listItems)
      .set({ productId: targetId })
      .where(eq(schema.listItems.productId, sourceId))
      .returning({ id: schema.listItems.id })
  ).length;
  moved.purchases = (
    await db
      .update(schema.purchases)
      .set({ productId: targetId })
      .where(eq(schema.purchases.productId, sourceId))
      .returning({ id: schema.purchases.id })
  ).length;
  await db.delete(schema.priceAlerts).where(eq(schema.priceAlerts.productId, sourceId));

  // صورة الهدف تُكمَّل من المصدر إن كانت ناقصة
  if (!target.imageUrl && source.imageUrl) {
    await db
      .update(schema.products)
      .set({ imageUrl: source.imageUrl })
      .where(eq(schema.products.id, targetId));
  }
  // الأثر التدقيقي: يبقى صف المصدر بحالة merged ومؤشر الهدف
  await db
    .update(schema.products)
    .set({ status: 'merged', mergedInto: targetId })
    .where(eq(schema.products.id, sourceId));
  return moved;
}
