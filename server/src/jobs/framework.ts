// إطار الوظائف المجدولة: كل تشغيل يُسجَّل في job_runs للمراقبة (القسم 15)
// المبادئ: idempotent، كتابة بالفروقات فقط، فشل سلسلة لا يُسقط الخط

import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { logger } from '../logger.js';

export interface JobResult {
  itemsIn?: number;
  itemsOut?: number;
  errors?: number;
  detail?: Record<string, unknown>;
}

export type JobFn = () => Promise<JobResult | void>;

const registry = new Map<string, JobFn>();

export function registerJob(name: string, fn: JobFn) {
  registry.set(name, fn);
}

export function getJobNames(): string[] {
  return [...registry.keys()];
}

export async function runJob(name: string): Promise<JobResult & { status: string }> {
  const fn = registry.get(name);
  if (!fn) throw Object.assign(new Error(`unknown job: ${name}`), { status: 404 });

  const [run] = await db
    .insert(schema.jobRuns)
    .values({ job: name, status: 'running' })
    .returning({ id: schema.jobRuns.id, startedAt: schema.jobRuns.startedAt });
  const started = Date.now();
  try {
    const result = (await fn()) ?? {};
    await db
      .update(schema.jobRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        durationMs: Date.now() - started,
        itemsIn: result.itemsIn ?? 0,
        itemsOut: result.itemsOut ?? 0,
        errors: result.errors ?? 0,
        detail: result.detail ?? null,
      })
      .where(eq(schema.jobRuns.id, run!.id));
    logger.info({ job: name, ...result }, 'job finished');
    return { ...result, status: 'success' };
  } catch (err) {
    await db
      .update(schema.jobRuns)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        durationMs: Date.now() - started,
        errors: 1,
        detail: { error: String(err) },
      })
      .where(eq(schema.jobRuns.id, run!.id));
    logger.error({ job: name, err }, 'job failed');
    return { errors: 1, status: 'failed' };
  }
}
