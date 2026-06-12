export interface User {
  id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
  cityId: number | null;
  shoppingDay: number | null;
}

export interface City {
  id: number;
  nameAr: string;
  code: string;
  lat: number;
  lng: number;
}

export interface CategoryChild {
  id: number;
  nameAr: string;
  slug: string;
  icon: string | null;
}

export interface Category extends CategoryChild {
  children: CategoryChild[];
}

export interface CheapestPrice {
  price: number;
  confidence: number;
  stale: boolean;
  estimated: boolean;
  isOffer: boolean;
  freshnessLabel: string;
  branchId: number;
}

export interface Product {
  id: number;
  nameAr: string;
  brand: string | null;
  /** عمود numeric — يصل كنص من الخادم */
  sizeValue: string | number | null;
  sizeUnit: string | null;
  imageUrl: string | null;
  categoryId: number;
  cheapest: CheapestPrice | null;
}

export interface ComparisonBranch {
  id: number;
  nameAr: string;
  storeId: number;
  storeName: string;
  storeSlug: string;
}

export interface Comparison {
  branchId: number;
  price: number;
  confidence: number;
  stale: boolean;
  estimated: boolean;
  isOffer: boolean;
  offerEndsAt: string | null;
  source: string;
  basis: 'shelf' | 'online' | 'unknown';
  freshnessLabel: string;
  branch: ComparisonBranch;
}

export interface ProductDetail {
  product: Product;
  comparisons: Comparison[];
  bestTime: { labelAr: string } | null;
}

export interface ShoppingList {
  id: number;
  title: string;
  month: string | null;
  status: 'draft' | 'active' | 'completed';
  createdAt: string;
}

export interface ListItem {
  id: number;
  productId: number;
  productName: string;
  categoryId: number | null;
  /** أعمدة numeric — تصل كنصوص من الخادم */
  quantity: string | number;
  chosenBranchId: number | null;
  expectedPrice: string | number | null;
  actualPrice: string | number | null;
  isPurchased: boolean;
  branchName: string | null;
  storeName: string | null;
}

export interface Optimization {
  bestSingleStore: { nameAr: string; total: number; coveredItems: number } | null;
  optimalSplit: {
    total: number;
    savings: number;
    stores: { nameAr: string; items: number; subtotal: number }[];
  } | null;
}

export interface ListDetail extends ShoppingList {
  items: ListItem[];
  optimization: Optimization | null;
}

export interface FinishResult {
  purchasedCount: number;
  skippedCount: number;
  expectedTotal: number;
  actualTotal: number;
  savings: number;
}

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  payload: Record<string, unknown> | null;
}

export interface PriceAlert {
  id: number;
  productId: number;
  targetPrice: string | number | null;
  productName?: string;
}

export interface ReceiptMatchedLine {
  line: string;
  productId: number;
  productName: string;
  price: number;
}

export interface ReceiptUnmatchedLine {
  line: string;
  productName: string;
  price: number;
}

export interface ReceiptResult {
  storeName: string | null;
  total: number | null;
  qrVerified: boolean;
  matched: ReceiptMatchedLine[];
  unmatched: ReceiptUnmatchedLine[];
}

// ---------- Admin ----------

export interface AdminDashboard {
  kpi: { displayed: number; fresh: number; ratio: number };
  perCity: { city: string; displayed: number; fresh: number; ratio: number }[];
  reviewQueue: { total: number; overdue: number };
  kpiHistory: {
    id: number;
    day: string;
    cityId: number | null;
    storeId: number | null;
    displayedPrices: number;
    freshVerified: number;
  }[];
}

export interface ReviewItem {
  id: number;
  branchId: number;
  kind: 'flyer' | 'anomaly';
  rawText: string | null;
  parsedProductName: string | null;
  parsedPrice: string | number | null;
  matchedProductId: number | null;
  matchedProductName: string | null;
  offerEndsAt: string | null;
  status: 'pending' | 'approved' | 'rejected';
  branchName: string | null;
  createdAt: string;
}

/** صف من job_runs (drizzle، حقول camelCase) */
export interface JobRun {
  id: number;
  job: string;
  status: 'running' | 'success' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  itemsIn: number;
  itemsOut: number;
  errors: number;
}

/** آخر تشغيل لكل وظيفة — SQL خام بحقول snake_case */
export interface JobLastRun {
  id: number;
  job: string;
  status: 'running' | 'success' | 'failed';
  started_at: string;
  finished_at: string | null;
  errors: number;
}

export interface AdminJobs {
  jobs: string[];
  lastRuns: JobLastRun[];
}

export interface AdminStore {
  id: number;
  nameAr: string;
  slug: string;
  type?: string;
  logoUrl?: string | null;
}

export interface DiscoveredPlace {
  placeId: string;
  cityId: number;
  name: string;
  website: string | null;
  phone: string | null;
  rating: number | null;
  chainStoreId: number | null;
  status: 'pending' | 'active' | 'excluded_no_source' | 'rejected';
}

export interface SourceProfile {
  id: number;
  storeId: number;
  storeName: string;
  sourceType: 'api' | 'web_catalog' | 'flyer' | 'user_only';
  endpointOrUrl: string | null;
  platformHint: string | null;
  priceBasis: 'shelf' | 'online' | 'unknown';
  isConfirmed: boolean;
  lastSuccessAt: string | null;
  failureCount: number;
}
