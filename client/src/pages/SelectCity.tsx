import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import type { City } from '../types';
import { Button, Spinner } from '../components/ui';

export default function SelectCity() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [cities, setCities] = useState<City[] | null>(null);
  const [selected, setSelected] = useState<number | null>(user?.cityId ?? null);
  const [shoppingDay, setShoppingDay] = useState(user?.shoppingDay ?? 4);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.cities().then(setCities).catch(() => setCities([]));
  }, []);

  // تحديد الموقع اختيارياً → أقرب مدينة
  const locate = () => {
    if (!navigator.geolocation || !cities) return;
    navigator.geolocation.getCurrentPosition((pos) => {
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
    });
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
      <button onClick={locate} className="mb-4 text-sm font-bold text-primary">
        📍 حدد موقعي تلقائياً
      </button>

      <div className="grid grid-cols-2 gap-3">
        {cities.map((c) => (
          <button
            key={c.id}
            data-testid="city-card"
            onClick={() => setSelected(c.id)}
            className={`rounded-2xl border-2 p-4 text-center transition-colors ${
              selected === c.id
                ? 'border-primary bg-primary-light font-bold text-primary'
                : 'border-gray-200 bg-white text-gray-700'
            }`}
          >
            <span className="mb-1 block text-2xl">🕌</span>
            {c.nameAr}
          </button>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="font-bold text-gray-900">يوم التسوق الشهري</h2>
        <p className="mb-3 mt-1 text-xs text-gray-500">
          نجهّز قائمتك الشهرية قبله بثلاثة أيام
        </p>
        <select
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
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
