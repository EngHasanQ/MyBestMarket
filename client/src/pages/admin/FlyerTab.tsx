// رفع مجلة عروض: صورة أو نص OCR → استخراج → قائمة المراجعة (القسم 2.2)

import { useEffect, useState } from 'react';
import { api, fetchKnownBranches, type BranchOption } from '../../api';
import { Button, ErrorBox, inputClass } from '../../components/ui';
import type { FlyerJobProgress } from '../../types';

export function FlyerTab() {
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<number | null>(null);
  // مجلة PDF: ملف + تقدّم المعالجة + نتيجة الاعتماد الجماعي
  const [pdf, setPdf] = useState<File | null>(null);
  const [progress, setProgress] = useState<FlyerJobProgress | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [approveResult, setApproveResult] =
    useState<{ approved: number; evidenceCreated: number } | null>(null);

  useEffect(() => {
    fetchKnownBranches().then(setBranches);
  }, []);

  const uploadPdf = async () => {
    if (!branchId || !pdf) return;
    setPdfBusy(true);
    setError('');
    setProgress(null);
    setApproveResult(null);
    try {
      const { jobId } = await api.admin.uploadFlyerPdf({ branchId, pdf });
      // استطلاع التقدّم حتى الاكتمال أو الفشل
      for (;;) {
        await new Promise((r) => setTimeout(r, 1200));
        const p = await api.admin.flyerJob(jobId);
        setProgress(p);
        if (p.status !== 'running') break;
      }
      setPdf(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذرت معالجة المجلة');
    } finally {
      setPdfBusy(false);
    }
  };

  const approveAll = async () => {
    if (!branchId) return;
    setPdfBusy(true);
    try {
      const r = await api.admin.approveAll(branchId);
      setApproveResult({ approved: r.approved, evidenceCreated: r.evidenceCreated });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الاعتماد الجماعي');
    } finally {
      setPdfBusy(false);
    }
  };

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

      <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-gray-300 bg-card text-gray-400">
        <span className="text-xs font-bold text-gray-400">صورة المجلة</span>
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
          استُخرج {done} عنصراً وأُضيف لقائمة المراجعة
        </div>
      )}

      <Button onClick={submit} disabled={busy || !branchId || (!file && !ocrText.trim())} testId="flyer-submit" full>
        {busy ? 'جارٍ التحليل…' : 'ارفع وحلّل'}
      </Button>

      {/* ---------- مجلة PDF متعددة الصفحات (A2) ---------- */}
      <div className="mt-2 border-t border-white/8 pt-4">
        <h3 className="t-section mb-1 text-ink">مجلة PDF كاملة</h3>
        <p className="mb-3 text-xs text-gray-500">
          ارفع ملف PDF للمجلة الأسبوعية (عشرات الصفحات). نحوّل كل صفحة لصورة، نقرأ العناصر
          بالـOCR، ونقصّ صورة كل منتج دليلاً للسعر. تابع التقدّم ثم اعتمد الكل أو عدّل عنصراً عنصراً.
        </p>

        <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-gray-300 bg-card text-gray-400">
          <span className="text-xs font-bold text-gray-400">ملف PDF للمجلة</span>
          <span className="text-xs" data-testid="flyer-pdf-name">{pdf ? pdf.name : 'اختر ملف PDF'}</span>
          <input
            data-testid="flyer-pdf-input"
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
          />
        </label>

        <Button
          onClick={uploadPdf}
          disabled={pdfBusy || !branchId || !pdf}
          testId="flyer-pdf-submit"
          full
        >
          {pdfBusy && progress?.status === 'running' ? 'جارٍ المعالجة…' : 'ارفع وحلّل PDF'}
        </Button>

        {progress && (
          <div data-testid="flyer-progress" className="mt-3 rounded-xl bg-card p-3 text-sm">
            <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-elevated">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${progress.pageCount ? Math.round((progress.processed / progress.pageCount) * 100) : 0}%`,
                }}
              />
            </div>
            <p className="text-ink-2">
              الصفحات: {progress.processed}/{progress.pageCount || '…'} — مرشّحون:{' '}
              <span className="font-bold text-ink">{progress.candidates}</span>
              {progress.status === 'success' && (
                <>
                  {' '}
                  — أُضيف للمراجعة{' '}
                  <span className="font-bold text-primary" data-testid="flyer-queued">
                    {progress.queued}
                  </span>{' '}
                  بقصاصات {progress.cropsSaved}
                </>
              )}
            </p>
            {progress.validity?.endsAt && (
              <p className="mt-1 text-xs text-gray-500">
                صلاحية العروض حتى {new Date(progress.validity.endsAt).toLocaleDateString('ar-SA')}
              </p>
            )}
            {progress.status === 'failed' && (
              <p className="mt-1 text-xs text-danger">فشلت المعالجة — {progress.error}</p>
            )}
          </div>
        )}

        {progress?.status === 'success' && progress.queued > 0 && (
          <div className="mt-3">
            <Button onClick={approveAll} disabled={pdfBusy} testId="flyer-approve-all" full>
              اعتمد كل المرشّحين ({progress.queued})
            </Button>
          </div>
        )}

        {approveResult && (
          <div
            data-testid="flyer-approve-result"
            className="mt-3 rounded-xl bg-primary-light p-3 text-sm font-bold text-primary"
          >
            اعتُمد {approveResult.approved} سعراً بأدلّة {approveResult.evidenceCreated}
          </div>
        )}
      </div>
    </div>
  );
}
