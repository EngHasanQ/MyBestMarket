import { Suspense, lazy } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BottomNav } from './components/BottomNav';
import { Spinner } from './components/ui';

const AuthPage = lazy(() => import('./pages/AuthPage'));
const SelectCity = lazy(() => import('./pages/SelectCity'));
const Home = lazy(() => import('./pages/Home'));
const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const ProductPage = lazy(() => import('./pages/ProductPage'));
const ListsPage = lazy(() => import('./pages/ListsPage'));
const ListPage = lazy(() => import('./pages/ListPage'));
const ShoppingMode = lazy(() => import('./pages/ShoppingMode'));
const ReceiptPage = lazy(() => import('./pages/ReceiptPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const AdminPage = lazy(() => import('./pages/admin/AdminPage'));

function Protected() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.cityId == null && location.pathname !== '/select-city') {
    return <Navigate to="/select-city" replace />;
  }
  return <Outlet />;
}

function WithNav() {
  return (
    <div className="mx-auto min-h-screen max-w-md pb-20">
      <Outlet />
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route element={<Protected />}>
            <Route path="/select-city" element={<SelectCity />} />
            <Route element={<WithNav />}>
              <Route path="/" element={<Home />} />
              <Route path="/search" element={<ProductsPage />} />
              <Route path="/category/:id" element={<ProductsPage />} />
              <Route path="/product/:id" element={<ProductPage />} />
              <Route path="/lists" element={<ListsPage />} />
              <Route path="/list/:id" element={<ListPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/account" element={<AccountPage />} />
            </Route>
            <Route path="/shopping/:id" element={<ShoppingMode />} />
            <Route path="/receipt/:branchId?" element={<ReceiptPage />} />
            <Route path="/admin/*" element={<AdminPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
