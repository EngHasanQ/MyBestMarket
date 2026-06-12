// تنسيق الأسعار والتواريخ

export function formatPrice(value: string | number | null | undefined): string {
  if (value == null) return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

/** سعر + عملة للعرض */
export function priceLabel(value: string | number | null | undefined): string {
  const p = formatPrice(value);
  return p === '—' ? p : `${p} ر.س`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('ar-SA', {
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return '';
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ar-SA', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `قبل ${days} يوم`;
}

export function sizeLabel(
  sizeValue: string | number | null | undefined,
  sizeUnit: string | null | undefined,
): string {
  if (sizeValue == null) return '';
  const n = typeof sizeValue === 'number' ? sizeValue : Number(sizeValue);
  if (!Number.isFinite(n)) return '';
  const v = Number.isInteger(n) ? String(n) : String(n);
  return `${v} ${sizeUnit ?? ''}`.trim();
}
