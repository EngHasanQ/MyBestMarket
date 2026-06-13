// اكتشاف المتاجر وتأهيل المصادر (القسم 13 من الملحق)

import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { City, DiscoveredPlace, SourceProfile } from '../../types';
import { Button, inputClass } from '../../components/ui';

const statusLabel: Record<DiscoveredPlace['status'], { text: string; cls: string }> = {
  pending: { text: 'بانتظار التأهيل', cls: 'bg-amber-light text-amber' },
  active: { text: 'نشط', cls: 'bg-primary-light text-primary' },
  excluded_no_source: { text: 'مستبعد — لا مصدر', cls: 'bg-gray-100 text-gray-500' },
  rejected: { text: 'مرفوض', cls: 'bg-red-50 text-red-600' },
};

export function DiscoveryTab() {
  const [cities, setCities] = useState<City[]>([]);
  const [cityId, setCityId] = useState<number | null>(null);
  const [places, setPlaces] = useState<DiscoveredPlace[]>([]);
  const [profiles, setProfiles] = useState<SourceProfile[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = () => {
    api.admin.discoveredPlaces().then(setPlaces).catch(() => undefined);
    api.admin.sourceProfiles().then(setProfiles).catch(() => undefined);
  };
  useEffect(() => {
    api.cities().then(setCities).catch(() => undefined);
    load();
  }, []);

  const runDiscovery = async () => {
    if (!cityId) return;
    setBusy(true);
    setMessage('');
    try {
      const stats = (await api.admin.runDiscovery(cityId)) as { placesFound: number; chains: number };
      setMessage(`اكتُشف ${stats.placesFound} مكاناً في ${stats.chains} سلسلة`);
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'فشل الاكتشاف (هل مفتاح Google مضبوط؟)');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-card p-4 shadow-sm">
        <h2 className="mb-2 font-bold text-gray-900">تشغيل الاكتشاف</h2>
        <p className="mb-3 text-xs text-gray-500">
          يبحث عبر Google Places في شبكة تغطي المدينة — يُشغَّل شهرياً تلقائياً، والاستدعاء هنا يدوي.
        </p>
        <div className="flex gap-2">
          <select className={inputClass} value={cityId ?? ''} onChange={(e) => setCityId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">المدينة…</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameAr}
              </option>
            ))}
          </select>
          <Button onClick={runDiscovery} disabled={!cityId || busy}>
            {busy ? '...' : 'اكتشف'}
          </Button>
        </div>
        {message && <p className="mt-2 text-sm font-medium text-primary">{message}</p>}
      </div>

      <div className="rounded-2xl bg-card p-4 shadow-sm">
        <h2 className="mb-3 font-bold text-gray-900">ملفات المصادر</h2>
        <div className="flex flex-col gap-2">
          {profiles.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-xl border border-gray-50 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {p.storeName}
                  <span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-500" dir="ltr">
                    {p.sourceType}
                  </span>
                  {p.failureCount >= 3 && <span className="mr-1 text-xs text-red-500">متعطل</span>}
                </p>
                <p className="text-[10px] text-gray-400" dir="ltr">
                  {p.endpointOrUrl ?? '—'}
                </p>
              </div>
              {p.isConfirmed ? (
                <span className="text-xs font-bold text-primary">مؤكد</span>
              ) : (
                <button
                  onClick={() => api.admin.confirmSource(p.id).then(load)}
                  className="btn-primary rounded-lg px-3 py-1.5 text-xs font-bold"
                >
                  تأكيد وتفعيل
                </button>
              )}
            </div>
          ))}
          {profiles.length === 0 && <p className="text-sm text-gray-400">لا ملفات مصادر بعد</p>}
        </div>
      </div>

      <div className="rounded-2xl bg-card p-4 shadow-sm">
        <h2 className="mb-3 font-bold text-gray-900">الأماكن المكتشفة</h2>
        <div className="flex flex-col gap-2">
          {places.map((p) => (
            <div key={p.placeId} className="flex items-center justify-between rounded-xl border border-gray-50 px-3 py-2">
              <div>
                <p className="text-sm text-gray-900">{p.name}</p>
                <p className="text-[10px] text-gray-400" dir="ltr">
                  {p.website ?? 'بلا موقع'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusLabel[p.status].cls}`}>
                  {statusLabel[p.status].text}
                </span>
                {p.status === 'excluded_no_source' && (
                  <button
                    onClick={() => api.admin.promotePlace(p.placeId).then(load)}
                    className="rounded-lg bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-600"
                  >
                    ترقية
                  </button>
                )}
              </div>
            </div>
          ))}
          {places.length === 0 && <p className="text-sm text-gray-400">شغّل الاكتشاف لرؤية النتائج</p>}
        </div>
      </div>
    </div>
  );
}
