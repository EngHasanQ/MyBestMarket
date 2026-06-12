// لوحة جودة البيانات: مؤشر الدقة لكل مدينة + SLA المراجعة (القسمان 5-E و14.5)

import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { AdminDashboard } from '../../types';
import { Spinner } from '../../components/ui';

export function DashboardTab() {
  const [data, setData] = useState<AdminDashboard | null>(null);

  useEffect(() => {
    api.admin.dashboard().then(setData).catch(() => undefined);
  }, []);

  if (!data) return <Spinner />;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
          <p data-testid="kpi-ratio" className="price-mono text-2xl font-extrabold text-primary">
            {data.kpi.ratio}%
          </p>
          <p className="mt-1 text-[11px] text-gray-500">أسعار موثقة وحديثة (≥90 و≤7 أيام)</p>
        </div>
        <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
          <p className="price-mono text-2xl font-extrabold text-gray-900">{data.kpi.displayed}</p>
          <p className="mt-1 text-[11px] text-gray-500">سعر معروض</p>
        </div>
        <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
          <p
            className={`price-mono text-2xl font-extrabold ${
              data.reviewQueue.overdue > 0 ? 'text-amber' : 'text-gray-900'
            }`}
          >
            {data.reviewQueue.total}
          </p>
          <p className="mt-1 text-[11px] text-gray-500">بانتظار المراجعة</p>
        </div>
      </div>

      {data.reviewQueue.overdue > 0 && (
        <div className="rounded-xl bg-amber-light p-3 text-sm font-bold text-amber">
          ⚠️ {data.reviewQueue.overdue} عرض بانتظار المراجعة منذ أمس
        </div>
      )}

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-bold text-gray-900">الدقة حسب المدينة</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right text-xs text-gray-400">
              <th className="pb-2 font-normal">المدينة</th>
              <th className="pb-2 font-normal">معروض</th>
              <th className="pb-2 font-normal">موثق حديث</th>
              <th className="pb-2 font-normal">النسبة</th>
            </tr>
          </thead>
          <tbody>
            {data.perCity.map((c) => (
              <tr key={c.city} className="border-t border-gray-50">
                <td className="py-2 font-medium">{c.city}</td>
                <td className="price-mono py-2">{c.displayed}</td>
                <td className="price-mono py-2">{c.fresh}</td>
                <td className={`price-mono py-2 font-bold ${c.ratio >= 90 ? 'text-primary' : 'text-amber'}`}>
                  {c.ratio}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
