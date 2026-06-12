// توليد القوائم الشهرية: للمستخدمين الذين يوم تسوقهم بعد 3 أيام (القسمان 5-B و6)

import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { config } from '../config.js';
import { generateMonthlyCandidates } from '../services/consumption.js';
import { resolveCheapestForUser } from '../services/listService.js';
import type { JobResult } from './framework.js';

export async function monthlyListGen(now = new Date()): Promise<JobResult> {
  const today = now.getDate();
  const allUsers = await db.select().from(schema.users).where(eq(schema.users.role, 'user'));
  // shopping_day − leadDays == اليوم (مع التفاف نهاية الشهر)
  const due = allUsers.filter((u) => {
    const target = u.shoppingDay - config.listLeadDays;
    const wrapped = target <= 0 ? target + 28 : target;
    return wrapped === today;
  });

  let generated = 0;
  for (const user of due) {
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    // idempotent: قائمة واحدة لكل مستخدم/شهر
    const existing = await db.query.shoppingLists.findFirst({
      where: and(eq(schema.shoppingLists.userId, user.id), eq(schema.shoppingLists.month, month)),
    });
    if (existing) continue;

    const history = await db
      .select()
      .from(schema.purchases)
      .where(eq(schema.purchases.userId, user.id));
    if (history.length === 0) continue;

    const shoppingDate = new Date(now.getFullYear(), now.getMonth(), user.shoppingDay);
    if (shoppingDate.getTime() < now.getTime()) shoppingDate.setMonth(shoppingDate.getMonth() + 1);

    const candidates = generateMonthlyCandidates(
      history.map((h) => ({
        productId: h.productId,
        quantity: Number(h.quantity),
        purchasedAt: h.purchasedAt,
      })),
      shoppingDate,
    );
    if (candidates.length === 0) continue;

    const [list] = await db
      .insert(schema.shoppingLists)
      .values({
        userId: user.id,
        title: `القائمة الشهرية — ${month}`,
        month,
        status: 'draft',
      })
      .returning();

    const resolved = await resolveCheapestForUser(
      user.cityId,
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

    await db.insert(schema.notifications).values({
      userId: user.id,
      type: 'monthly_list',
      title: 'قائمتك الشهرية جاهزة 🛒',
      body: `جهّزنا لك ${resolved.length} منتجاً ليوم تسوقك القادم (يوم ${user.shoppingDay}). راجعها وعدّلها قبل التأكيد.`,
      payload: { listId: list!.id },
    });
    generated++;
  }
  return { itemsIn: due.length, itemsOut: generated };
}
