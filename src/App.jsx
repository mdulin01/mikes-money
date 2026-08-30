import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useMoneyData } from './hooks/useMoneyData';
import { ToastProvider } from './components/Toast';
import LoginScreen from './components/LoginScreen';
import LoadingScreen from './components/LoadingScreen';
import Nav from './components/Nav';
import RupertBanner from './components/RupertBanner';
import RefreshControl from './components/RefreshControl';
import InsightButton from './components/Insight';
import { buildInsightContext } from './utils/insightContext';
import Footer from './components/Footer';
import { db } from './firebase-config';
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
import Handoff from './pages/Handoff';
import Business from './pages/Business';
import Rent from './pages/Rent';
import Mortgages from './pages/Mortgages';

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
          <RupertBanner db={db} accent="#fbbf24" />
          <RefreshControl asOf={money.dataAsOf} refreshing={money.refreshing} onRefresh={money.refreshData} extra={<InsightButton getContext={() => buildInsightContext(window.location.pathname, money)} />}>
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
            <Route path="/business" element={<Business {...money} />} />
            <Route path="/rent" element={<Rent {...money} />} />
            <Route path="/mortgages" element={<Mortgages {...money} />} />
            <Route path="/handoff" element={<Handoff {...money} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </RefreshControl>
          <Footer />
        </div>
      </ToastProvider>
    </BrowserRouter>
  );
}
