// واجهة محوّل المتجر الموحّدة (القسم 2.1 + سبرنت v2 جزء 1.1)

export interface RawProduct {
  rawName: string;
  brand?: string | null;
  barcode?: string | null;
  price: number;
  imageUrl?: string | null;
  // رابط صفحة المنتج في موقع المتجر — إثبات المصدر المعروض للمستخدم
  productUrl?: string | null;
  // مسار تصنيف المتجر ("ألبان > حليب طازج") — يُربط بتصنيفنا عبر category_mappings
  storeCategoryPath?: string | null;
  // أساس السعر: مواقع التوصيل غالباً أعلى من الرف (القسم 14.2)
  basis: 'shelf' | 'online' | 'unknown';
}

export interface RawOffer extends RawProduct {
  offerEndsAt: Date | null;
}

export interface StoreAdapter {
  storeSlug: string;
  supportsCity(cityCode: string): Promise<boolean>;
  /** الكتالوج الكامل: كل التصنيفات وكل الصفحات — لا عيّنة */
  fetchCatalog(cityCode: string): Promise<RawProduct[]>;
  fetchOffers(cityCode: string): Promise<RawOffer[]>;
  /** شجرة تصنيفات المتجر (مسارات نصية) — لتقرير التغطية وربط التصنيفات */
  fetchCategoryTree?(): Promise<string[]>;
}
