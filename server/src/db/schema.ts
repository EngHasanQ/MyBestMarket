import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
  doublePrecision,
} from 'drizzle-orm/pg-core';

// ---------- Enums ----------
export const storeType = pgEnum('store_type', ['supermarket', 'grocery', 'specialty']);
export const priceSource = pgEnum('price_source', [
  'api',
  'scrape',
  'flyer_ocr_verified',
  'user_report',
  'receipt_ocr',
  'manual_admin',
]);
export const priceBasis = pgEnum('price_basis', ['shelf', 'online', 'unknown']);
export const reviewStatus = pgEnum('review_status', ['pending', 'approved', 'rejected']);
export const reviewKind = pgEnum('review_kind', ['flyer', 'anomaly']);
export const userRole = pgEnum('user_role', ['user', 'admin']);
export const listStatus = pgEnum('list_status', ['draft', 'active', 'completed']);
export const placeStatus = pgEnum('place_status', [
  'pending',
  'active',
  'excluded_no_source',
  'rejected',
]);
export const sourceType = pgEnum('source_type', ['api', 'web_catalog', 'flyer', 'user_only']);
export const jobStatus = pgEnum('job_status', ['running', 'success', 'failed']);
export const productStatus = pgEnum('product_status', ['active', 'auto_created', 'merged']);
export const evidenceType = pgEnum('evidence_type', [
  'product_image',
  'page_screenshot',
  'flyer_crop',
  'receipt',
]);

// ---------- Geography ----------
export const cities = pgTable('cities', {
  id: serial('id').primaryKey(),
  nameAr: text('name_ar').notNull(),
  code: text('code').notNull().unique(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  // صندوق إحاطة المدينة — تستخدمه شبكة نقاط الاكتشاف (القسم 13.1)
  minLat: doublePrecision('min_lat'),
  minLng: doublePrecision('min_lng'),
  maxLat: doublePrecision('max_lat'),
  maxLng: doublePrecision('max_lng'),
});

export const stores = pgTable('stores', {
  id: serial('id').primaryKey(),
  nameAr: text('name_ar').notNull(),
  slug: text('slug').notNull().unique(),
  logoUrl: text('logo_url'),
  type: storeType('type').notNull().default('supermarket'),
});

export const storeBranches = pgTable(
  'store_branches',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => stores.id),
    cityId: integer('city_id')
      .notNull()
      .references(() => cities.id),
    nameAr: text('name_ar').notNull(),
    address: text('address'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [index('branches_city_idx').on(t.cityId)],
);

// ---------- Catalog ----------
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  parentId: integer('parent_id'),
  nameAr: text('name_ar').notNull(),
  slug: text('slug').notNull().unique(),
  sortOrder: integer('sort_order').notNull().default(0),
  icon: text('icon'),
});

export const products = pgTable(
  'products',
  {
    id: serial('id').primaryKey(),
    nameAr: text('name_ar').notNull(),
    normalizedName: text('normalized_name').notNull(),
    brand: text('brand'),
    sizeValue: numeric('size_value', { precision: 10, scale: 3 }),
    sizeUnit: text('size_unit'),
    barcode: text('barcode'),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    imageUrl: text('image_url'),
    // active: مُعتمد | auto_created: أنشأه الاستيراد وينتظر مراجعة | merged: دُمج في آخر
    status: productStatus('status').notNull().default('active'),
    mergedInto: integer('merged_into'),
  },
  (t) => [index('products_normalized_idx').on(t.normalizedName)],
);

export const productAliases = pgTable(
  'product_aliases',
  {
    id: serial('id').primaryKey(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    storeId: integer('store_id')
      .notNull()
      .references(() => stores.id),
    rawName: text('raw_name').notNull(),
  },
  (t) => [uniqueIndex('alias_store_raw_uq').on(t.storeId, t.rawName)],
);

// ---------- Prices (append-only) ----------
export const prices = pgTable(
  'prices',
  {
    id: serial('id').primaryKey(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    branchId: integer('branch_id')
      .notNull()
      .references(() => storeBranches.id),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('SAR'),
    isOffer: boolean('is_offer').notNull().default(false),
    offerEndsAt: timestamp('offer_ends_at', { withTimezone: true }),
    source: priceSource('source').notNull(),
    // أساس السعر: رف المتجر أم متجر إلكتروني (القسم 14.2 من الملحق)
    basis: priceBasis('basis').notNull().default('shelf'),
    confidence: integer('confidence').notNull(),
    reportedBy: integer('reported_by').references(() => users.id),
    // إثبات المصدر: رابط صفحة المنتج في موقع المتجر + صورة الدليل
    // (صفحة المجلة أو الفاتورة التي جاء منها السعر) — تُعرض للمستخدم
    sourceUrl: text('source_url'),
    proofImageUrl: text('proof_image_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('prices_product_branch_idx').on(t.productId, t.branchId, t.createdAt),
    index('prices_branch_idx').on(t.branchId),
  ],
);

export const offersReviewQueue = pgTable('offers_review_queue', {
  id: serial('id').primaryKey(),
  branchId: integer('branch_id')
    .notNull()
    .references(() => storeBranches.id),
  kind: reviewKind('kind').notNull().default('flyer'),
  rawText: text('raw_text').notNull(),
  parsedProductName: text('parsed_product_name'),
  parsedPrice: numeric('parsed_price', { precision: 10, scale: 2 }),
  matchedProductId: integer('matched_product_id').references(() => products.id),
  flyerImageUrl: text('flyer_image_url'),
  offerEndsAt: timestamp('offer_ends_at', { withTimezone: true }),
  status: reviewStatus('status').notNull().default('pending'),
  reviewedBy: integer('reviewed_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Users & lists ----------
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: userRole('role').notNull().default('user'),
  cityId: integer('city_id').references(() => cities.id),
  shoppingDay: integer('shopping_day').notNull().default(4),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const shoppingLists = pgTable('shopping_lists', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  title: text('title').notNull(),
  month: text('month').notNull(), // 'YYYY-MM'
  status: listStatus('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const listItems = pgTable('list_items', {
  id: serial('id').primaryKey(),
  listId: integer('list_id')
    .notNull()
    .references(() => shoppingLists.id, { onDelete: 'cascade' }),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id),
  quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull().default('1'),
  chosenBranchId: integer('chosen_branch_id').references(() => storeBranches.id),
  expectedPrice: numeric('expected_price', { precision: 10, scale: 2 }),
  actualPrice: numeric('actual_price', { precision: 10, scale: 2 }),
  isPurchased: boolean('is_purchased').notNull().default(false),
  purchasedAt: timestamp('purchased_at', { withTimezone: true }),
});

export const purchases = pgTable(
  'purchases',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    branchId: integer('branch_id').references(() => storeBranches.id),
    quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull().default('1'),
    price: numeric('price', { precision: 10, scale: 2 }),
    purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('purchases_user_product_idx').on(t.userId, t.productId, t.purchasedAt)],
);

export const priceAlerts = pgTable(
  'price_alerts',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    targetPrice: numeric('target_price', { precision: 10, scale: 2 }),
  },
  (t) => [uniqueIndex('alert_user_product_uq').on(t.userId, t.productId)],
);

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  type: text('type').notNull(), // monthly_list | price_drop | best_time | system
  title: text('title').notNull(),
  body: text('body'),
  payload: jsonb('payload'),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Discovery & sources (القسم 13 من الملحق) ----------
export const discoveredPlaces = pgTable('discovered_places', {
  placeId: text('place_id').primaryKey(),
  cityId: integer('city_id')
    .notNull()
    .references(() => cities.id),
  name: text('name').notNull(),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  types: jsonb('types'),
  website: text('website'),
  phone: text('phone'),
  rating: doublePrecision('rating'),
  userRatingsTotal: integer('user_ratings_total'),
  raw: jsonb('raw'),
  chainStoreId: integer('chain_store_id').references(() => stores.id),
  status: placeStatus('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const storeSourceProfiles = pgTable('store_source_profiles', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id')
    .notNull()
    .references(() => stores.id),
  sourceType: sourceType('source_type').notNull(),
  endpointOrUrl: text('endpoint_or_url'),
  platformHint: text('platform_hint'), // salla | zid | shopify | custom | aggregator
  priceBasis: priceBasis('price_basis').notNull().default('unknown'),
  priority: integer('priority').notNull().default(0),
  isConfirmed: boolean('is_confirmed').notNull().default(false),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  failureCount: integer('failure_count').notNull().default(0),
  // يوم الأسبوع الذي تعلّمه مراقب المجلات لنشر عروض هذه السلسلة (0=أحد)
  learnedPublishWeekday: integer('learned_publish_weekday'),
  lastContentHash: text('last_content_hash'),
});

// معامل معايرة سعر المتجر الإلكتروني → سعر الرف لكل سلسلة (القسم 14.5)
export const chainCalibrations = pgTable('chain_calibrations', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id')
    .notNull()
    .references(() => stores.id)
    .unique(),
  factor: doublePrecision('factor').notNull().default(1),
  sampleCount: integer('sample_count').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Jobs observability (القسم 15) ----------
export const jobRuns = pgTable(
  'job_runs',
  {
    id: serial('id').primaryKey(),
    job: text('job').notNull(),
    status: jobStatus('status').notNull().default('running'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    itemsIn: integer('items_in').notNull().default(0),
    itemsOut: integer('items_out').notNull().default(0),
    errors: integer('errors').notNull().default(0),
    detail: jsonb('detail'),
  },
  (t) => [index('job_runs_job_idx').on(t.job, t.startedAt)],
);

// لقطات مؤشر الدقة اليومية (القسم 14.5 — "دقة 99%")
export const kpiSnapshots = pgTable('kpi_snapshots', {
  id: serial('id').primaryKey(),
  day: text('day').notNull(), // 'YYYY-MM-DD'
  cityId: integer('city_id').references(() => cities.id),
  storeId: integer('store_id').references(() => stores.id),
  displayedPrices: integer('displayed_prices').notNull().default(0),
  freshVerified: integer('fresh_verified').notNull().default(0), // confidence>=90 && age<=7d
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- مرادفات البحث (سبرنت v2 — جزء 1.2/4) ----------
// كل صف = مصطلح داخل مجموعة مترادفات؛ التوسعة: مصطلح الاستعلام → كل مصطلحات مجموعته
export const searchSynonyms = pgTable(
  'search_synonyms',
  {
    id: serial('id').primaryKey(),
    groupKey: text('group_key').notNull(),
    term: text('term').notNull(), // مطبّع بنفس normalizeArabic
  },
  (t) => [uniqueIndex('synonym_term_uq').on(t.term), index('synonym_group_idx').on(t.groupKey)],
);

// ---------- ربط تصنيفات المتجر بتصنيفاتنا (جزء 1.1) ----------
export const categoryMappings = pgTable(
  'category_mappings',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => stores.id),
    storeCategoryPath: text('store_category_path').notNull(),
    categoryId: integer('category_id').references(() => categories.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('catmap_store_path_uq').on(t.storeId, t.storeCategoryPath)],
);

// ---------- إثبات السعر (جزء 2) ----------
export const priceEvidence = pgTable(
  'price_evidence',
  {
    id: serial('id').primaryKey(),
    priceId: integer('price_id')
      .notNull()
      .references(() => prices.id, { onDelete: 'cascade' }),
    evidenceType: evidenceType('evidence_type').notNull(),
    imagePath: text('image_path'), // داخل storage/evidence — مخزن بهاش المحتوى
    sourceUrl: text('source_url'),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('evidence_price_idx').on(t.priceId)],
);

// ---------- طلبات إضافة منتجات من المستخدمين (جزء 3.3 — الحالات الفارغة) ----------
export const productRequests = pgTable('product_requests', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  query: text('query').notNull(),
  cityId: integer('city_id').references(() => cities.id),
  status: reviewStatus('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
