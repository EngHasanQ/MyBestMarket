import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { AlertCircle, type LucideIcon } from 'lucide-react';

export function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mx-4 my-3 flex items-start gap-2 rounded-(--radius-card) border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <AlertCircle size={18} strokeWidth={1.8} className="mt-0.5 shrink-0" />
      {message}
    </div>
  );
}

/** حالة فارغة: أيقونة lucide + رسالة سطر واحد + فعل أساسي (3.3) */
export function EmptyState({
  icon: Icon,
  text,
  action,
}: {
  icon: LucideIcon;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-light text-primary">
        <Icon size={30} strokeWidth={1.6} />
      </span>
      <p className="text-sm text-ink-2">{text}</p>
      {action}
    </div>
  );
}

export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between px-4 pt-4">
      <h1 className="t-page text-ink">{children}</h1>
      {action}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
  testId,
  full,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
  testId?: string;
  full?: boolean;
}) {
  const styles = {
    primary: 'bg-primary text-white active:bg-primary-dark disabled:bg-gray-300',
    outline: 'border border-primary text-primary bg-surface active:bg-primary-light',
    ghost: 'text-ink-2 active:bg-gray-100',
    danger: 'border border-red-300 text-red-600 bg-surface active:bg-red-50',
  }[variant];
  return (
    <button
      type={type}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-11 items-center justify-center gap-1.5 rounded-(--radius-btn) px-4 text-sm font-bold disabled:opacity-60 ${styles} ${full ? 'w-full' : ''}`}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  'w-full min-h-11 rounded-(--radius-btn) border border-gray-200 bg-surface px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

// ---------- سكيلتون (3.3 — لا قفزات تخطيط) ----------

export function SkeletonCard() {
  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className="skeleton aspect-square w-full" />
      <div className="skeleton h-4 w-4/5" />
      <div className="skeleton h-3 w-1/2" />
      <div className="skeleton h-10 w-full" />
    </div>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 px-4 pb-4">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonRows({ count = 4, height = 72 }: { count?: number; height?: number }) {
  return (
    <div className="flex flex-col gap-2 px-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton w-full" style={{ height }} />
      ))}
    </div>
  );
}

// ---------- توست أسفل الشاشة فوق الشريط (3.3) ----------

interface ToastState {
  show: (message: string, kind?: 'success' | 'error') => void;
}

const ToastContext = createContext<ToastState>({ show: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; kind: 'success' | 'error' } | null>(null);

  const show = useCallback((message: string, kind: 'success' | 'error' = 'success') => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4">
          <div
            data-testid="toast"
            className={`rounded-full px-4 py-2.5 text-sm font-bold text-white shadow-lg ${
              toast.kind === 'success' ? 'bg-ink' : 'bg-red-600'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
