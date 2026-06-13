// بطاقة منتج (3.3): صورة 1:1، اسم بسطرين، شارة حداثة، زر كامل العرض 40px

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Plus } from 'lucide-react';
import type { Product } from '../types';
import { api, getOrCreateDraftList } from '../api';
import { priceLabel, sizeLabel } from '../lib/format';
import { EstimatedBadge, FreshnessBadge, OfferBadge } from './PriceBadges';
import { ProductImage } from './ProductImage';
import { useToast } from './ui';

export function ProductCard({ product }: { product: Product }) {
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const add = async () => {
    setBusy(true);
    try {
      const list = await getOrCreateDraftList();
      await api.addListItem(list.id, { productId: product.id, quantity: 1 });
      setAdded(true);
      toast.show('أُضيف إلى قائمتك');
      setTimeout(() => setAdded(false), 1800);
    } catch {
      toast.show('تعذرت الإضافة — حاول مجدداً', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="product-card" className="card flex flex-col gap-2 p-3">
      <Link to={`/product/${product.id}`} className="flex flex-1 flex-col gap-2">
        <ProductImage
          src={product.imageUrl}
          alt={product.nameAr}
          categorySlug={product.categorySlug}
        />
        <p className="t-card line-clamp-2 min-h-[2.9em] text-ink">{product.nameAr}</p>
        <p className="t-caption">
          {[product.brand, sizeLabel(product.sizeValue, product.sizeUnit)]
            .filter(Boolean)
            .join(' · ') || ' '}
        </p>
      </Link>

      {product.cheapest ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span data-testid="product-price" className="price-mono text-lg font-semibold">
            {priceLabel(product.cheapest.price)}
          </span>
          {product.cheapest.isOffer && <OfferBadge />}
          {product.cheapest.estimated && <EstimatedBadge />}
        </div>
      ) : (
        <p className="t-caption">لا يتوفر سعر بعد</p>
      )}
      {product.cheapest && (
        <FreshnessBadge
          label={product.cheapest.freshnessLabel}
          confidence={product.cheapest.confidence}
          stale={product.cheapest.stale}
        />
      )}

      <button
        data-testid="add-to-list"
        disabled={busy}
        onClick={add}
        className={`flex h-11 items-center justify-center gap-1 rounded-(--radius-btn) text-sm font-bold ${
          added
            ? 'bg-primary-light text-primary'
            : 'glow-teal bg-primary text-app active:bg-primary-dark'
        }`}
      >
        {added ? (
          <>
            <Check size={16} strokeWidth={2.5} /> أُضيف
          </>
        ) : (
          <>
            <Plus size={16} strokeWidth={2.5} /> أضف للقائمة
          </>
        )}
      </button>
    </div>
  );
}
