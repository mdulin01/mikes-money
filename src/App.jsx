import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useMoneyData } from './hooks/useMoneyData';
import { ToastProvider } from './components/Toast';
import LoginScreen from './components/LoginScreen';
import LoadingScreen from './components/LoadingScreen';
import Nav from './components/Nav';
import RefreshControl from './components/RefreshControl';
import Footer from './components/Footer';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Holdings from './pages/Holdings';
import Allocation from './pages/Allocation';
import Retirement from './pages/Retirement';
import Checkup from './pages/Checkup';
import Transactions from './pages/Transactions';
import Tax from './pages/Tax';
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
          <RefreshControl asOf={money.dataAsOf} refreshing={money.refreshing} onRefresh={money.refreshData}>
          <Routes>
            <Route path="/" element={<Dashboard {...money} />} />
            <Route path="/accounts" element={<Accounts {...money} />} />
            <Route path="/holdings" element={<Holdings {...money} />} />
            <Route path="/allocation" element={<Allocation {...money} />} />
            <Route path="/retirement" element={<Retirement {...money} />} />
            <Route path="/checkup" element={<Checkup {...money} />} />
            <Route path="/transactions" element={<Transactions {...money} />} />
            <Route path="/tax" element={<Tax {...money} />} />
            <Route path="/budgets" element={<Budgets {...money} />} />
            <Route path="/cashflow" element={<CashFlow {...money} />} />
            <Route path="/scenarios" element={<Scenarios {...money} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </RefreshControl>
          <Footer />
        </div>
      </ToastProvider>
    </BrowserRouter>
  );
}
