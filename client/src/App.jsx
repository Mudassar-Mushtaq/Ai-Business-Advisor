import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Sidebar from './components/Sidebar/Sidebar';
import Topbar from './components/Topbar/Topbar';
import CommandPalette from './components/CommandPalette/CommandPalette';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Forecasts from './pages/Forecasts';
import Inventory from './pages/Inventory';
import SalesPage from './pages/SalesPage';
import Connections from './pages/Connections';
import Goals from './pages/Goals';
import Briefs from './pages/Briefs';
import Alerts from './pages/Alerts';
import Reorders from './pages/Reorders';

function ProtectedLayout({ children }) {
  const { user, loading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let lastG = 0;
    const handler = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      const editing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(o => !o);
        return;
      }
      if (editing) return;

      if (e.key === '?') { e.preventDefault(); setPaletteOpen(true); return; }

      if (e.key.toLowerCase() === 'g') { lastG = Date.now(); return; }
      if (Date.now() - lastG < 800) {
        const k = e.key.toLowerCase();
        if (k === 'd') { e.preventDefault(); navigate('/dashboard'); }
        else if (k === 'f') { e.preventDefault(); navigate('/forecasts'); }
        else if (k === 'i') { e.preventDefault(); navigate('/inventory'); }
        else if (k === 's') { e.preventDefault(); navigate('/sales'); }
        else if (k === 'u') { e.preventDefault(); navigate('/upload'); }
        else if (k === 'g') { e.preventDefault(); navigate('/goals'); }
        else if (k === 'b') { e.preventDefault(); navigate('/briefs'); }
        else if (k === 'a') { e.preventDefault(); navigate('/alerts'); }
        else if (k === 'r') { e.preventDefault(); navigate('/reorders'); }
        lastG = 0;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:16 }}>
      <div className="spinner spinner-lg" />
      <p style={{ color:'var(--text-secondary)' }}>Loading...</p>
    </div>
  );

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="app-layout">
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="main-content">
        <Topbar
          onMenuClick={() => setMobileOpen(true)}
          onSearchClick={() => setPaletteOpen(true)}
        />
        {children}
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:16 }}>
      <div className="spinner spinner-lg" />
      <p style={{ color:'var(--text-secondary)' }}>Loading...</p>
    </div>
  );

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
      <Route path="/dashboard" element={
        <ProtectedLayout><Dashboard /></ProtectedLayout>
      }/>
      <Route path="/upload" element={
        <ProtectedLayout><Upload /></ProtectedLayout>
      }/>
      <Route path="/forecasts" element={
        <ProtectedLayout><Forecasts /></ProtectedLayout>
      }/>
      <Route path="/inventory" element={
        <ProtectedLayout><Inventory /></ProtectedLayout>
      }/>
      <Route path="/sales" element={
        <ProtectedLayout><SalesPage /></ProtectedLayout>
      }/>
      <Route path="/connections" element={
        <ProtectedLayout><Connections /></ProtectedLayout>
      }/>
      <Route path="/goals" element={
        <ProtectedLayout><Goals /></ProtectedLayout>
      }/>
      <Route path="/briefs" element={
        <ProtectedLayout><Briefs /></ProtectedLayout>
      }/>
      <Route path="/alerts" element={
        <ProtectedLayout><Alerts /></ProtectedLayout>
      }/>
      <Route path="/reorders" element={
        <ProtectedLayout><Reorders /></ProtectedLayout>
      }/>
      <Route path="*" element={<Navigate to="/dashboard" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
              },
              success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
              error:   { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
            }}
          />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
