import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, getOrCreateDraftList } from '../api';
import { useAuth } from '../context/AuthContext';
import type { ProductDetail } from '../types';
import { priceLabel, sizeLabel } from '../lib/format';
import {
  EstimatedBadge,
  FreshnessBadge,
  OfferBadge,
  OnlineBasisNote,
} from '../components/PriceBadges';
import { EmptyState, Spinner } from '../components/ui';

export default function ProductPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [addedBranch, setAddedBranch] = useState<number | null>(null);
  const [alerted, setAlerted] = useState(false);

  useEffect(() => {
    if (!user?.cityId || !id) return;
    api.product(Number(id), user.cityId).then(setDetail).catch(() => undefined);
  }, [id, user?.cityId]);

  if (!detail) return <Spinner />;
  const { product, comparisons, bestTime } = detail;

  const addFrom = async (branchId: number) => {
    const list = await getOrCreateDraftList();
    await api.addListItem(list.id, { productId: product.id, quantity: 1, branchId });
    setAddedBranch(branchId);
    setTimeout(() => setAddedBranch(null), 1800);
  };

  const createAlert = async () => {
    await api.createAlert({ productId: product.id });
    setAlerted(true);
  };

  return (
    <div className="pb-4">
      <div className="bg-white px-4 pb-4 pt-5">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h1 className="text-lg font-bold leading-6 text-gray-900">{product.nameAr}</h1>
          <button
            onClick={createAlert}
            className={`text-xl ${alerted ? 'opacity-100' : 'opacity-40'}`}
            title="نبهني عند انخفاض السعر"
          >
            🔔
          </button>
        </div>
        <p className="text-xs text-gray-400">
          {[product.brand, sizeLabel(product.sizeValue, product.sizeUnit)].filter(Boolean).join(' · ')}
        </p>
      </div>

      {bestTime && (
        <div className="mx-4 mt-3 rounded-2xl bg-primary-light p-3 text-sm font-medium text-primary">
          💡 {bestTime.labelAr}
        </div>
      )}

      <h2 className="px-4 pb-2 pt-5 font-bold text-gray-900">
        الأسعار في مدينتك <span className="text-xs font-normal text-gray-400">(الأرخص أولاً)</span>
      </h2>

      {comparisons.length === 0 ? (
        <EmptyState icon="🏪" text="لا تتوفر أسعار لهذا المنتج في مدينتك بعد" />
      ) : (
        <div className="flex flex-col gap-2 px-4">
          {comparisons.map((c, i) => (
            <div
              key={c.branchId}
              data-testid="comparison-row"
              className={`rounded-2xl border bg-white p-3 ${
                i === 0 ? 'border-primary shadow-sm' : 'border-gray-100'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-gray-900">
                    {c.branch?.storeName}
                    {i === 0 && (
                      <span className="mr-2 rounded-full bg-primary px-2 py-0.5 text-[10px] text-white">
                        الأرخص
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-400">{c.branch?.nameAr}</p>
                </div>
                <div className="text-left">
                  <p className="price-mono text-lg font-bold text-primary">{priceLabel(c.price)}</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <FreshnessBadge label={c.freshnessLabel} confidence={c.confidence} stale={c.stale} />
                {c.isOffer && <OfferBadge endsAt={c.offerEndsAt} />}
                {c.estimated && <EstimatedBadge />}
              </div>
              {c.basis === 'online' && !c.estimated && (
                <div className="mt-1">
                  <OnlineBasisNote />
                </div>
              )}
              <button
                data-testid="add-from-branch"
                onClick={() => addFrom(c.branchId)}
                className={`mt-2 w-full rounded-xl py-2 text-sm font-bold ${
                  addedBranch === c.branchId
                    ? 'bg-primary-light text-primary'
                    : 'border border-primary text-primary active:bg-primary-light'
                }`}
              >
                {addedBranch === c.branchId ? '✓ أُضيف' : 'أضف للسلة من هذا المتجر'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
