// مراقبة الوظائف المجدولة: حالة أحمر/أخضر + تشغيل فوري + سجل job_runs (القسم 15)

import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { AdminJobs, JobRun } from '../../types';
import { formatDateTime } from '../../lib/format';
import { Spinner } from '../../components/ui';

export function JobsTab() {
  const [jobs, setJobs] = useState<AdminJobs | null>(null);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [running, setRunning] = useState<string | null>(null);

  const load = () => {
    api.admin.jobs().then(setJobs).catch(() => undefined);
    api.admin.jobRuns().then(setRuns).catch(() => undefined);
  };
  useEffect(load, []);

  const run = async (name: string) => {
    setRunning(name);
    try {
      await api.admin.runJob(name);
    } finally {
      setRunning(null);
      load();
    }
  };

  if (!jobs) return <Spinner />;
  const lastByJob = new Map(jobs.lastRuns.map((r) => [r.job, r]));

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-bold text-gray-900">الوظائف</h2>
        <div className="flex flex-col gap-2">
          {jobs.jobs.map((name) => {
            const last = lastByJob.get(name);
            return (
              <div key={name} className="flex items-center justify-between rounded-xl border border-gray-50 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      !last ? 'bg-gray-300' : last.status === 'success' ? 'bg-primary' : last.status === 'failed' ? 'bg-red-500' : 'bg-amber'
                    }`}
                  />
                  <div>
                    <p className="font-mono text-sm text-gray-900" dir="ltr">
                      {name}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {last ? `آخر تشغيل: ${formatDateTime(last.started_at)}` : 'لم تُشغّل بعد'}
                    </p>
                  </div>
                </div>
                <button
                  data-testid="run-job"
                  onClick={() => void run(name)}
                  disabled={running != null}
                  className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-700 disabled:opacity-50"
                >
                  {running === name ? '...' : '▶ شغّل الآن'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-bold text-gray-900">آخر التشغيلات</h2>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-right text-gray-400">
              <th className="pb-2 font-normal">الوظيفة</th>
              <th className="pb-2 font-normal">الحالة</th>
              <th className="pb-2 font-normal">داخل/خارج</th>
              <th className="pb-2 font-normal">المدة</th>
              <th className="pb-2 font-normal">الوقت</th>
            </tr>
          </thead>
          <tbody>
            {runs.slice(0, 25).map((r) => (
              <tr key={r.id} className="border-t border-gray-50">
                <td className="py-1.5 font-mono" dir="ltr">{r.job}</td>
                <td className={`py-1.5 font-bold ${r.status === 'success' ? 'text-primary' : 'text-red-500'}`}>
                  {r.status === 'success' ? 'نجح' : r.status === 'failed' ? 'فشل' : 'يعمل'}
                </td>
                <td className="price-mono py-1.5">{r.itemsIn}/{r.itemsOut}</td>
                <td className="price-mono py-1.5">{r.durationMs != null ? `${r.durationMs}ms` : '—'}</td>
                <td className="py-1.5 text-gray-400">{formatDateTime(r.startedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
