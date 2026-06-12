// مطابقة الأسماء الخام (مجلات/فواتير/كتالوجات) مع المنتجات القياسية
// عبر product_aliases ثم المطابقة الضبابية المطبّعة (القسمان 2 و14.3)

import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { normalizeArabic, similarity } from './normalize.js';

export interface MatchResult {
  productId: number;
  nameAr: string;
  score: number; // 1 = مطابقة قطعية عبر alias
  via: 'alias' | 'fuzzy';
}

const FUZZY_THRESHOLD = 0.55;

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
      const product = await db.query.products.findFirst({
        where: eq(schema.products.id, alias[0].productId),
      });
      if (product) return { productId: product.id, nameAr: product.nameAr, score: 1, via: 'alias' };
    }
  }

  // 2) مطابقة ضبابية: مرشّحون عبر pg_trgm ثم ترتيب بمعامل Dice
  const normalized = normalizeArabic(rawName);
  if (!normalized) return null;
  const candidates = await db
    .select({ id: schema.products.id, nameAr: schema.products.nameAr, normalizedName: schema.products.normalizedName })
    .from(schema.products)
    .where(sql`similarity(${schema.products.normalizedName}, ${normalized}) > 0.2`)
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
