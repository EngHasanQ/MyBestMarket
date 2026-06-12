// شارات الحداثة والعرض والسعر التقديري — لا يُعرض سعر بلا شارة حداثة (القسم 2.4)

export function FreshnessBadge({
  label,
  confidence,
  stale,
}: {
  label: string;
  confidence: number;
  stale: boolean;
}) {
  const color = stale
    ? 'bg-gray-100 text-gray-500'
    : confidence >= 90
      ? 'bg-primary-light text-primary'
      : 'bg-blue-50 text-blue-700';
  return (
    <span data-testid="freshness-badge" className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${color}`}>
      {stale ? `قديم — ${label}` : label}
    </span>
  );
}

export function OfferBadge({ endsAt }: { endsAt?: string | null }) {
  return (
    <span className="rounded-full bg-amber-light px-2 py-0.5 text-[11px] font-bold text-amber">
      عرض{endsAt ? ` حتى ${new Date(endsAt).toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' })}` : ''}
    </span>
  );
}

export function EstimatedBadge() {
  return (
    <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-600">
      تقديري
    </span>
  );
}

export function OnlineBasisNote() {
  return (
    <p className="text-[11px] text-gray-400">سعر المتجر الإلكتروني — قد يختلف عن الرف</p>
  );
}
