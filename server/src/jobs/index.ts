// تسجيل الوظائف وجدولتها (القسم 15) — node-cron داخل عملية الخادم (صديق Railway)

import cron from 'node-cron';
import { eq, and } from 'drizzle-orm';
import { registerJob, runJob } from './framework.js';
import { catalogRefresh } from './catalogRefresh.js';
import {
  offerExpiry,
  stalenessSweep,
  sourceHealth,
  kpiSnapshot,
  flyerWatcher,
} from './maintenance.js';
import { monthlyListGen } from './monthlyListGen.js';
import { runDiscoveryForCity, type DiscoveryStats } from '../services/discovery.js';
import { qualifyPendingStores } from '../services/sourceQualification.js';
import { db, schema } from '../db/index.js';
import { logger } from '../logger.js';

export function registerAllJobs() {
  registerJob('catalog-refresh', catalogRefresh);
  registerJob('offer-expiry', offerExpiry);
  registerJob('staleness-sweep', stalenessSweep);
  registerJob('source-health', sourceHealth);
  registerJob('kpi-snapshot', kpiSnapshot);
  registerJob('flyer-watcher', flyerWatcher);
  registerJob('monthly-list-gen', monthlyListGen);
  registerJob('requalification', async () => {
    // الاكتشاف يعمل فقط للمدن التي فيها مستخدم نشِط (قسم 13.1.4)
    const activeCities = await db
      .selectDistinct({ cityId: schema.users.cityId })
      .from(schema.users)
      .where(eq(schema.users.role, 'user'));
    const stats: DiscoveryStats[] = [];
    for (const c of activeCities) {
      if (c.cityId == null) continue;
      stats.push(await runDiscoveryForCity(c.cityId));
    }
    const q = await qualifyPendingStores();
    return {
      itemsIn: stats.reduce((s, x) => s + x.placesFound, 0),
      itemsOut: q.qualified,
      detail: { ...q, cities: stats.length },
    };
  });
}

/** الجداول الزمنية (القسم 15) — لا تُشغَّل في الاختبارات */
export function scheduleJobs() {
  cron.schedule('0 3 * * *', () => void runJob('catalog-refresh')); // يومياً 03:00
  cron.schedule('0 4 * * *', () => void runJob('staleness-sweep')); // يومياً 04:00
  cron.schedule('0 5 * * *', () => void runJob('source-health')); // يومياً 05:00
  cron.schedule('0 6 * * *', () => void runJob('flyer-watcher')); // يومياً 06:00
  cron.schedule('0 7 * * *', () => void runJob('monthly-list-gen')); // يومياً 07:00
  cron.schedule('30 7 * * *', () => void runJob('kpi-snapshot')); // يومياً 07:30
  cron.schedule('0 * * * *', () => void runJob('offer-expiry')); // كل ساعة
  cron.schedule('0 2 1 * *', () => void runJob('requalification')); // شهرياً

  // فحص إضافي كل ساعة في يوم النشر المتعلَّم لكل سلسلة مجلات (قسم 14.1)
  cron.schedule('30 8-20 * * *', async () => {
    const today = new Date().getDay();
    const due = await db
      .select()
      .from(schema.storeSourceProfiles)
      .where(
        and(
          eq(schema.storeSourceProfiles.sourceType, 'flyer'),
          eq(schema.storeSourceProfiles.learnedPublishWeekday, today),
        ),
      );
    if (due.length > 0) void runJob('flyer-watcher');
  });

  logger.info('cron jobs scheduled');
}
