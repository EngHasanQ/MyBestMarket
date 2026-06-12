// تصوير الفاتورة: OCR → مطابقة → توثيق أسعار رف بثقة 99 (القسم 14.3)

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, fetchKnownBranches, type BranchOption } from '../api';
import type { Product, ReceiptResult, ReceiptUnmatchedLine } from '../types';
import { useAuth } from '../context/AuthContext';
import { priceLabel } from '../lib/format';
import { Button, ErrorBox, PageTitle, Spinner, inputClass } from '../components/ui';

export default function ReceiptPage() {
  const { branchId: branchParam } = useParams();
  const { user } = useAuth();
  const [branches, setBranches] = useState<BranchOption[] | null>(null);
  const [branchId, setBranchId] = useState<number | null>(branchParam ? Number(branchParam) : null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ReceiptResult | null>(null);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchKnownBranches().then(setBranches);
  }, []);

  const upload = async () => {
    if (!branchId || !file) return;
    setBusy(true);
    setError('');
    try {
      setResult(await api.uploadReceipt(branchId, file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحليل الفاتورة');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-md pb-10">
      <PageTitle>📸 توثيق فاتورة</PageTitle>

      {!result && (
        <div className="flex flex-col gap-4 px-4">
          <p className="text-sm text-gray-500">
            صوّر فاتورتك وسنوثّق كل أسعارها كأسعار رف مؤكدة — فاتورة واحدة قد توثّق ٣٠ سعراً.
          </p>
          <select
            className={inputClass}
            value={branchId ?? ''}
            onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">اختر الفرع…</option>
            {(branches ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
          <label className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 bg-white text-gray-400">
            <span className="text-3xl">📷</span>
            <span className="text-sm">{file ? file.name : 'التقط صورة الفاتورة'}</span>
            <input
              data-testid="receipt-upload"
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {error && <ErrorBox message={error} />}
          <Button onClick={upload} disabled={!branchId || !file || busy} full>
            {busy ? 'جارٍ التحليل… قد يستغرق دقيقة' : 'حلّل الفاتورة'}
          </Button>
          {busy && <Spinner />}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-4 px-4">
          <div className="rounded-2xl bg-primary-light p-4 text-center">
            <p className="text-lg font-extrabold text-primary">
              تم توثيق {result.matched.length + confirmed.size} سعراً ✓
            </p>
            {result.qrVerified === false && (
              <p className="mt-1 text-xs text-amber">⚠️ تعذر التحقق من رمز ZATCA</p>
            )}
          </div>

          {result.matched.map((m) => (
            <div
              key={m.line}
              data-testid="receipt-matched-line"
              className="flex items-center justify-between rounded-xl border border-primary-light bg-white px-3 py-2.5"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{m.productName}</p>
                <p className="text-[11px] text-gray-400">{m.line}</p>
              </div>
              <span className="price-mono text-sm font-bold text-primary">{priceLabel(m.price)}</span>
            </div>
          ))}

          {result.unmatched.length > 0 && (
            <>
              <h2 className="font-bold text-gray-900">أسطر تحتاج تأكيدك</h2>
              {result.unmatched
                .filter((u) => !confirmed.has(u.line))
                .map((u) => (
                  <UnmatchedLine
                    key={u.line}
                    line={u}
                    branchId={branchId!}
                    cityId={user?.cityId ?? 0}
                    onConfirmed={() => setConfirmed((s) => new Set(s).add(u.line))}
                  />
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function UnmatchedLine({
  line,
  branchId,
  cityId,
  onConfirmed,
}: {
  line: ReceiptUnmatchedLine;
  branchId: number;
  cityId: number;
  onConfirmed: () => void;
}) {
  const [q, setQ] = useState('');
  const [options, setOptions] = useState<Product[]>([]);

  useEffect(() => {
    if (q.length < 2) return setOptions([]);
    const t = setTimeout(() => {
      api.products({ cityId, q, limit: 5 }).then(setOptions).catch(() => undefined);
    }, 300);
    return () => clearTimeout(t);
  }, [q, cityId]);

  const confirm = async (productId: number) => {
    await api.confirmReceiptLine({ branchId, productId, rawName: line.productName, price: line.price });
    onConfirmed();
  };

  return (
    <div data-testid="receipt-unmatched-line" className="rounded-xl border border-amber-light bg-white p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-900">{line.productName}</p>
        <span className="price-mono text-sm font-bold">{priceLabel(line.price)}</span>
      </div>
      <input
        className={`${inputClass} mt-2`}
        placeholder="هل هذا المنتج هو…؟ ابحث"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {options.map((o) => (
        <button
          key={o.id}
          data-testid="confirm-line"
          onClick={() => confirm(o.id)}
          className="mt-1.5 block w-full rounded-lg bg-gray-50 px-3 py-2 text-right text-sm text-gray-700 active:bg-primary-light"
        >
          {o.nameAr}
        </button>
      ))}
    </div>
  );
}
