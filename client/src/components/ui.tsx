import type { ReactNode } from 'react';

export function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mx-4 my-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      {message}
    </div>
  );
}

export function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
      <span className="text-4xl">{icon}</span>
      <p className="text-sm">{text}</p>
    </div>
  );
}

export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between px-4 pt-4">
      <h1 className="text-xl font-bold text-gray-900">{children}</h1>
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
    outline: 'border border-primary text-primary bg-white active:bg-primary-light',
    ghost: 'text-gray-600 active:bg-gray-100',
    danger: 'border border-red-300 text-red-600 bg-white active:bg-red-50',
  }[variant];
  return (
    <button
      type={type}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-60 ${styles} ${full ? 'w-full' : ''}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
