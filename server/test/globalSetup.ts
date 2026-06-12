// يهاجر قاعدة الاختبار مرة واحدة قبل كل الاختبارات
export default async function setup() {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ?? 'postgresql://waffir:waffir@localhost:5432/waffir_test';
  const { runMigrations } = await import('../src/db/migrate.js');
  const { pool } = await import('../src/db/index.js');
  await runMigrations();
  await pool.end();
}
