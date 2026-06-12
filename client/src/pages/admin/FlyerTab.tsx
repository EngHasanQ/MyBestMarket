// رفع مجلة عروض: صورة أو نص OCR → استخراج → قائمة المراجعة (القسم 2.2)

import { useEffect, useState } from 'react';
import { api, fetchKnownBranches, type BranchOption } from '../../api';
import { Button, ErrorBox, inputClass } from '../../components/ui';

export function FlyerTab() {
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<number | null>(null);

  useEffect(() => {
    fetchKnownBranches().then(setBranches);
  }, []);

  const submit = async () => {
    if (!branchId || (!file && !ocrText.trim())) return;
    setBusy(true);
    setError('');
    setDone(null);
    try {
      const res = await api.admin.uploadFlyer({
        branchId,
        image: file,
        ocrText: ocrText.trim() || undefined,
        offerEndsAt: endsAt || undefined,
      });
      setDone(res.extracted);
      setFile(null);
      setOcrText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الرفع');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex max-w-md flex-col gap-4">
      <p className="text-sm text-gray-500">
        ارفع صورة صفحة من مجلة العروض (أو ألصق نص OCR مباشرة). تذهب المستخرجات لقائمة المراجعة
        ولا تُنشر إلا بعد اعتمادك.
      </p>

      <select
        data-testid="flyer-branch-select"
        className={inputClass}
        value={branchId ?? ''}
        onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">اختر الفرع…</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.label}
          </option>
        ))}
      </select>

      <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-gray-300 bg-white text-gray-400">
        <span className="text-2xl">📰</span>
        <span className="text-xs">{file ? file.name : 'صورة المجلة (اختياري)'}</span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>

      <textarea
        data-testid="flyer-text-input"
        rows={6}
        placeholder="أو ألصق نص OCR هنا… (سطر لكل منتج: الاسم ثم السعر)"
        className={`${inputClass} font-mono text-xs`}
        value={ocrText}
        onChange={(e) => setOcrText(e.target.value)}
      />

      <label className="block">
        <span className="mb-1 block text-sm text-gray-600">تاريخ انتهاء العروض</span>
        <input type="date" className={inputClass} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
      </label>

      {error && <ErrorBox message={error} />}
      {done != null && (
        <div className="rounded-xl bg-primary-light p-3 text-sm font-bold text-primary">
          ✓ استُخرج {done} عنصراً وأُضيف لقائمة المراجعة
        </div>
      )}

      <Button onClick={submit} disabled={busy || !branchId || (!file && !ocrText.trim())} testId="flyer-submit" full>
        {busy ? 'جارٍ التحليل…' : 'ارفع وحلّل'}
      </Button>
    </div>
  );
}
