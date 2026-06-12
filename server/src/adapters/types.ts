// واجهة محوّل المتجر الموحّدة (القسم 2.1)

export interface RawProduct {
  rawName: string;
  brand?: string | null;
  barcode?: string | null;
  price: number;
  imageUrl?: string | null;
  // أساس السعر: مواقع التوصيل غالباً أعلى من الرف (القسم 14.2)
  basis: 'shelf' | 'online' | 'unknown';
}

export interface RawOffer extends RawProduct {
  offerEndsAt: Date | null;
}

export interface StoreAdapter {
  storeSlug: string;
  supportsCity(cityCode: string): Promise<boolean>;
  fetchCatalog(cityCode: string): Promise<RawProduct[]>;
  fetchOffers(cityCode: string): Promise<RawOffer[]>;
}
