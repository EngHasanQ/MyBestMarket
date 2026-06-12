import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Product } from '../types';
import { api, getOrCreateDraftList } from '../api';
import { priceLabel, sizeLabel } from '../lib/format';
import { EstimatedBadge, FreshnessBadge, OfferBadge } from './PriceBadges';

export function ProductCard({ product }: { product: Product }) {
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    try {
      const list = await getOrCreateDraftList();
      await api.addListItem(list.id, { productId: product.id, quantity: 1 });
      setAdded(true);
      setTimeout(() => setAdded(false), 1800);
    } catch {
      /* تجاهل — المستخدم سيعيد المحاولة */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="product-card"
      className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm"
    >
      <Link to={`/product/${product.id}`} className="flex-1">
        <div className="mb-1 flex h-14 items-center justify-center text-3xl">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt="" className="h-14 object-contain" />
          ) : (
            '🛒'
          )}
        </div>
        <p className="line-clamp-2 text-sm font-medium leading-5 text-gray-900">{product.nameAr}</p>
        <p className="mt-0.5 text-[11px] text-gray-400">
          {[product.brand, sizeLabel(product.sizeValue, product.sizeUnit)].filter(Boolean).join(' · ')}
        </p>
      </Link>
      {product.cheapest ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span data-testid="product-price" className="price-mono text-base font-bold text-primary">
            {priceLabel(product.cheapest.price)}
          </span>
          {product.cheapest.isOffer && <OfferBadge />}
          {product.cheapest.estimated && <EstimatedBadge />}
        </div>
      ) : (
        <p className="text-xs text-gray-400">لا يتوفر سعر بعد</p>
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
        className={`mt-1 rounded-xl py-2 text-sm font-bold transition-colors ${
          added ? 'bg-primary-light text-primary' : 'bg-primary text-white active:bg-primary-dark'
        }`}
      >
        {added ? '✓ أُضيف' : 'أضف للقائمة'}
      </button>
    </div>
  );
}
