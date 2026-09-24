import { BrowserRouter, Routes, Route, Navigate, Outlet, NavLink } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ToastProvider } from './components/ui/Toast';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { MobileNav } from './components/layout/MobileNav';
import { LayoutDashboard, MessageSquareWarning, Wifi, Bell, Megaphone } from 'lucide-react';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import TenantJoin from './pages/TenantJoin';
import ForgotPassword from './pages/ForgotPassword';
import Profile from './pages/Profile';

// Admin pages
import AdminDashboard from './admin/Dashboard';
import AdminRooms from './admin/Rooms';
import AdminTenants from './admin/Tenants';
import AdminRent from './admin/Rent';
import AdminElectricity from './admin/Electricity';
import AdminComplaints from './admin/Complaints';
import AdminAnnouncements from './admin/Announcements';
import AdminAssets from './admin/Assets';
import AdminSettings from './admin/Settings';
import AdminReports from './admin/Reports';
import AdminAuditLog from './admin/AuditLog';

// Tenant pages
import TenantDashboard from './tenant/Dashboard';
import TenantComplaints from './tenant/Complaints';
import TenantAnnouncements from './tenant/Announcements';
import TenantWiFiContacts from './tenant/WiFiContacts';
import TenantNotifications from './tenant/Notifications';
import { TenantOnboarding } from './tenant/TenantOnboarding';
import { PWAInstallPrompt } from './components/common/PWAInstallPrompt';

// Protected route wrapper
function ProtectedRoute({ allowedRoles }: { allowedRoles?: string[] }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: 'var(--color-bg-base)',
      }}>
        <div className="skeleton" style={{ width: '200px', height: '20px' }} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/tenant'} replace />;
  }

  return <Outlet />;
}

// Admin layout with sidebar + topbar + mobile bottom nav
function AdminLayout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div className="app-main-content">
        <TopBar />
        <main>
          <Outlet />
        </main>
      </div>
      <MobileNav />
      <PWAInstallPrompt />
    </div>
  );
}

// Tenant layout with simple nav + mobile bottom nav
function TenantLayout() {
  const { user, refreshPG } = useAuth();

  const isPendingOnboarding = user?.role === 'tenant' && (!user?.tenant?.room_id || user?.tenant?.status === 'pending');

  if (isPendingOnboarding) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg-base)' }}>
        <TopBar />
        <TenantOnboarding onComplete={() => refreshPG().then(() => window.location.reload())} />
        <PWAInstallPrompt />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg-base)' }}>
      <TopBar />
      <div
        className="tenant-desktop-nav"
        style={{
        backgroundColor: 'var(--color-bg-surface)',
        borderBottom: '1px solid var(--color-border)',
        padding: '0 24px',
        display: 'flex',
        gap: '8px',
        overflowX: 'auto',
      }}>
        <NavLink
          to="/tenant"
          end
          style={({ isActive }) => ({
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            fontSize: 'var(--font-size-sm)',
            fontWeight: isActive ? 600 : 500,
            color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          })}
        >
          <LayoutDashboard size={16} /> My Dashboard
        </NavLink>
        <NavLink
          to="/tenant/announcements"
          style={({ isActive }) => ({
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            fontSize: 'var(--font-size-sm)',
            fontWeight: isActive ? 600 : 500,
            color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          })}
        >
          <Megaphone size={16} /> Notices
        </NavLink>
        <NavLink
          to="/tenant/complaints"
          style={({ isActive }) => ({
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            fontSize: 'var(--font-size-sm)',
            fontWeight: isActive ? 600 : 500,
            color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          })}
        >
          <MessageSquareWarning size={16} /> Complaints
        </NavLink>
        <NavLink
          to="/tenant/wifi"
          style={({ isActive }) => ({
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            fontSize: 'var(--font-size-sm)',
            fontWeight: isActive ? 600 : 500,
            color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          })}
        >
          <Wifi size={16} /> Wi-Fi & Contacts
        </NavLink>
        <NavLink
          to="/tenant/notifications"
          style={({ isActive }) => ({
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            fontSize: 'var(--font-size-sm)',
            fontWeight: isActive ? 600 : 500,
            color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          })}
        >
          <Bell size={16} /> Notifications
        </NavLink>
      </div>
      <main>
        <Outlet />
      </main>
      <MobileNav />
    </div>
  );
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/join/:code" element={<TenantJoin />} />

      {/* Root redirect */}
      <Route path="/" element={
        user ? <Navigate to={user.role === 'admin' ? '/admin' : '/tenant'} replace /> : <Navigate to="/login" replace />
      } />

      {/* Admin routes */}
      <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/rooms" element={<AdminRooms />} />
          <Route path="/admin/tenants" element={<AdminTenants />} />
          <Route path="/admin/rent" element={<AdminRent />} />
          <Route path="/admin/electricity" element={<AdminElectricity />} />
          <Route path="/admin/payments" element={<Navigate to="/admin/rent" replace />} />
          <Route path="/admin/complaints" element={<AdminComplaints />} />
          <Route path="/admin/announcements" element={<AdminAnnouncements />} />
          <Route path="/admin/assets" element={<AdminAssets />} />
          <Route path="/admin/reports" element={<AdminReports />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
          <Route path="/admin/audit-log" element={<AdminAuditLog />} />
          <Route path="/admin/notifications" element={<TenantNotifications />} />
        </Route>
      </Route>

      {/* Tenant routes */}
      <Route element={<ProtectedRoute allowedRoles={['tenant']} />}>
        <Route element={<TenantLayout />}>
          <Route path="/tenant" element={<TenantDashboard />} />
          <Route path="/tenant/complaints" element={<TenantComplaints />} />
          <Route path="/tenant/announcements" element={<TenantAnnouncements />} />
          <Route path="/tenant/wifi" element={<TenantWiFiContacts />} />
          <Route path="/tenant/notifications" element={<TenantNotifications />} />
        </Route>
      </Route>

      {/* Profile route for both roles */}
      <Route element={<ProtectedRoute allowedRoles={['admin', 'tenant']} />}>
        <Route element={user?.role === 'admin' ? <AdminLayout /> : <TenantLayout />}>
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Route>

      {/* 404 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <ToastProvider>
              <AppRoutes />
            </ToastProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
