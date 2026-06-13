// شارات الحداثة والعرض والتقديري — خلفيات ملونة ناعمة بلا إيموجي (3.1)
// لا يُعرض سعر بلا شارة حداثة (القسم 2.4)

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
    ? 'bg-gray-500/10 text-ink-2'
    : confidence >= 90
      ? 'bg-primary/10 text-primary'
      : 'bg-sky/10 text-sky';
  return (
    <span data-testid="freshness-badge" className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${color}`}>
      {stale ? `قديم — ${label}` : label}
    </span>
  );
}

export function OfferBadge({ endsAt }: { endsAt?: string | null }) {
  return (
    <span className="rounded-full bg-amber/10 px-2 py-0.5 text-[11px] font-bold text-amber">
      عرض{endsAt ? ` حتى ${new Date(endsAt).toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' })}` : ''}
    </span>
  );
}

export function EstimatedBadge() {
  return (
    <span className="rounded-full bg-sky/10 px-2 py-0.5 text-[11px] font-medium text-sky">
      تقديري
    </span>
  );
}

export function OnlineBasisNote() {
  return <p className="text-[11px] text-gray-400">سعر المتجر الإلكتروني — قد يختلف عن الرف</p>;
}
