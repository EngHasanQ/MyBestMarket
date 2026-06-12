import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../context/AuthContext';
import { ShoppingBasket } from 'lucide-react';
import { Button, ErrorBox, Field, inputClass } from '../components/ui';

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isLogin = mode === 'login';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = isLogin
        ? await api.login({ email, password })
        : await api.register({ email, password, name });
      setUser(user);
      navigate(user.cityId == null ? '/select-city' : '/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر الاتصال بالخادم');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="mb-3 flex justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary text-white">
            <ShoppingBasket size={34} strokeWidth={1.8} />
          </span>
        </div>
        <h1 className="text-3xl font-extrabold text-primary">وفّر</h1>
        <p className="mt-1 text-sm text-gray-500">قارن أسعار البقالة في مدينتك ووفّر في كل تسوقة</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        {!isLogin && (
          <Field label="الاسم">
            <input
              data-testid="name-input"
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
            />
          </Field>
        )}
        <Field label="البريد الإلكتروني">
          <input
            data-testid="email-input"
            type="email"
            dir="ltr"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="كلمة المرور">
          <input
            data-testid="password-input"
            type="password"
            dir="ltr"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </Field>
        {error && <ErrorBox message={error} />}
        <Button type="submit" disabled={busy} testId="submit-auth" full>
          {busy ? '...' : isLogin ? 'تسجيل الدخول' : 'إنشاء حساب'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        {isLogin ? (
          <>
            ليس لديك حساب؟{' '}
            <Link to="/register" className="font-bold text-primary">
              سجّل الآن
            </Link>
          </>
        ) : (
          <>
            لديك حساب؟{' '}
            <Link to="/login" className="font-bold text-primary">
              ادخل
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
