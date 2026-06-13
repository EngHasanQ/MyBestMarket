import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import type { City } from '../types';
import { Building2, LocateFixed } from 'lucide-react';
import { Button, ErrorBox, Spinner, inputClass } from '../components/ui';

export default function SelectCity() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [cities, setCities] = useState<City[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<number | null>(user?.cityId ?? null);
  const [shoppingDay, setShoppingDay] = useState(user?.shoppingDay ?? 4);
  const [busy, setBusy] = useState(false);
  const [geoError, setGeoError] = useState('');

  useEffect(() => {
    api
      .cities()
      .then(setCities)
      .catch(() => {
        setCities([]);
        setLoadError(true);
      });
  }, []);

  // تحديد الموقع اختيارياً → أقرب مدينة (يتطلب HTTPS وإذن المستخدم)
  const locate = () => {
    setGeoError('');
    if (!cities || cities.length === 0) return;
    if (!navigator.geolocation) {
      setGeoError('متصفحك لا يدعم تحديد الموقع — اختر مدينتك يدوياً من القائمة');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        let best: City | null = null;
        let bestD = Infinity;
        for (const c of cities) {
          const d = (c.lat - latitude) ** 2 + (c.lng - longitude) ** 2;
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        if (best) setSelected(best.id);
      },
      () => setGeoError('تعذر تحديد موقعك (الإذن مرفوض أو الخدمة معطلة) — اختر مدينتك يدوياً'),
      { timeout: 8000 },
    );
  };

  const save = async () => {
    if (selected == null) return;
    setBusy(true);
    try {
      const updated = await api.updateMe({ cityId: selected, shoppingDay });
      setUser(updated);
      navigate('/', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  if (!cities) return <Spinner />;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
      <h1 className="text-2xl font-extrabold text-gray-900">اختر مدينتك</h1>
      <p className="mb-5 mt-1 text-sm text-gray-500">
        كل الأسعار والمقارنات تكون داخل مدينتك فقط
      </p>

      {cities.length === 0 ? (
        <ErrorBox
          message={
            loadError
              ? 'تعذر الاتصال بالخادم — حاول مرة أخرى لاحقاً'
              : 'لا توجد مدن متاحة بعد — قاعدة البيانات لم تُهيأ. أعد نشر التطبيق أو شغّل أمر البذر (npm run seed) ثم حدّث الصفحة.'
          }
        />
      ) : (
        <>
          {/* القائمة المنسدلة الرئيسة: كل مدن المملكة */}
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              المدينة ({cities.length} مدينة)
            </span>
            <select
              data-testid="city-select"
              className={inputClass}
              value={selected ?? ''}
              onChange={(e) => setSelected(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">اختر مدينتك…</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameAr}
                </option>
              ))}
            </select>
          </label>

          <button onClick={locate} className="mt-3 flex min-h-11 items-center gap-1.5 text-sm font-bold text-primary">
            <LocateFixed size={17} strokeWidth={2} /> أو حدد موقعي تلقائياً
          </button>
          {geoError && <p className="mt-1 text-xs text-amber">{geoError}</p>}

          {/* اختيار سريع لأكبر المدن */}
          <p className="mt-5 text-xs font-medium text-gray-400">اختيار سريع</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {cities.slice(0, 6).map((c) => (
              <button
                key={c.id}
                data-testid="city-card"
                onClick={() => setSelected(c.id)}
                className={`rounded-2xl border-2 px-2 py-3 text-center text-sm transition-colors ${
                  selected === c.id
                    ? 'border-primary bg-primary-light font-bold text-primary'
                    : 'border-white/8 bg-card text-ink'
                }`}
              >
                <Building2 size={20} strokeWidth={1.6} className="mx-auto mb-1" />
                {c.nameAr}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mt-8">
        <h2 className="font-bold text-gray-900">يوم التسوق الشهري</h2>
        <p className="mb-3 mt-1 text-xs text-gray-500">
          نجهّز قائمتك الشهرية قبله بثلاثة أيام
        </p>
        <select
          className={inputClass}
          value={shoppingDay}
          onChange={(e) => setShoppingDay(Number(e.target.value))}
        >
          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              يوم {d} من كل شهر
            </option>
          ))}
        </select>
      </div>

      <div className="mt-auto pt-8">
        <Button onClick={save} disabled={selected == null || busy} full>
          {busy ? '...' : 'متابعة'}
        </Button>
      </div>
    </div>
  );
}
