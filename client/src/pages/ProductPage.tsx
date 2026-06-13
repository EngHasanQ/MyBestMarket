import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Bell, Check, FileSearch, Lightbulb, Plus, Store } from 'lucide-react';
import { api, getOrCreateDraftList } from '../api';
import { useAuth } from '../context/AuthContext';
import type { Comparison, ProductDetail } from '../types';
import { priceLabel, sizeLabel } from '../lib/format';
import {
  EstimatedBadge,
  FreshnessBadge,
  OfferBadge,
  OnlineBasisNote,
} from '../components/PriceBadges';
import { ProductImage } from '../components/ProductImage';
import { EvidenceSheet } from '../components/EvidenceSheet';
import { EmptyState, SkeletonRows, useToast } from '../components/ui';

export default function ProductPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [addedBranch, setAddedBranch] = useState<number | null>(null);
  const [alerted, setAlerted] = useState(false);
  const [evidenceFor, setEvidenceFor] = useState<Comparison | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!user?.cityId || !id) return;
    api.product(Number(id), user.cityId).then(setDetail).catch(() => undefined);
  }, [id, user?.cityId]);

  if (!detail) {
    return (
      <div className="pt-4">
        <SkeletonRows count={5} height={96} />
      </div>
    );
  }
  const { product, comparisons, bestTime } = detail;

  const addFrom = async (branchId: number) => {
    const list = await getOrCreateDraftList();
    await api.addListItem(list.id, { productId: product.id, quantity: 1, branchId });
    setAddedBranch(branchId);
    toast.show('أُضيف من هذا المتجر');
    setTimeout(() => setAddedBranch(null), 1800);
  };

  const createAlert = async () => {
    await api.createAlert({ productId: product.id });
    setAlerted(true);
    toast.show('سننبهك عند انخفاض السعر');
  };

  return (
    <div className="pb-4">
      <div className="bg-surface px-4 pb-4 pt-4">
        <div className="flex gap-3">
          <div className="w-24 shrink-0">
            <ProductImage
              src={product.imageUrl}
              alt={product.nameAr}
              categorySlug={product.categorySlug}
              thumb={false}
            />
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between gap-2">
              <h1 className="t-section text-ink">{product.nameAr}</h1>
              <button
                onClick={createAlert}
                aria-label="نبهني عند انخفاض السعر"
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                  alerted ? 'bg-primary-light text-primary' : 'text-ink-2 active:bg-gray-100'
                }`}
              >
                <Bell size={20} strokeWidth={1.8} />
              </button>
            </div>
            <p className="t-caption mt-1">
              {[product.brand, sizeLabel(product.sizeValue, product.sizeUnit)]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
      </div>

      {bestTime && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-(--radius-card) bg-primary-light p-3 text-sm font-medium text-primary">
          <Lightbulb size={18} strokeWidth={1.8} className="mt-0.5 shrink-0" />
          {bestTime.labelAr}
        </div>
      )}

      <h2 className="t-section px-4 pb-2 pt-5 text-ink">
        الأسعار في مدينتك <span className="t-caption font-normal">(الأرخص أولاً)</span>
      </h2>

      {comparisons.length === 0 ? (
        <EmptyState icon={Store} text="لا تتوفر أسعار لهذا المنتج في مدينتك بعد" />
      ) : (
        <div className="flex flex-col gap-2 px-4">
          {comparisons.map((c, i) => (
            <div
              key={c.branchId}
              data-testid="comparison-row"
              className={`card p-4 ${i === 0 ? 'glow-teal border-primary' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="t-card font-bold text-ink">
                    {c.branch?.storeName}
                    {i === 0 && (
                      <span className="mr-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-app">
                        الأرخص
                      </span>
                    )}
                  </p>
                  <p className="t-caption mt-0.5">{c.branch?.nameAr}</p>
                </div>
                <p className="price-mono text-lg font-semibold">{priceLabel(c.price)}</p>
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

              <div className="mt-3 flex gap-2">
                <button
                  data-testid="evidence-button"
                  onClick={() => setEvidenceFor(c)}
                  className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-(--radius-btn) border border-primary text-sm font-bold text-primary active:bg-primary-light"
                >
                  <FileSearch size={16} strokeWidth={2} />
                  إثبات السعر
                </button>
                <button
                  data-testid="add-from-branch"
                  onClick={() => void addFrom(c.branchId)}
                  className={`flex h-10 flex-1 items-center justify-center gap-1.5 rounded-(--radius-btn) text-sm font-bold ${
                    addedBranch === c.branchId
                      ? 'bg-primary-light text-primary'
                      : 'border border-primary text-primary active:bg-primary-light'
                  }`}
                >
                  {addedBranch === c.branchId ? (
                    <>
                      <Check size={16} strokeWidth={2.5} /> أُضيف
                    </>
                  ) : (
                    <>
                      <Plus size={16} strokeWidth={2.5} /> أضف من هنا
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {evidenceFor && <EvidenceSheet comparison={evidenceFor} onClose={() => setEvidenceFor(null)} />}
    </div>
  );
}
