// طبقة الاتصال بالخادم — جميع الطلبات عبر /api مع كوكي الجلسة

import type {
  AdminDashboard,
  AdminJobs,
  AdminStore,
  AppNotification,
  Category,
  City,
  DiscoveredPlace,
  FinishResult,
  FlyerJobProgress,
  JobRun,
  ListDetail,
  PriceAlert,
  PriceEvidence,
  Product,
  ProductDetail,
  ReceiptResult,
  ReviewItem,
  ShoppingList,
  SourceProfile,
  User,
} from './types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers:
      init?.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json', ...init?.headers }
        : init?.headers,
    ...init,
  });
  if (!res.ok) {
    let message = 'حدث خطأ غير متوقع';
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* تجاهل */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined });
const patch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
const del = <T>(path: string) => request<T>(path, { method: 'DELETE' });

// ---------- المصادقة ----------
export const api = {
  register: (body: {
    email: string;
    password: string;
    name: string;
    cityId?: number;
    shoppingDay?: number;
  }) => post<User>('/auth/register', body),
  login: (body: { email: string; password: string }) => post<User>('/auth/login', body),
  logout: () => post<{ ok: boolean }>('/auth/logout'),
  me: () => get<User>('/auth/me'),
  updateMe: (body: { cityId?: number; shoppingDay?: number; name?: string }) =>
    patch<User>('/auth/me', body),

  // ---------- الكتالوج ----------
  cities: () => get<City[]>('/cities'),
  categories: () => get<Category[]>('/categories'),
  products: (params: {
    cityId: number;
    categoryId?: number;
    q?: string;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    qs.set('cityId', String(params.cityId));
    if (params.categoryId) qs.set('categoryId', String(params.categoryId));
    if (params.q) qs.set('q', params.q);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    return get<Product[]>(`/products?${qs.toString()}`);
  },
  product: (id: number, cityId: number) => get<ProductDetail>(`/products/${id}?cityId=${cityId}`),

  // ---------- القوائم ----------
  lists: () => get<ShoppingList[]>('/lists'),
  createList: (title: string) => post<ShoppingList>('/lists', { title }),
  list: (id: number) => get<ListDetail>(`/lists/${id}`),
  addListItem: (listId: number, body: { productId: number; quantity: number; branchId?: number }) =>
    post<unknown>(`/lists/${listId}/items`, body),
  removeListItem: (listId: number, itemId: number) =>
    del<{ ok: boolean }>(`/lists/${listId}/items/${itemId}`),
  generateMonthly: () => post<ListDetail>('/lists/generate-monthly'),
  setListStatus: (id: number, status: 'draft' | 'active' | 'completed') =>
    patch<ShoppingList>(`/lists/${id}`, { status }),
  checkItem: (listId: number, itemId: number, body: { isPurchased: boolean; actualPrice?: number }) =>
    patch<{ item: unknown; priceReport: unknown }>(`/lists/${listId}/items/${itemId}`, body),
  finishList: (id: number) => post<FinishResult>(`/lists/${id}/finish`),

  // ---------- الأسعار والفواتير ----------
  reportPrice: (body: { productId: number; branchId: number; price: number }) =>
    post<unknown>('/report', body),
  uploadReceipt: (branchId: number, file: File) => {
    const form = new FormData();
    form.append('image', file);
    form.append('branchId', String(branchId));
    return request<ReceiptResult>('/receipt', { method: 'POST', body: form });
  },
  uploadReceiptText: (branchId: number, ocrText: string) =>
    post<ReceiptResult>('/receipt', { branchId, ocrText }),
  confirmReceiptLine: (body: {
    branchId: number;
    productId: number;
    rawName: string;
    price: number;
  }) => post<unknown>('/receipt/confirm-line', body),

  // ---------- إثبات السعر وطلبات المنتجات ----------
  priceEvidence: (priceId: number) => get<PriceEvidence[]>(`/prices/${priceId}/evidence`),
  requestProduct: (query: string) => post<unknown>('/product-requests', { query }),

  // ---------- الإشعارات والتنبيهات ----------
  notifications: () => get<AppNotification[]>('/notifications'),
  markNotificationRead: (id: number) => post<{ ok: boolean }>(`/notifications/${id}/read`),
  alerts: () => get<PriceAlert[]>('/alerts'),
  createAlert: (body: { productId: number; targetPrice?: number }) =>
    post<PriceAlert>('/alerts', body),
  deleteAlert: (id: number) => del<{ ok: boolean }>(`/alerts/${id}`),

  // ---------- الإدارة ----------
  admin: {
    dashboard: () => get<AdminDashboard>('/admin/dashboard'),
    reviewQueue: (status = 'pending') => get<ReviewItem[]>(`/admin/review-queue?status=${status}`),
    approveReview: (id: number, body: { productId?: number; price?: number }) =>
      post<unknown>(`/admin/review-queue/${id}/approve`, body),
    rejectReview: (id: number) => post<unknown>(`/admin/review-queue/${id}/reject`),
    uploadFlyer: (params: {
      branchId: number;
      image?: File | null;
      ocrText?: string;
      offerEndsAt?: string;
    }) => {
      const form = new FormData();
      form.append('branchId', String(params.branchId));
      if (params.image) form.append('image', params.image);
      if (params.ocrText) form.append('ocrText', params.ocrText);
      if (params.offerEndsAt) form.append('offerEndsAt', params.offerEndsAt);
      return request<{ extracted: number; queued: unknown[] }>('/admin/flyers/upload', {
        method: 'POST',
        body: form,
      });
    },
    uploadFlyerPdf: (params: { branchId: number; pdf: File }) => {
      const form = new FormData();
      form.append('branchId', String(params.branchId));
      form.append('pdf', params.pdf);
      return request<{ jobId: string }>('/admin/flyers/upload-pdf', { method: 'POST', body: form });
    },
    flyerJob: (id: string) => get<FlyerJobProgress>(`/admin/flyers/jobs/${id}`),
    approveAll: (branchId: number) =>
      post<{ approved: number; autoCreated: number; evidenceCreated: number; total: number }>(
        `/admin/review-queue/approve-all`,
        { branchId },
      ),
    jobs: () => get<AdminJobs>('/admin/jobs'),
    runJob: (name: string) => post<unknown>(`/admin/jobs/${name}/run`),
    jobRuns: () => get<JobRun[]>('/admin/job-runs'),
    stores: () => get<AdminStore[]>('/admin/stores'),
    createStore: (body: { nameAr: string; slug: string; type?: string }) =>
      post<AdminStore>('/admin/stores', body),
    createBranch: (body: { storeId: number; cityId: number; nameAr: string; address?: string }) =>
      post<{ id: number; nameAr: string }>('/admin/branches', body),
    createProduct: (body: {
      nameAr: string;
      categoryId: number;
      brand?: string;
      sizeValue?: number;
      sizeUnit?: string;
      barcode?: string;
    }) => post<{ id: number; nameAr: string }>('/admin/products', body),
    createPrice: (body: {
      productId: number;
      branchId: number;
      price: number;
      isOffer?: boolean;
      offerEndsAt?: string;
    }) => post<unknown>('/admin/prices', body),
    discoveredPlaces: () => get<DiscoveredPlace[]>('/admin/discovered-places'),
    runDiscovery: (cityId: number) => post<unknown>('/admin/discovery/run', { cityId }),
    sourceProfiles: () => get<SourceProfile[]>('/admin/source-profiles'),
    confirmSource: (id: number) => post<unknown>(`/admin/source-profiles/${id}/confirm`),
    promotePlace: (placeId: string) =>
      post<unknown>(`/admin/discovered-places/${encodeURIComponent(placeId)}/promote`),
  },
};

/**
 * إيجاد قائمة المسودة النشطة أو إنشاء "قائمتي" — تستخدمها أزرار "أضف" في البطاقات.
 */
export async function getOrCreateDraftList(): Promise<ShoppingList> {
  const lists = await api.lists();
  const draft = lists.find((l) => l.status === 'draft');
  if (draft) return draft;
  return api.createList('قائمتي');
}

export interface BranchOption {
  id: number;
  label: string;
}

/**
 * لا يوفر الخادم نقطة GET للفروع — نجمعها من مقارنات أول المنتجات في كل مدينة
 * (يكفي لاختيار فرع لرفع مجلة أو فاتورة).
 */
export async function fetchKnownBranches(): Promise<BranchOption[]> {
  const seen = new Map<number, BranchOption>();
  try {
    const cities = await api.cities();
    for (const city of cities) {
      const products = await api.products({ cityId: city.id, limit: 3 });
      for (const p of products.slice(0, 3)) {
        try {
          const detail = await api.product(p.id, city.id);
          for (const c of detail.comparisons) {
            if (c.branch && !seen.has(c.branch.id)) {
              seen.set(c.branch.id, {
                id: c.branch.id,
                label: `${c.branch.storeName} — ${c.branch.nameAr} (${city.nameAr})`,
              });
            }
          }
        } catch {
          /* تجاهل منتجاً بلا مقارنات */
        }
      }
    }
  } catch {
    /* تجاهل — تُعاد القائمة الجزئية */
  }
  return [...seen.values()].sort((a, b) => a.id - b.id);
}

export function toNumber(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
