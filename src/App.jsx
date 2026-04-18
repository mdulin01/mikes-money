import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useMoneyData } from './hooks/useMoneyData';
import { ToastProvider } from './components/Toast';
import LoginScreen from './components/LoginScreen';
import LoadingScreen from './components/LoadingScreen';
import Nav from './components/Nav';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Transactions from './pages/Transactions';
import Budgets from './pages/Budgets';
import CashFlow from './pages/CashFlow';
import Scenarios from './pages/Scenarios';

export default function App() {
  const { user, loading: authLoading, login, logout } = useAuth();
  const money = useMoneyData(user);

  if (authLoading) return <LoadingScreen msg="Loading…" />;
  if (!user) return <LoginScreen onLogin={login} />;
  if (money.loading || !money.data) return <LoadingScreen msg="Loading your money…" />;

  return (
    <BrowserRouter>
      <ToastProvider>
        <div className="min-h-screen bg-slate-900 pb-20 md:pb-0">
          <Nav onLogout={logout} />
          <Routes>
            <Route path="/" element={<Dashboard {...money} />} />
            <Route path="/accounts" element={<Accounts {...money} />} />
            <Route path="/transactions" element={<Transactions {...money} />} />
            <Route path="/budgets" element={<Budgets {...money} />} />
            <Route path="/cashflow" element={<CashFlow {...money} />} />
            <Route path="/scenarios" element={<Scenarios {...money} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </ToastProvider>
    </BrowserRouter>
  );
}
