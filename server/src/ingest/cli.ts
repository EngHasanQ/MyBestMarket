// CLI استيراد حيّ (A3):
//   npm run ingest -- --store=tamimi --city=makkah
//   npm run ingest -- --store=tamimi --city=makkah --dry-run
//   npm run ingest -- --store=tamimi --city=makkah --limit=2 --categories=bakery,dairy
//
// --dry-run: يثبت الوصول للمصدر ويعدّ المنتجات/الصور دون أي كتابة للقاعدة.
// --limit=N: أقصى عدد صفحات لكل تصنيف (لتشغيل أصغر/أسرع).
// --categories=a,b: قصر الزحف على تصنيفات محددة.

import { pool } from '../db/index.js';
import { runIngest } from './runIngest.js';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split('=').slice(1).join('=');
  return process.argv.includes(`--${name}`) ? '' : undefined;
}

async function main() {
  const store = arg('store');
  const city = arg('city');
  if (!store || !city) {
    console.error('الاستخدام: npm run ingest -- --store=tamimi --city=makkah [--dry-run] [--limit=N] [--categories=a,b]');
    process.exit(2);
  }
  const dryRun = arg('dry-run') !== undefined;
  const limit = arg('limit');
  const cats = arg('categories');

  const report = await runIngest({
    storeSlug: store,
    cityCode: city,
    dryRun,
    maxPagesPerCategory: limit ? Number(limit) : undefined,
    categories: cats ? cats.split(',').map((c) => c.trim()).filter(Boolean) : undefined,
    log: (line) => console.log(line),
  });

  console.log('\n=== تقرير الاستيراد ===');
  console.log(JSON.stringify(report, null, 2));
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('فشل الاستيراد:', err);
    await pool.end();
    process.exit(1);
  });
