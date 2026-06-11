// السلة والقوائم ووضع التسوق (القسمان 5-B و5-C)

import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { submitPrice } from '../services/priceResolver.js';
import { resolveCheapestForUser, optimizationSummary } from '../services/listService.js';
import { generateMonthlyCandidates } from '../services/consumption.js';

export const listsRouter = Router();
listsRouter.use(authRequired);

async function getOwnedList(listId: number, userId: number) {
  const list = await db.query.shoppingLists.findFirst({
    where: and(eq(schema.shoppingLists.id, listId), eq(schema.shoppingLists.userId, userId)),
  });
  if (!list) throw Object.assign(new Error('القائمة غير موجودة'), { status: 404 });
  return list;
}

async function listWithItems(listId: number) {
  const items = await db
    .select({
      id: schema.listItems.id,
      productId: schema.listItems.productId,
      productName: schema.products.nameAr,
      categoryId: schema.products.categoryId,
      quantity: schema.listItems.quantity,
      chosenBranchId: schema.listItems.chosenBranchId,
      expectedPrice: schema.listItems.expectedPrice,
      actualPrice: schema.listItems.actualPrice,
      isPurchased: schema.listItems.isPurchased,
      branchName: schema.storeBranches.nameAr,
      storeName: schema.stores.nameAr,
    })
    .from(schema.listItems)
    .innerJoin(schema.products, eq(schema.listItems.productId, schema.products.id))
    .leftJoin(schema.storeBranches, eq(schema.listItems.chosenBranchId, schema.storeBranches.id))
    .leftJoin(schema.stores, eq(schema.storeBranches.storeId, schema.stores.id))
    .where(eq(schema.listItems.listId, listId));
  return items;
}

listsRouter.get('/', async (req, res, next) => {
  try {
    const lists = await db
      .select()
      .from(schema.shoppingLists)
      .where(eq(schema.shoppingLists.userId, req.user!.id))
      .orderBy(desc(schema.shoppingLists.createdAt));
    res.json(lists);
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({ title: z.string().min(1).max(120).default('قائمة جديدة') });

listsRouter.post('/', async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body ?? {});
    const month = new Date().toISOString().slice(0, 7);
    const [list] = await db
      .insert(schema.shoppingLists)
      .values({ userId: req.user!.id, title: body.title, month, status: 'draft' })
      .returning();
    res.status(201).json(list);
  } catch (err) {
    next(err);
  }
});

listsRouter.get('/:id', async (req, res, next) => {
  try {
    const list = await getOwnedList(Number(req.params.id), req.user!.id);
    const items = await listWithItems(list.id);
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, req.user!.id) });
    const summary =
      user?.cityId && items.length
        ? await optimizationSummary(
            user.cityId,
            items.map((i) => ({ productId: i.productId, quantity: Number(i.quantity) })),
          )
        : null;
    res.json({ ...list, items, optimization: summary });
  } catch (err) {
    next(err);
  }
});

const addItemSchema = z.object({
  productId: z.number().int(),
  quantity: z.number().positive().default(1),
  branchId: z.number().int().nullable().optional(),
});

listsRouter.post('/:id/items', async (req, res, next) => {
  try {
    const list = await getOwnedList(Number(req.params.id), req.user!.id);
    const body = addItemSchema.parse(req.body);

    let branchId = body.branchId ?? null;
    let expectedPrice: number | null = null;
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, req.user!.id) });
    if (user?.cityId) {
      const [resolved] = await resolveCheapestForUser(user.cityId, [
        { productId: body.productId, quantity: body.quantity },
      ]);
      branchId = branchId ?? resolved?.branchId ?? null;
      expectedPrice = resolved?.price ?? null;
    }

    const [item] = await db
      .insert(schema.listItems)
      .values({
        listId: list.id,
        productId: body.productId,
        quantity: String(body.quantity),
        chosenBranchId: branchId,
        expectedPrice: expectedPrice != null ? String(expectedPrice) : null,
      })
      .returning();
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

listsRouter.delete('/:id/items/:itemId', async (req, res, next) => {
  try {
    const list = await getOwnedList(Number(req.params.id), req.user!.id);
    await db
      .delete(schema.listItems)
      .where(
        and(eq(schema.listItems.id, Number(req.params.itemId)), eq(schema.listItems.listId, list.id)),
      );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** توليد القائمة الشهرية عند الطلب (نفس منطق الوظيفة المجدولة) */
listsRouter.post('/generate-monthly', async (req, res, next) => {
  try {
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, req.user!.id) });
    const history = await db
      .select()
      .from(schema.purchases)
      .where(eq(schema.purchases.userId, req.user!.id));
    if (history.length === 0) {
      return res.status(422).json({ error: 'لا يوجد تاريخ شراء كافٍ لتوليد قائمة' });
    }
    const now = new Date();
    const shoppingDate = new Date(now.getFullYear(), now.getMonth(), user!.shoppingDay);
    if (shoppingDate.getTime() < now.getTime()) shoppingDate.setMonth(shoppingDate.getMonth() + 1);

    const candidates = generateMonthlyCandidates(
      history.map((h) => ({
        productId: h.productId,
        quantity: Number(h.quantity),
        purchasedAt: h.purchasedAt,
      })),
      shoppingDate,
    );
    if (candidates.length === 0) {
      return res.status(422).json({ error: 'لا منتجات مستحقة في نافذة يوم التسوق' });
    }

    const month = `${shoppingDate.getFullYear()}-${String(shoppingDate.getMonth() + 1).padStart(2, '0')}`;
    const [list] = await db
      .insert(schema.shoppingLists)
      .values({ userId: req.user!.id, title: `القائمة الشهرية — ${month}`, month, status: 'draft' })
      .returning();

    const resolved = await resolveCheapestForUser(
      user?.cityId ?? null,
      candidates.map((c) => ({ productId: c.productId, quantity: c.quantity })),
    );
    for (const item of resolved) {
      await db.insert(schema.listItems).values({
        listId: list!.id,
        productId: item.productId,
        quantity: String(item.quantity),
        chosenBranchId: item.branchId,
        expectedPrice: item.price != null ? String(item.price) : null,
      });
    }
    const items = await listWithItems(list!.id);
    res.status(201).json({ ...list, items });
  } catch (err) {
    next(err);
  }
});

const statusSchema = z.object({ status: z.enum(['draft', 'active', 'completed']) });

listsRouter.patch('/:id', async (req, res, next) => {
  try {
    const list = await getOwnedList(Number(req.params.id), req.user!.id);
    const body = statusSchema.parse(req.body);
    const [updated] = await db
      .update(schema.shoppingLists)
      .set({ status: body.status })
      .where(eq(schema.shoppingLists.id, list.id))
      .returning();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// وضع التسوق: شطب عنصر + إدخال السعر الفعلي (يغذي قاعدة الأسعار — قسم 5-C)
const checkSchema = z.object({
  isPurchased: z.boolean(),
  actualPrice: z.number().positive().optional(),
});

listsRouter.patch('/:id/items/:itemId', async (req, res, next) => {
  try {
    const list = await getOwnedList(Number(req.params.id), req.user!.id);
    const body = checkSchema.parse(req.body);
    const item = await db.query.listItems.findFirst({
      where: and(
        eq(schema.listItems.id, Number(req.params.itemId)),
        eq(schema.listItems.listId, list.id),
      ),
    });
    if (!item) return res.status(404).json({ error: 'العنصر غير موجود' });

    let priceReport: unknown = null;
    if (body.actualPrice != null && item.chosenBranchId != null) {
      // إدخال يدوي في وضع التسوق: ثقة 90 (قسم 14.4)، يخضع لحارس الشذوذ
      priceReport = await submitPrice({
        productId: item.productId,
        branchId: item.chosenBranchId,
        price: body.actualPrice,
        source: 'user_report',
        basis: 'shelf',
        reportedBy: req.user!.id,
      });
    }

    const [updated] = await db
      .update(schema.listItems)
      .set({
        isPurchased: body.isPurchased,
        actualPrice: body.actualPrice != null ? String(body.actualPrice) : item.actualPrice,
        purchasedAt: body.isPurchased ? new Date() : null,
      })
      .where(eq(schema.listItems.id, item.id))
      .returning();
    res.json({ item: updated, priceReport });
  } catch (err) {
    next(err);
  }
});

/** إنهاء التسوق: إغلاق القائمة، كتابة purchases، وملخص التوفير (قسم 5-C) */
listsRouter.post('/:id/finish', async (req, res, next) => {
  try {
    const list = await getOwnedList(Number(req.params.id), req.user!.id);
    const items = await db
      .select()
      .from(schema.listItems)
      .where(eq(schema.listItems.listId, list.id));

    let expectedTotal = 0;
    let actualTotal = 0;
    for (const item of items.filter((i) => i.isPurchased)) {
      const qty = Number(item.quantity);
      const expected = item.expectedPrice != null ? Number(item.expectedPrice) : null;
      const actual =
        item.actualPrice != null ? Number(item.actualPrice) : expected;
      if (expected != null) expectedTotal += expected * qty;
      if (actual != null) actualTotal += actual * qty;
      await db.insert(schema.purchases).values({
        userId: req.user!.id,
        productId: item.productId,
        branchId: item.chosenBranchId,
        quantity: item.quantity,
        price: actual != null ? String(actual) : null,
        purchasedAt: item.purchasedAt ?? new Date(),
      });
    }
    await db
      .update(schema.shoppingLists)
      .set({ status: 'completed' })
      .where(eq(schema.shoppingLists.id, list.id));

    res.json({
      purchasedCount: items.filter((i) => i.isPurchased).length,
      skippedCount: items.filter((i) => !i.isPurchased).length,
      expectedTotal: Math.round(expectedTotal * 100) / 100,
      actualTotal: Math.round(actualTotal * 100) / 100,
      savings: Math.round((expectedTotal - actualTotal) * 100) / 100,
    });
  } catch (err) {
    next(err);
  }
});
