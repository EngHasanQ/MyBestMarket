import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import type { City, PriceAlert } from '../types';
import { priceLabel } from '../lib/format';
import { Button, PageTitle } from '../components/ui';

export default function AccountPage() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [cities, setCities] = useState<City[]>([]);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.cities().then(setCities).catch(() => undefined);
    api.alerts().then(setAlerts).catch(() => undefined);
  }, []);

  if (!user) return null;

  const update = async (patch: { cityId?: number; shoppingDay?: number }) => {
    const updated = await api.updateMe(patch);
    setUser(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="pb-6">
      <PageTitle>حسابي</PageTitle>

      <div className="mx-4 rounded-2xl bg-white p-4 shadow-sm">
        <p className="font-bold text-gray-900">{user.name}</p>
        <p className="text-sm text-gray-400" dir="ltr">
          {user.email}
        </p>
      </div>

      <div className="mx-4 mt-3 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">المدينة</span>
          <select
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            value={user.cityId ?? ''}
            onChange={(e) => void update({ cityId: Number(e.target.value) })}
          >
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameAr}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">يوم التسوق الشهري</span>
          <select
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            value={user.shoppingDay ?? 4}
            onChange={(e) => void update({ shoppingDay: Number(e.target.value) })}
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                يوم {d}
              </option>
            ))}
          </select>
        </label>
        {saved && <p className="text-xs font-bold text-primary">✓ حُفظ</p>}
      </div>

      {alerts.length > 0 && (
        <div className="mx-4 mt-3 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-bold text-gray-900">🔔 تنبيهات الأسعار</h2>
          {alerts.map((a) => (
            <div key={a.id} className="flex items-center justify-between border-b border-gray-50 py-2 last:border-0">
              <Link to={`/product/${a.productId}`} className="text-sm text-gray-700">
                {a.productName}
              </Link>
              <div className="flex items-center gap-2">
                {a.targetPrice && (
                  <span className="price-mono text-xs text-gray-400">{priceLabel(a.targetPrice)}</span>
                )}
                <button
                  onClick={() =>
                    api.deleteAlert(a.id).then(() => setAlerts((x) => x.filter((y) => y.id !== a.id)))
                  }
                  className="text-gray-300"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {user.role === 'admin' && (
        <div className="mx-4 mt-3">
          <Link
            to="/admin"
            className="block rounded-2xl border border-primary bg-primary-light p-4 text-center font-bold text-primary"
          >
            ⚙️ لوحة الإدارة
          </Link>
        </div>
      )}

      <div className="mx-4 mt-6">
        <Button
          variant="danger"
          full
          onClick={() => {
            void logout().then(() => navigate('/login'));
          }}
        >
          تسجيل الخروج
        </Button>
      </div>
    </div>
  );
}
