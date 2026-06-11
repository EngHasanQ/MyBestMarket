import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, pool } from './index.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations() {
  // امتداد البحث الضبابي للأسماء العربية المطبّعة (القسم 5-A)
  await pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  await migrate(db, { migrationsFolder: path.resolve(here, '../../drizzle') });
  await pool.query(
    `CREATE INDEX IF NOT EXISTS products_trgm_idx ON products USING gin (normalized_name gin_trgm_ops)`,
  );
}

// تشغيل مباشر: npm run db:migrate
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations()
    .then(() => {
      console.log('migrations applied');
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
